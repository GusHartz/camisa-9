using System.ComponentModel;
using System.Globalization;
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

        int squad = s.Squad?.Count ?? 0;
        string me = MeOf(s);
        SquadLine = squad == 0 ? "" : $"Elenco {squad}{me}";

        int pending = s.PendingDecisions;
        DecisionsLine = pending > 0 ? $"Decisões pendentes: {pending}" : "";

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
    ///  não morre no 401; a fatia 2 senão churnaria PropertyChanged num VM órfão). Só para o timer.</summary>
    public void StopReplay() => _replay.Stop();

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
            _replay.Play(goals);
    }

    // Durante o replay, o MatchLine é DIRIGIDO pelo motor (relógio + placar que sobe); o poll (Apply)
    // não o sobrescreve (guard em ApplyClub). O flash marca o gol recém-ocorrido.
    private void OnReplayFrame(ReplayFrame f)
    {
        ReplayActive = _replay.IsPlaying;
        MatchLine = $"⏱ {f.Minute}'  {f.MyGoals}–{f.TheirGoals}";
        MyGoalFlashOpacity = f.GoalNow && f.GoalIsMine ? 1 : 0;
        TheirGoalFlashOpacity = f.GoalNow && !f.GoalIsMine ? 1 : 0;
    }

    // Fim natural do replay (90'): volta ao placar final ESTÁTICO e apaga o flash — senão o ⚽ de um
    // gol no 90' ficaria preso e o MatchLine preso em "⏱ 90' x–y" até o próximo poll (~60s).
    private void OnReplayEnded()
    {
        ReplayActive = false;
        MyGoalFlashOpacity = 0;
        TheirGoalFlashOpacity = 0;
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
        ReplayAvailable = true;
        string key = $"{club.SeasonId}:{club.Round}";
        if (key == _lastReplayKey)
            return; // já auto-tocou esta rodada
        _lastReplayKey = key;
        _replay.Play(goals);
    }

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
        string round = c.Round is { } r ? $" · rod {r}" : " · fora de temporada";
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

    private void Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return; // diff-update: nada muda → nenhum PropertyChanged, nenhum re-render
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }
}
