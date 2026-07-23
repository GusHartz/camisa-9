using System.Collections.Generic;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using BandClient.Api;
using BandClient.Shell;
using BandClient.Shell.Interop;
using BandClient.State;
using BandClient.View;

namespace BandClient;

/// <summary>
/// A faixa (SPEC-042): ancora acima da taskbar na Postura A (topmost flutuante), portando o shell do
/// spike widget-taskbar (SPEC-006), e hospeda o read-model + o poller do `GET /v1/band`. Thin renderer
/// (OP-17): zero regra de jogo. Tamanhos em DIP → px físico no anchor. Duplo-clique fecha (janela
/// não-ativável). No 401 dispara `ReauthRequired` → o App volta ao login.
/// </summary>
public partial class MainWindow : Window
{
    private const int BandWidthDip = 480;

    // SPEC-052: a altura vira um dos 3 níveis de presença (compacta 64 · normal 88 · cena 112) —
    // os múltiplos inteiros do grid lógico de 28 linhas. Lida do `config.json` pelo App.
    private readonly int BandHeightDip;
    private const int WM_SETTINGCHANGE = 0x001A;
    private const int WM_DISPLAYCHANGE = 0x007E;
    private const int WM_DPICHANGED = 0x02E0;

    private readonly TaskbarWatcher _watcher = new();
    private readonly BandViewModel _vm;
    private readonly BandPoller _poller;
    private readonly BandActions _actions;
    private IntPtr _hwnd;
    private bool _hidden; // auto-oculta sobre tela cheia (SPEC-042)
    private bool _userHidden; // o jogador mandou ocultar pelo tray/duplo-clique (segue rodando)
    private TrayIcon? _tray;
    private bool _cleaned;

    /// <summary>Disparado quando o servidor rejeita a sessão (401) — o App reabre o login.</summary>
    public event Action? ReauthRequired;

