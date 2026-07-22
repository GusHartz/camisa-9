using System.ComponentModel;
using System.Globalization;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Windows.Media;
using BandClient.Api;
using BandClient.State;

namespace BandClient.View;

/// <summary>
/// O read-model da faixa (SPEC-042). Espelha o `BandState` em propriedades escalares que o XAML liga;
/// `Apply` faz DIFF-update (só dispara PropertyChanged no que mudou) — a árvore visual NUNCA é
/// reconstruída a cada poll (custo de CPU). Render ESTRUTURAL: texto/números/blocos de cor, zero arte
/// (deferida — os assets não estão no repo). `null` do contrato = "não se aplica" → seção escondida.
/// </summary>
public sealed class BandViewModel : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    private string _statusLine = "conectando…";
    private string _phase = "";
    private Brush _phaseBrush = NeutralBrush;
    private string _athleteLine = "";
    private int _forma;
    private int _moral;
    private string _trainingLine = "";
    private string _homeLine = "";
    private string _injuryLine = "";
    private bool _injuryVisible;
    private string _clubLine = "";
    private string _matchLine = "";
    private string _squadLine = "";
    private string _decisionsLine = "";
    private bool _queueVisible;
    private string _queueLine = "";
    private Brush _skinBrush = NeutralBrush;
    private Brush _hairBrush = NeutralBrush;
    private Brush _kitPrimaryBrush = NeutralBrush;
    private Brush _kitSecondaryBrush = NeutralBrush;
    private bool _kitVisible;
    private readonly MatchReplay _replay;
    private string? _lastReplayKey; // dedup do auto-play: "seasonId:round" da última partida tocada
    private IReadOnlyList<BandGoal>? _lastGoals; // a timeline p/ o re-assistir
    private bool _replayActive;
    private bool _replayAvailable;
    private double _myGoalFlashOpacity;
    private double _theirGoalFlashOpacity;
    private BandClub? _lastClub; // o último clube do poll — p/ restaurar o MatchLine ao fim do replay

    // Affordances de ESCRITA (SPEC-045): o estado que gateia os gestos + o feedback transitório.
    private int _freePoints;
    private bool _trainingActionable;
    private int _fisico,
        _tecnico,
        _tatico,
        _mental;
    private BandDecision? _currentDecision;
    private bool _hasDecisions;
    private bool _decisionOpen;
    private IReadOnlyList<ShopRow> _shopItems = Array.Empty<ShopRow>();
    private bool _hasCatalog;
    private bool _shopOpen;
    private bool _canRegen;
    private bool _regenArmed; // 2 passos: o 1º clique arma, o 2º confirma (ação destrutiva)
    private bool _regenAvailable;
    private bool _regenConfirming;
    private string _actionFeedback = "";

    // Card de partida (SPEC-049): o modelo projetado do jogo do dia (null = sem jogo com nota) + a dica
    // de render do affordance "compartilhar". O modelo é montado no Apply e consumido no gesto.
    private MatchCardModel? _cardModel;
    private bool _cardAvailable;

    // Escolhas na partida (SPEC-050): a apresentação AO VIVO deriva do Frame do replay (SPEC-044) —
    // ZERO timer novo. Fora do replay NÃO há affordance (decisão do founder): o overlay só abre via Frame.
    private BandMatchChoice? _currentMatchChoice; // o momento no overlay (null = fechado/nenhum)
    private bool _choiceOpen;
    private IReadOnlyList<ChoiceOptionRow> _choiceOptions = Array.Empty<ChoiceOptionRow>();
    private IReadOnlyList<BandMatchChoice> _replayChoices = Array.Empty<BandMatchChoice>(); // as NÃO-respondidas, por minuto
    private int _nextChoiceIdx;
    private IReadOnlyList<BandMatchChoice>? _lastChoices; // a oferta fresca da última partida — p/ o ReWatch
    private readonly HashSet<string> _answeredLocal = new(); // respondidas AQUI (otimista, até o Apply anotar)
    private readonly HashSet<string> _pendingOutcome = new(); // respondidas aguardando o Result anotado (feedback)
    private int _lastRound; // o round mostrado (ApplyClub)
    private int _choicesRound; // o round da OFERTA apresentada (capturado na apresentação, NÃO no clique —
    // um poll que avance _lastRound com o overlay aberto responderia a oferta errada; MAJOR da revisão)
    private ChoiceOutcomeRow? _outcome; // o desfecho em cartaz (SPEC-051)

    public string StatusLine { get => _statusLine; private set => Set(ref _statusLine, value); }
    public string Phase { get => _phase; private set => Set(ref _phase, value); }
    public Brush PhaseBrush { get => _phaseBrush; private set => Set(ref _phaseBrush, value); }
    public string AthleteLine { get => _athleteLine; private set => Set(ref _athleteLine, value); }
    public int Forma { get => _forma; private set => Set(ref _forma, value); }
    public int Moral { get => _moral; private set => Set(ref _moral, value); }
    public string TrainingLine { get => _trainingLine; private set => Set(ref _trainingLine, value); }
    public string HomeLine { get => _homeLine; private set => Set(ref _homeLine, value); }
    public string InjuryLine { get => _injuryLine; private set => Set(ref _injuryLine, value); }
    public bool InjuryVisible { get => _injuryVisible; private set => Set(ref _injuryVisible, value); }
    public string ClubLine { get => _clubLine; private set => Set(ref _clubLine, value); }
    public string MatchLine { get => _matchLine; private set => Set(ref _matchLine, value); }
    public string SquadLine { get => _squadLine; private set => Set(ref _squadLine, value); }
    public string DecisionsLine { get => _decisionsLine; private set => Set(ref _decisionsLine, value); }
    public bool QueueVisible { get => _queueVisible; private set => Set(ref _queueVisible, value); }
    public string QueueLine { get => _queueLine; private set => Set(ref _queueLine, value); }

    // --- Affordances de escrita (SPEC-045) ---
    public int FreePoints { get => _freePoints; private set => Set(ref _freePoints, value); }
    public bool TrainingActionable { get => _trainingActionable; private set => Set(ref _trainingActionable, value); }
    public int Fisico { get => _fisico; private set => Set(ref _fisico, value); }
    public int Tecnico { get => _tecnico; private set => Set(ref _tecnico, value); }
    public int Tatico { get => _tatico; private set => Set(ref _tatico, value); }
    public int Mental { get => _mental; private set => Set(ref _mental, value); }
    public BandDecision? CurrentDecision { get => _currentDecision; private set => Set(ref _currentDecision, value); }
    public bool HasDecisions { get => _hasDecisions; private set => Set(ref _hasDecisions, value); }
    public bool DecisionOpen { get => _decisionOpen; private set => Set(ref _decisionOpen, value); }
    public IReadOnlyList<ShopRow> ShopItems { get => _shopItems; private set => Set(ref _shopItems, value); }
    public bool HasCatalog { get => _hasCatalog; private set => Set(ref _hasCatalog, value); }
    public bool ShopOpen { get => _shopOpen; private set => Set(ref _shopOpen, value); }

    public bool CanRegen
    {
        get => _canRegen;
        private set
        {
            if (Set(ref _canRegen, value))
                UpdateRegenAffordance();
        }
    }
    public bool RegenArmed
    {
        get => _regenArmed;
        private set
        {
            if (Set(ref _regenArmed, value))
                UpdateRegenAffordance();
        }
    }

    // As duas faces da affordance de regen (evita compound-binding no XAML): "renascer carreira"
    // (elegível, não armado) e "confirmar? sim/não" (armado). Derivadas de CanRegen × RegenArmed.
    public bool RegenAvailable { get => _regenAvailable; private set => Set(ref _regenAvailable, value); }
    public bool RegenConfirming { get => _regenConfirming; private set => Set(ref _regenConfirming, value); }

    public string ActionFeedback { get => _actionFeedback; private set => Set(ref _actionFeedback, value); }

    /// <summary>Dica de render (SPEC-049): há um jogo publicado COM nota → mostrar o "compartilhar card".</summary>
    public bool CardAvailable { get => _cardAvailable; private set => Set(ref _cardAvailable, value); }

    /// <summary>Feedback transitório de uma ação (o BandActions chama). Persiste até a próxima ação.</summary>
    public void SetActionFeedback(string msg) => ActionFeedback = msg;

    /// <summary>Gera o card do jogo do dia, copia p/ o clipboard e salva o PNG (SPEC-049). No-op se não
    /// há jogo com nota (o affordance é gateado por CardAvailable, mas o guard é defensivo).</summary>
    public void ShareMatchCard()
    {
        if (_cardModel is { } model)
            ActionFeedback = MatchCardShare.Share(model);
    }

    // --- Escolhas na partida (SPEC-050): o overlay dirigido pelo replay. ---

    /// <summary>O momento de escolha corrente do replay (null = nenhum). Só o Frame o abre;
    /// re-atribuir regenera as linhas de opção (ChoiceOptions).</summary>
    public BandMatchChoice? CurrentMatchChoice
    {
        get => _currentMatchChoice;
        private set
        {
            if (Set(ref _currentMatchChoice, value))
                ChoiceOptions =
                    value is null
                        ? Array.Empty<ChoiceOptionRow>()
                        : value.Options is null
                            ? Array.Empty<ChoiceOptionRow>()
                            : value.Options.Where(o => o is not null).Select(ToChoiceRow).ToList();
        }
    }

    public bool ChoiceOpen { get => _choiceOpen; private set => Set(ref _choiceOpen, value); }

    /// <summary>As opções do momento corrente prontas p/ render (rótulo + marcador ⚡ATTR se arriscada).</summary>
    public IReadOnlyList<ChoiceOptionRow> ChoiceOptions
    {
        get => _choiceOptions;
        private set => Set(ref _choiceOptions, value);
    }

    /// <summary>O contexto do POST de resposta (o round da OFERTA apresentada + templateId corrente);
    /// null = sem momento. O round é o capturado na apresentação — nunca o vivo do poll.</summary>
    public (int Round, string TemplateId)? ChoiceContext() =>
        _currentMatchChoice is { } ch ? (_choicesRound, ch.TemplateId) : null;

    /// <summary>Marca o momento como respondido LOCALMENTE (otimista): fecha o overlay, impede a
    /// re-oferta num ReWatch antes da reconciliação chegar e agenda o feedback do desfecho (o Apply
    /// casa o `Result` anotado pelo conjunto de pendentes — sobrevive à troca do momento corrente).</summary>
    public void MarkChoiceAnswered(string templateId)
    {
        _answeredLocal.Add(templateId);
        _pendingOutcome.Add(templateId);
        ChoiceOpen = false;
    }

    /// <summary>Desfaz o otimista quando o POST falhou LOCALMENTE (rede/429/5xx): a escolha volta a
    /// ser re-oferecível num ReWatch — senão um blip de rede mataria a agência do momento até a
    /// conservadora de D+1. Conflito (409) NÃO desfaz: o servidor decidiu.</summary>
    public void UnmarkChoice(string templateId)
    {
        _answeredLocal.Remove(templateId);
        _pendingOutcome.Remove(templateId);
    }

    /// <summary>Abre/fecha o painel de decisões (só abre se há decisão pendente).</summary>
    public void ToggleDecision() => DecisionOpen = !_decisionOpen && _hasDecisions;

    /// <summary>Abre/fecha a loja (só abre se há catálogo — i.e., o atleta tem clube/estado).</summary>
    public void ToggleShop() => ShopOpen = !_shopOpen && _hasCatalog;

    /// <summary>1º passo do regen (ação destrutiva): arma a confirmação — NÃO posta ainda.</summary>
    public void ArmRegen() => RegenArmed = true;

    /// <summary>Cancela/consome a confirmação de regen.</summary>
    public void DisarmRegen() => RegenArmed = false;

    private void UpdateRegenAffordance()
    {
        RegenAvailable = _canRegen && !_regenArmed;
        RegenConfirming = _canRegen && _regenArmed;
    }

    // Avatar/kit em blocos de cor procedurais derivados dos índices (o escopo D da SPEC-042; a arte
    // real — avatar em camadas por paleta indexada — é fatia futura).
    public Brush SkinBrush { get => _skinBrush; private set => Set(ref _skinBrush, value); }
    public Brush HairBrush { get => _hairBrush; private set => Set(ref _hairBrush, value); }
    public Brush KitPrimaryBrush { get => _kitPrimaryBrush; private set => Set(ref _kitPrimaryBrush, value); }
    public Brush KitSecondaryBrush { get => _kitSecondaryBrush; private set => Set(ref _kitSecondaryBrush, value); }
    public bool KitVisible { get => _kitVisible; private set => Set(ref _kitVisible, value); }

    /// <summary>Aplica um snapshot fresco. Null-guarda tudo — um payload torto nunca derruba a faixa.</summary>
    public void Apply(BandState s, int brtHour, int brtMinute)
    {
        Phase = s.Phase ?? "";
        PhaseBrush = BrushFor(s.Phase);

        BandAthlete? a = s.Athlete;
        AthleteLine =
            a is null
                ? "—"
                : $"#{a.Number} {a.Name} · {a.Position} · OVR {a.Overall}{(a.Available ? "" : " · lesionado")}";

        Forma = Clamp(s.Bars?.Forma ?? 0);
        Moral = Clamp(s.Bars?.Moral ?? 0);

        BandTraining? t = s.Training;
        TrainingLine =
            t is null
                ? ""
                : t.FreePoints > 0
                    ? $"Treino: {t.FreePoints} ponto(s) para distribuir  ·  XP {t.TrainingXp}/{t.NextThreshold}"
                    : $"Treino: XP {t.TrainingXp}/{t.NextThreshold}";
        // affordance de treino (SPEC-045): os 4 botões aparecem quando há ponto para distribuir.
        FreePoints = t?.FreePoints ?? 0;
        TrainingActionable = FreePoints > 0;
        BandAttributes? attrs = t?.Attributes;
        Fisico = attrs?.Fisico ?? 0;
        Tecnico = attrs?.Tecnico ?? 0;
        Tatico = attrs?.Tatico ?? 0;
        Mental = attrs?.Mental ?? 0;

        BandHome? h = s.Home;
        HomeLine =
            h is null
                ? ""
                : $"R$ {h.Balance.ToString("N0", Culture)}  ·  moradia nível {h.LifestyleTier}";

        BandInjury? inj = s.Injury;
        InjuryVisible = inj is not null;
        InjuryLine = inj is null ? "" : $"Lesão {inj.Severity} · {inj.Phase} · faltam {inj.DaysLeft}d";

        ApplyClub(s.Club);
        ApplyQueue(s.Queue, s.Club);
        MaybeAutoPlay(s.Club);
        ReconcileMatchChoice(s.Club); // SPEC-050: fecha o momento que chegou ANOTADO (nunca reseta um em curso)

        // Card de partida (SPEC-049): projeta o jogo do dia (null = pré-jogo / sem nota) → gateia o
        // affordance "compartilhar". O modelo fica guardado p/ o gesto (ShareMatchCard).
        _cardModel = MatchCardModel.From(s);
        CardAvailable = _cardModel is not null;

        int squad = s.Squad?.Count ?? 0;
        string me = MeOf(s);
        SquadLine = squad == 0 ? "" : $"Elenco {squad}{me}";

        int pending = s.PendingDecisions;
        DecisionsLine = pending > 0 ? $"Decisões pendentes: {pending}" : "";

        // affordances de decisão/loja/regen (SPEC-045). A lista é a autoridade; se esvazia, fecha o
        // painel. Filtra elementos null (JSON hostil) antes de mapear — o mesmo rigor que MeOf aplica
        // ao Squad; senão uma lista com um null aborta o Apply no meio (render parcial).
        IReadOnlyList<BandDecision> decisions = (s.Decisions ?? Array.Empty<BandDecision>())
            .Where(d => d is not null)
            .ToList();
        HasDecisions = decisions.Count > 0;
        BandDecision? next = HasDecisions ? decisions[0] : null;
        // Diff por IDENTIDADE (Id): o record BandDecision compara Options por REFERÊNCIA, então cada
        // poll criaria uma decisão "diferente" e regeneraria os chips de opção (churn — um clique sob o
        // cursor se perderia). Só re-atribui quando o Id muda (a próxima decisão / fim).
        if (next?.Id != _currentDecision?.Id)
            CurrentDecision = next;
        if (!HasDecisions)
            DecisionOpen = false;

        IReadOnlyList<BandPurchase> catalog = (s.Home?.Catalog ?? Array.Empty<BandPurchase>())
            .Where(p => p is not null)
            .ToList();
        HasCatalog = catalog.Count > 0;
        ShopItems = catalog.Count == 0 ? Array.Empty<ShopRow>() : catalog.Select(ToShopRow).ToList();
        if (!HasCatalog)
            ShopOpen = false;

        CanRegen = s.Athlete?.CanRegen ?? false;
        if (!CanRegen)
            RegenArmed = false; // deixou de ser elegível → desarma qualquer confirmação pendente

        // Blocos de cor do avatar/kit (índices → paleta estrutural).
        BandAppearance? ap = a?.Appearance;
        SkinBrush = IndexBrush(ap?.SkinTone ?? 0);
        HairBrush = IndexBrush(ap?.HairColor ?? 0);
        BandKit? kit = s.Club?.Kit;
        KitVisible = kit is not null;
        KitPrimaryBrush = kit is null ? NeutralBrush : IndexBrush(kit.PrimaryColor);
        KitSecondaryBrush = kit is null ? NeutralBrush : IndexBrush(kit.SecondaryColor);

        StatusLine = $"atualizado {brtHour:D2}:{brtMinute:D2} BRT";
    }

    public void SetStatus(string line) => StatusLine = line;

    // --- Replay da partida (SPEC-044): a fatia 1 (SPEC-043) deu a timeline; aqui ela é REPRODUZIDA. ---

    public BandViewModel(int replayWatchSeconds = 240)
    {
        _replay = new MatchReplay(replayWatchSeconds);
        _replay.Frame += OnReplayFrame;
        _replay.Ended += OnReplayEnded;
    }

    /// <summary>Para o replay no fechamento da faixa — evita o timer ZUMBI tocando no reauth (o app
    ///  não morre no 401; a fatia 2 senão churnaria PropertyChanged num VM órfão). Além do timer,
    ///  zera o estado de escolha (SPEC-050) — todo estado novo de replay morre aqui.</summary>
    public void StopReplay()
    {
        _replay.Stop();
        _replayChoices = Array.Empty<BandMatchChoice>();
        _nextChoiceIdx = 0;
        ChoiceOpen = false;
        CurrentMatchChoice = null;
        Outcome = null;
    }

    public bool ReplayActive
    {
        get => _replayActive;
        private set => Set(ref _replayActive, value);
    }
    public bool ReplayAvailable
    {
        get => _replayAvailable;
        private set => Set(ref _replayAvailable, value);
    }
    public double MyGoalFlashOpacity
    {
        get => _myGoalFlashOpacity;
        private set => Set(ref _myGoalFlashOpacity, value);
    }
    public double TheirGoalFlashOpacity
    {
        get => _theirGoalFlashOpacity;
        private set => Set(ref _theirGoalFlashOpacity, value);
    }

    /// <summary>Reproduz a última partida liquidada de novo (o "re-assistir"), ignorando o dedup.</summary>
    public void ReWatch()
    {
        if (_lastGoals is { } goals)
        {
            // Recaptura as escolhas (SPEC-050): SÓ as não-respondidas re-oferecem — as respondidas
            // vêm ANOTADAS do servidor; as respondidas agora (sem anotação ainda) caem no _answeredLocal.
            BeginChoicePresentation(_lastChoices);
            _replay.Play(goals);
        }
    }

    // Durante o replay, o MatchLine é DIRIGIDO pelo motor (relógio + placar que sobe); o poll (Apply)
    // não o sobrescreve (guard em ApplyClub). O flash marca o gol recém-ocorrido.
    private void OnReplayFrame(ReplayFrame f)
    {
        ReplayActive = _replay.IsPlaying;
        MatchLine = $"⏱ {f.Minute}'  {f.MyGoals}–{f.TheirGoals}";
        MyGoalFlashOpacity = f.GoalNow && f.GoalIsMine ? 1 : 0;
        TheirGoalFlashOpacity = f.GoalNow && !f.GoalIsMine ? 1 : 0;
        // Escolhas (SPEC-050): o momento abre NO MINUTO dele. `>=` porque o relógio PULA minutos; a
        // PRÓXIMA substitui uma anterior não-respondida (o momento passou). UMA por frame (`if`, não
        // `while`): duas no MESMO minuto abrem em frames consecutivos — a primeira ganha ~2,7s de
        // tela em vez de ser substituída irrespondível no mesmo frame (MINOR da revisão).
        if (_nextChoiceIdx < _replayChoices.Count && f.Minute >= _replayChoices[_nextChoiceIdx].Minute)
        {
            Outcome = null; // um evento por vez: o desfecho anterior sai de cena (SPEC-051)
            CurrentMatchChoice = _replayChoices[_nextChoiceIdx];
            ChoiceOpen = true;
            _nextChoiceIdx++;
        }
    }

    // Fim natural do replay (90'): volta ao placar final ESTÁTICO e apaga o flash — senão o ⚽ de um
    // gol no 90' ficaria preso e o MatchLine preso em "⏱ 90' x–y" até o próximo poll (~60s).
    private void OnReplayEnded()
    {
        ReplayActive = false;
        MyGoalFlashOpacity = 0;
        TheirGoalFlashOpacity = 0;
        // O replay acabou → o overlay de escolha fecha junto (o momento é DO replay, SPEC-050).
        ChoiceOpen = false;
        CurrentMatchChoice = null;
        Outcome = null;
        ApplyClub(_lastClub);
    }

    // Auto-play 1× quando uma partida NOVA (chave seasonId:round) liquida com gols. O dedup impede
    // re-disparar a cada poll de 60s. `Goals` presente (mesmo `[]`, um 0-0) = liquidada.
    private void MaybeAutoPlay(BandClub? club)
    {
        BandMatch? m = club?.TodayMatch;
        if (club is null || m is not { Played: true, Goals: { } goals })
        {
            ReplayAvailable = false; // pré-jogo / sem clube / sem timeline → nada a reproduzir
            return;
        }
        _lastGoals = goals;
        _lastChoices = m.Choices; // a oferta fresca (as respondidas vêm ANOTADAS) — p/ o ReWatch
        ReplayAvailable = true;
        string key = $"{club.SeasonId}:{club.Round}";
        if (key == _lastReplayKey)
            return; // já auto-tocou esta rodada
        _lastReplayKey = key;
        // Partida NOVA: o otimista local da anterior expira (os templateIds repetem entre rodadas —
        // catálogo fixo; um _answeredLocal velho suprimiria um momento fresco desta rodada).
        _answeredLocal.Clear();
        _pendingOutcome.Clear();
        BeginChoicePresentation(m.Choices);
        _replay.Play(goals);
    }

    // Prepara a fila de escolhas de UMA sessão de replay (SPEC-050): só as não-respondidas (nem no
    // servidor — ChosenOptionId — nem localmente), em ordem de minuto; overlay fechado até o Frame abrir.
    // O round da oferta é CAPTURADO aqui (não no clique) — um poll que avance o `_lastRound` com o
    // overlay aberto não muda o alvo do POST (o servidor 409aria a oferta errada; MAJOR da revisão).
    private void BeginChoicePresentation(IReadOnlyList<BandMatchChoice>? choices)
    {
        _choicesRound = _lastRound;
        _replayChoices = (choices ?? Array.Empty<BandMatchChoice>())
            .Where(ch => ch is not null && ch.ChosenOptionId is null && !_answeredLocal.Contains(ch.TemplateId))
            .OrderBy(ch => ch.Minute)
            .ToList();
        _nextChoiceIdx = 0;
        ChoiceOpen = false;
        CurrentMatchChoice = null;
        Outcome = null;
    }

    // Reconciliação do poll (SPEC-050): NUNCA reseta um overlay em curso — reage pelo CONJUNTO de
    // respondidas aguardando desfecho (não só a corrente: o feedback sobrevive à PRÓXIMA escolha
    // abrir ou ao replay terminar antes do poll voltar). Feedback roteado SEMPRE pelo valor de
    // `result` (nunca por frase do servidor — OP-11).
    private void ReconcileMatchChoice(BandClub? club)
    {
        if (_pendingOutcome.Count == 0)
            return;
        IReadOnlyList<BandMatchChoice>? choices = club?.TodayMatch?.Choices;
        if (choices is null)
            return;
        foreach (BandMatchChoice? ch in choices)
        {
            if (ch is null || ch.Result is not { } result || !_pendingOutcome.Remove(ch.TemplateId))
                continue; // elemento null (JSON hostil) não derruba o Apply
            ActionFeedback = ResultFeedback(result);
            // SPEC-051: o desfecho SUBSTITUI a oferta no mesmo popup (um evento por vez). Fica até o
            // próximo momento abrir ou o replay terminar. A prosa é a do servidor; sem ela, o card
            // cai no genérico (degradação do critério 6).
            Outcome = new ChoiceOutcomeRow(
                ch.Minute,
                result,
                ch.ResultTitle,
                ch.ResultBody,
                ch.MoralDelta
            );
            ChoiceOpen = true;
            if (_currentMatchChoice?.TemplateId == ch.TemplateId)
                CurrentMatchChoice = null; // a oferta some; a moldura do desfecho assume
        }
    }

    /// <summary>O desfecho em cartaz (SPEC-051) — `null` = nenhum. Só a View o lê.</summary>
    public ChoiceOutcomeRow? Outcome
    {
        get => _outcome;
        private set => Set(ref _outcome, value);
    }

    private static string ResultFeedback(string result) =>
        result switch
        {
            "success" => "Deu bom! A arriscada pagou.",
            "fail" => "Não deu... o risco cobrou.",
            _ => "Anotado.", // 'na' / valor futuro → neutro
        };

    private void ApplyClub(BandClub? c)
    {
        _lastClub = c;
        if (c is null)
        {
            ClubLine = "sem clube (fila / reservado)";
            if (!ReplayActive)
                MatchLine = "";
            return;
        }
        string round;
        if (c.Round is { } r)
        {
            _lastRound = r; // o round MOSTRADO — o contexto do POST de escolha (SPEC-050)
            round = $" · rod {r}";
        }
        else
        {
            round = " · fora de temporada";
        }
        ClubLine = $"{c.Name} · T{c.Tier} · {c.Position}º{round}";

        if (ReplayActive)
            return; // o replay dirige o MatchLine; o poll não o sobrescreve

        BandMatch? m = c.TodayMatch;
        if (m is null)
        {
            MatchLine = "";
            return;
        }
        string side = m.IsHome ? "casa" : "fora";
        MatchLine =
            m is { Played: true, GoalsFor: { } gf, GoalsAgainst: { } ga }
                ? $"vs {m.OpponentName} ({side})  {gf}–{ga}"
                : $"vs {m.OpponentName} ({side}) · hoje 15h";
    }

    private void ApplyQueue(BandQueue? q, BandClub? club)
    {
        // A fila só aparece quando NÃO há clube (o contrato garante queue!=null só nesse caso).
        if (club is null && q is not null)
        {
            QueueVisible = true;
            QueueLine = $"Na fila: {q.Rank}º de {q.Total}";
        }
        else
        {
            QueueVisible = false;
            QueueLine = "";
        }
    }

    // Um item do catálogo → linha de render (SPEC-045). `CanBuy` (= available: não possuído, moradia
    // em ordem, com saldo) gateia o clique/opacidade; o status distingue os motivos de bloqueio.
    private static ShopRow ToShopRow(BandPurchase p)
    {
        string status = p.Owned
            ? "adquirido"
            : p.Available
                ? "comprar"
                : p.Affordable
                    ? "bloqueado"
                    : "sem saldo";
        // custo formatado como o saldo (N0/Culture) — consistência de moeda na faixa.
        return new ShopRow(
            p.Id,
            $"{p.Name} · R$ {p.Cost.ToString("N0", Culture)}",
            status,
            p.Available,
            p.Available ? 1.0 : 0.45
        );
    }

    // Uma opção da escolha → linha de render. O ChoiceCard (SPEC-051) precisa dos SINAIS separados
    // (cor pelo Risky, chip pelo Attr, micro-texto pelo Hint); o `Display` concatenado fica para
    // qualquer superfície simples que ainda o use.
    private static ChoiceOptionRow ToChoiceRow(BandChoiceOption o) =>
        new(
            o.Id,
            o.Risky ? $"{o.Label} ⚡{AttrAbbrev(o.Attr)}" : o.Label,
            o.Label,
            o.Risky,
            AttrAbbrev(o.Attr),
            AttrHint(o.Attr)
        );

    // O micro-texto do handoff: diz QUEM decide a aposta — nunca a porcentagem (segredo do servidor).
    private static string AttrHint(string? attr) =>
        attr switch
        {
            "fisico" => "seu Físico decide",
            "tecnico" => "sua Habilidade decide",
            "tatico" => "sua Leitura decide",
            "mental" => "sua Cabeça decide",
            _ => "seu talento decide",
        };

    private static string AttrAbbrev(string? attr) =>
        attr switch
        {
            "fisico" => "FIS",
            "tecnico" => "TEC",
            "tatico" => "TAT",
            "mental" => "MEN",
            _ => "", // arriscada sem atributo declarado → só o ⚡
        };

    private static string MeOf(BandState s)
    {
        BandMate? me = null;
        if (s.Squad is not null)
            foreach (BandMate? mate in s.Squad)
                if (mate?.IsMe == true) // elemento null (JSON hostil) não derruba o Apply
                {
                    me = mate;
                    break;
                }
        return me is null ? "" : $"  ·  você: {me.Name}";
    }

    private static readonly CultureInfo Culture = CultureInfo.InvariantCulture;
    private static readonly Brush NeutralBrush = Frozen(0x1E, 0x1E, 0x28);

    // Cor de fundo por CENA. Os valores CANÔNICOS de DayPhase (lib pura): 'ct' | 'casa' | 'vespera'.
    // Desconhecido → neutro. Cores placeholder estruturais — a arte real é fatia futura.
    private static Brush BrushFor(string? phase) =>
        (phase ?? "").ToLowerInvariant() switch
        {
            "ct" => Frozen(0x16, 0x2A, 0x3A), // manhã: CT (jornal, treino)
            "casa" => Frozen(0x16, 0x33, 0x22), // tarde: escalação, jogo das 15h
            "vespera" => Frozen(0x2A, 0x1E, 0x3A), // noite: decisões, amanhã tem jogo
            _ => NeutralBrush,
        };

    // Paleta indexada estrutural: os índices de appearance/kit viram blocos de cor DISTINTOS (não a
    // arte real — avatar em camadas — que é fatia futura). O contrato garante índices; o mod é defensivo.
    private static readonly Brush[] Palette =
    {
        Frozen(0xE0, 0xB0, 0x90),
        Frozen(0xC8, 0x8A, 0x64),
        Frozen(0x8A, 0x5A, 0x3C),
        Frozen(0x4E, 0xC9, 0xB0),
        Frozen(0xDD, 0xB8, 0x6B),
        Frozen(0x9A, 0xD0, 0xFF),
        Frozen(0xF4, 0x87, 0x71),
        Frozen(0xB7, 0xE4, 0xC7),
        Frozen(0xC7, 0x9A, 0xF0),
        Frozen(0x6A, 0x9A, 0x55),
        Frozen(0xD0, 0x6A, 0x9A),
        Frozen(0x55, 0x6A, 0xD0),
    };

    private static Brush IndexBrush(int index)
    {
        int n = Palette.Length;
        return Palette[((index % n) + n) % n];
    }

    private static Brush Frozen(byte r, byte g, byte b)
    {
        var brush = new SolidColorBrush(Color.FromRgb(r, g, b));
        brush.Freeze();
        return brush;
    }

    private static int Clamp(int v) => v < 0 ? 0 : v > 100 ? 100 : v;

    private bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return false; // diff-update: nada muda → nenhum PropertyChanged, nenhum re-render
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }
}

/// <summary>Uma linha do catálogo pronta p/ render (SPEC-045): rótulo, status (comprar/adquirido/
/// bloqueado/sem saldo), `CanBuy` (gateia o clique) e `Dim` (opacidade quando indisponível).</summary>
public sealed record ShopRow(string Id, string Label, string Status, bool CanBuy, double Dim);

/// <summary>O desfecho de uma escolha, pronto p/ o ChoiceCard (SPEC-051). `Title`/`Body` null = o
/// catálogo não declara prosa p/ esse desfecho → o card usa o texto genérico (critério 6).</summary>
public sealed record ChoiceOutcomeRow(
    int Minute,
    string Result,
    string? Title,
    string? Body,
    int? MoralDelta
);

/// <summary>Uma opção pronta p/ o desenho (SPEC-050/051): o ChoiceCard precisa dos SINAIS
/// SEPARADOS (cor pelo `Risky`, chip pelo `Attr`, micro-texto pelo `Hint`) — não de um rótulo já
/// concatenado; o `Display` fica p/ superfícies simples. `Id` é o que o POST envia.</summary>
public sealed record ChoiceOptionRow(
    string Id,
    string Display,
    string Label,
    bool Risky,
    string Attr,
    string Hint
);
