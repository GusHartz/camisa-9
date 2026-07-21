using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
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
    private const int BandHeightDip = 88;
    private const int WM_SETTINGCHANGE = 0x001A;
    private const int WM_DISPLAYCHANGE = 0x007E;
    private const int WM_DPICHANGED = 0x02E0;

    private readonly TaskbarWatcher _watcher = new();
    private readonly BandViewModel _vm;
    private readonly BandPoller _poller;
    private readonly BandActions _actions;
    private IntPtr _hwnd;
    private bool _hidden;
    private bool _cleaned;

    /// <summary>Disparado quando o servidor rejeita a sessão (401) — o App reabre o login.</summary>
    public event Action? ReauthRequired;

    public MainWindow(BandApiClient api, BandViewModel vm)
    {
        _vm = vm;
        _poller = new BandPoller(api);
        _actions = new BandActions(api, _poller); // escritas (SPEC-045): POST → reconcilia via o poller
        InitializeComponent();
        DataContext = _vm;
        Width = BandWidthDip;
        Height = BandHeightDip;

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
    }

    // Troca de foreground: reafirma topmost (demote do 24H2), esconde sobre fullscreen (Win+D só detecta).
    private void OnForegroundChanged()
    {
        TopmostStrip.Reassert(_hwnd);
        bool fs = Fullscreen.IsActive(_hwnd);
        if (fs != _hidden)
        {
            _hidden = fs;
            Visibility = fs ? Visibility.Hidden : Visibility.Visible;
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
        return IntPtr.Zero;
    }

    // Unhook + parar o poll. Idempotente. Chamado por Closing e pelas redes de segurança de saída.
    private void Cleanup()
    {
        if (_cleaned)
            return;
        _cleaned = true;
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
        if (e.ChangedButton == MouseButton.Left && e.ClickCount == 2)
            Close();
    }

    // Re-assistir (SPEC-044): um clique simples no "↻" reproduz a última partida de novo. `Handled`
    // impede o borbulhamento para o OnMouseDown (que fecha a faixa no duplo-clique).
    private void OnReWatchClick(object sender, MouseButtonEventArgs e)
    {
        _vm.ReWatch();
        e.Handled = true;
    }

    // --- Escritas de gameplay (SPEC-045): cada gesto dispara uma POST via o BandActions, que reconcilia.
    //     `e.Handled` impede o borbulhamento p/ o OnMouseDown (o duplo-clique que fecha a faixa). ---

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
}