    public MainWindow(BandApiClient api, BandViewModel vm, int bandHeightDip = 88)
    {
        _vm = vm;
        BandHeightDip = bandHeightDip;
        _poller = new BandPoller(api);
        _actions = new BandActions(api, _poller); // escritas (SPEC-045): POST → reconcilia via o poller
        InitializeComponent();
        DataContext = _vm;
        Width = BandWidthDip;
        Height = BandHeightDip;

        // SPEC-051: o momento de escolha é DESENHADO (ChoiceCard), não montado em XAML — o popup só
        // hospeda. Redesenha quando a oferta OU o desfecho mudam; nada por frame.
        _vm.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(BandViewModel.CurrentMatchChoice) or nameof(BandViewModel.Outcome))
                RenderChoiceCard();
            // SPEC-052: o cenário só repinta quando a CHAVE muda. Assinar a chave (e não o
            // PropertyChanged genérico) é o que segura o orçamento: durante o replay o VM dispara
            // ~2 notificações/s, e nenhuma delas toca a cena.
            else if (e.PropertyName == nameof(BandViewModel.Scene))
                RenderScene();
        };

        _poller.Updated += OnState;
        _poller.Unauthorized += () => ReauthRequired?.Invoke();
        _poller.RateLimited += sec => _vm.SetStatus($"limite atingido; retoma em {sec}s");
        _poller.Failed += msg => _vm.SetStatus(msg);
        _actions.Feedback += msg => _vm.SetActionFeedback(msg);
        _actions.Unauthorized += () => ReauthRequired?.Invoke(); // 401 numa escrita → volta ao login

        SourceInitialized += OnSourceInitialized;
        Loaded += (_, _) => _poller.Start();
        Closing += (_, _) => Cleanup();
    }

    private void OnState(BandState s) => _vm.Apply(s, s.ServerTime?.BrtHour ?? 0, s.ServerTime?.BrtMinute ?? 0);

    private void OnSourceInitialized(object? sender, EventArgs e)
    {
        _hwnd = new WindowInteropHelper(this).Handle;
        HwndSource.FromHwnd(_hwnd)!.AddHook(WndProc);
        RegisterExitSafetyNets();
        TopmostStrip.Apply(_hwnd); // Postura A: WS_EX_TOPMOST|TOOLWINDOW|NOACTIVATE no Win32
        ReAnchor();
        _tray = new TrayIcon(_hwnd);
        _tray.Add("NEXT GOAT — clique p/ mostrar/ocultar");
        _watcher.ForegroundChanged += OnForegroundChanged;
        _watcher.Start();
    }

    // DIP → px físico pelo DPI do monitor atual (a geometria da taskbar é px físico, PerMonitorV2).
    private (int W, int H) Physical()
    {
        DpiScale dpi = VisualTreeHelper.GetDpi(this);
        return ((int)Math.Round(BandWidthDip * dpi.DpiScaleX), (int)Math.Round(BandHeightDip * dpi.DpiScaleY));
    }

    private void ReAnchor()
    {
        (int w, int h) = Physical();
        TaskbarAnchor.Anchor a = TaskbarAnchor.Compute(_hwnd, w, h);
        NativeMethods.SetWindowPos(
            _hwnd,
            Win.HWND_TOPMOST,
            a.Band.Left,
            a.Band.Top,
            a.Band.Width,
            a.Band.Height,
            Win.SWP_NOACTIVATE
        );
        BringPopupsAboveBand(); // se re-ancorou com um popup aberto, devolve-o ao topo
    }

    // Troca de foreground: reafirma topmost (demote do 24H2), esconde sobre fullscreen (Win+D só detecta).
    private void OnForegroundChanged()
    {
        TopmostStrip.Reassert(_hwnd);
        BringPopupsAboveBand(); // a faixa acabou de pular na frente; devolve os popups abertos ao topo
        bool fs = Fullscreen.IsActive(_hwnd);
        if (fs != _hidden)
        {
            _hidden = fs;
            ApplyVisibility();
        }
    }

    // A faixa é TOPMOST e se RE-AFIRMA no `OnForegroundChanged` a cada mudança de foco no sistema
    // (Postura A) — então um Popup (decisão/loja/escolha) que abre acaba COBERTO pela faixa e some.
    // Fix: (1) ao abrir, empurra o popup para cima da faixa; (2) SEMPRE que a faixa se re-afirma
    // topmost, re-traz os popups abertos à frente (`BringPopupsAboveBand`). Sem o (2) a faixa
    // ganhava a corrida logo depois do (1).
    private void OnPopupOpened(object? sender, EventArgs e)
    {
        if (sender is System.Windows.Controls.Primitives.Popup p)
            RaisePopup(p);
    }

    // Re-traz cada popup ABERTO para cima da faixa. Chamado após a faixa re-afirmar seu topmost.
    private void BringPopupsAboveBand()
    {
        RaisePopup(MenuPopup);
        RaisePopup(DecisionPopup);
        RaisePopup(ShopPopup);
        RaisePopup(ChoicePopup);
    }

    private void RaisePopup(System.Windows.Controls.Primitives.Popup p)
    {
        if (!p.IsOpen || p.Child is not { } child)
            return;
        // Imediato + deferido: no `Opened` o HWND do popup pode ainda não existir; o deferido pega.
        Raise();
        Dispatcher.BeginInvoke(new Action(Raise), DispatcherPriority.Loaded);

        void Raise()
        {
            if (PresentationSource.FromVisual(child) is HwndSource src && src.Handle != IntPtr.Zero)
                NativeMethods.SetWindowPos(
                    src.Handle,
                    Win.HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    Win.SWP_NOMOVE | Win.SWP_NOSIZE | Win.SWP_NOACTIVATE
                );
        }
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_DPICHANGED)
        {
            // Deferir: o handler de DPI do WPF roda depois e sobrescreveria um ReAnchor síncrono.
            Dispatcher.BeginInvoke(new Action(ReAnchor), DispatcherPriority.Background);
        }
        else if (msg is WM_DISPLAYCHANGE or WM_SETTINGCHANGE)
        {
            ReAnchor();
        }
        else if (msg == Win.WM_TRAYICON)
        {
            // O clique no ícone da bandeja chega no WORD baixo do lParam.
            int evt = (int)(lParam.ToInt64() & 0xFFFF);
            if (evt == Win.WM_LBUTTONUP)
                ToggleUserHidden(); // esquerdo: mostra/oculta
            else if (evt == Win.WM_RBUTTONUP)
                OnTrayMenu(); // direito: menu (Mostrar/Ocultar · Sair)
        }
        return IntPtr.Zero;
    }

    // A faixa é VISÍVEL só quando o jogador não a ocultou E não há tela cheia por cima. O processo
    // segue rodando em qualquer caso (poll/presença) — ocultar nunca mata o app.
    private void ApplyVisibility() =>
        Visibility = _userHidden || _hidden ? Visibility.Hidden : Visibility.Visible;

    private void ToggleUserHidden()
    {
        _userHidden = !_userHidden;
        ApplyVisibility();
    }

    private void OnTrayMenu()
    {
        switch (_tray?.ShowMenu(visible: !_userHidden && !_hidden))
        {
            case TrayIcon.CmdToggle:
                ToggleUserHidden();
                break;
            case TrayIcon.CmdQuit:
                Close(); // "Sair": o fecho REAL (o duplo-clique agora só oculta)
                break;
        }
    }

    // Unhook + parar o poll. Idempotente. Chamado por Closing e pelas redes de segurança de saída.
    private void Cleanup()
    {
        if (_cleaned)
            return;
        _cleaned = true;
        _tray?.Remove(); // tira o ícone da bandeja (senão fica um fantasma até passar o mouse)
        _watcher.Dispose(); // o unhook nativo PRIMEIRO — precisa rodar mesmo no ProcessExit
        try
        {
            _actions.Stop(); // cancela escritas em voo → não coordenam após o teardown (SPEC-045)
            _vm.StopReplay(); // para o replay (senão o timer segue tocando no reauth — MAJOR da revisão)
            _poller.Stop(); // DispatcherTimer é thread-afim: no ProcessExit (outra thread) pode lançar
        }
        catch
        {
            // best-effort: o unhook já rodou; timers que não param no teardown são inócuos
        }
    }

    // TerminateProcess (Stop-Process -Force) NÃO é interceptável; estes cobrem os caminhos que são.
    private void RegisterExitSafetyNets()
    {
        if (Application.Current is { } app)
        {
            app.SessionEnding += (_, _) => Cleanup();
            app.DispatcherUnhandledException += (_, _) => Cleanup();
        }
        AppDomain.CurrentDomain.ProcessExit += (_, _) => Cleanup();
    }

    protected override void OnMouseDown(MouseButtonEventArgs e)
    {
        base.OnMouseDown(e);
        // Duplo-clique agora OCULTA (não fecha): evita o fecha-sem-querer numa faixa que se clica
        // muito. O fecho de verdade fica no "Sair" do menu da bandeja.
        if (e.ChangedButton == MouseButton.Left && e.ClickCount == 2)
            ToggleUserHidden();
    }

    // Re-assistir (SPEC-044): um clique simples no "↻" reproduz a última partida de novo. `Handled`
    // impede o borbulhamento para o OnMouseDown (que oculta a faixa no duplo-clique).
    private void OnReWatchClick(object sender, MouseButtonEventArgs e)
    {
        _vm.ReWatch();
        e.Handled = true;
    }

    // Compartilhar o card de partida (SPEC-049): gera a imagem, copia p/ o clipboard e salva o PNG.
    // `Handled` impede o borbulhamento p/ o OnMouseDown (o duplo-clique que oculta a faixa).
    private void OnShareCardClick(object sender, MouseButtonEventArgs e)
    {
        _vm.ShareMatchCard();
        e.Handled = true;
    }

    // --- Escritas de gameplay (SPEC-045): cada gesto dispara uma POST via o BandActions, que reconcilia.
    //     `e.Handled` impede o borbulhamento p/ o OnMouseDown (o duplo-clique que oculta a faixa). ---

    // Distribui 1 ponto no atributo do chip (Tag = 'fisico'|'tecnico'|'tatico'|'mental').
    private void OnSpendClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        if ((sender as FrameworkElement)?.Tag is string attr)
            _ = _actions.SpendTrainingAsync(attr);
    }

    private void OnDecisionsClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        _vm.ToggleDecision();
    }

    private void OnShopClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        _vm.ToggleShop();
    }

    // MENU (SPEC-054 fatia 1): abre/fecha o stub "Central da Carreira — em breve".
    private void OnMenuClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        _vm.ToggleMenu();
    }

    // Regen é AÇÃO DESTRUTIVA (encerra a carreira na virada) → confirmação em 2 passos: armar → confirmar.
    private void OnRegenArmClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        _vm.ArmRegen(); // NÃO posta — só arma a confirmação
    }

    private void OnRegenConfirmClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        _vm.DisarmRegen();
        _ = _actions.RegenAsync();
    }

    private void OnRegenCancelClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        _vm.DisarmRegen();
    }

    // Uma opção da decisão corrente (DataContext = a BandDecisionOption; o id da decisão vem do VM).
    private void OnDecisionOptionClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        if (
            _vm.CurrentDecision is { } d
            && (sender as FrameworkElement)?.DataContext is BandDecisionOption opt
        )
            _ = _actions.AnswerDecisionAsync(d.Id, opt.Id);
    }

    // Comprar um item da loja (só as linhas compráveis são hit-testáveis; o guard é defensivo).
    private void OnBuyClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        if ((sender as FrameworkElement)?.DataContext is ShopRow row && row.CanBuy)
            _ = _actions.PurchaseAsync(row.Id);
    }

    // O cenário da faixa (SPEC-052). Composto UMA vez por chave e cacheado — a mesma cena reaparece
    // instantaneamente ao voltar (ex.: alternar entre fases ao longo do dia). O dicionário é
    // pequeno por construção: 3 fases × 2 casas × pré/pós × altura.
    private readonly Dictionary<SceneKey, BitmapSource> _sceneCache = new();

    private void RenderScene()
    {
        SceneKey key = _vm.Scene;
        if (!_sceneCache.TryGetValue(key, out BitmapSource? bmp))
        {
            bmp = SceneRenderer.Compose(key);
            _sceneCache[key] = bmp;
        }
        SceneLayer.Source = bmp;
    }

    // O conteúdo do popup do momento (SPEC-051): DESFECHO tem precedência sobre a oferta (um evento
    // por vez); sem nenhum dos dois, esvazia. O desenho vive em `View/ChoiceCard.cs`.
    private void RenderChoiceCard()
    {
        if (_vm.Outcome is { } o)
        {
            ChoiceHost.Content = ChoiceCard.BuildOutcome(
                o.Minute,
                o.Result,
                o.Title,
                o.Body,
                o.MoralDelta
            );
            return;
        }
        ChoiceHost.Content =
            _vm.CurrentMatchChoice is { } c
                ? ChoiceCard.BuildOffer(c, _vm.ChoiceOptions, OnMatchChoiceOptionClick)
                : null;
    }

    // Uma opção do momento de escolha da partida (SPEC-050). O contexto (round + templateId) vem do
    // VM; otimista: fecha o overlay já (MarkChoiceAnswered) e a reconciliação confirma com o Result.
    private void OnMatchChoiceOptionClick(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        if (
            _vm.ChoiceContext() is { } ctx
            && (sender as FrameworkElement)?.DataContext is ChoiceOptionRow opt
        )
        {
            _vm.MarkChoiceAnswered(ctx.TemplateId);
            _ = AnswerChoiceAsync(ctx.Round, ctx.TemplateId, opt.Id);
        }
    }

    // Fire-and-forget SEGURO (nunca lança — lição SPEC-042): em falha LOCAL (rede/429/5xx) o
    // otimista é DESFEITO — a escolha volta a ser re-oferecível num ReWatch (senão um blip de rede
    // mataria a agência do momento até a conservadora de D+1). Conflito (409) mantém: o servidor decidiu.
    private async Task AnswerChoiceAsync(int round, string templateId, string optionId)
    {
        try
        {
            WriteResult r = await _actions.AnswerMatchChoiceAsync(round, templateId, optionId);
            if (r is WriteResult.Network or WriteResult.RateLimited or WriteResult.ServerError)
                _vm.UnmarkChoice(templateId);
        }
        catch
        {
            // BandActions nunca lança; o catch é o cinto do fire-and-forget.
        }
    }
}
