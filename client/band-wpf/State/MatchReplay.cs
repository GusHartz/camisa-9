using System.Collections.Generic;
using System.Windows.Threading;
using BandClient.Api;

namespace BandClient.State;

/// <summary>Um frame do replay: o minuto corrente, o placar acumulado, e se um gol ACABOU de ocorrer
///  (pro flash — `GoalIsMine` diz de quem).</summary>
public readonly record struct ReplayFrame(
    int Minute,
    int MyGoals,
    int TheirGoals,
    bool GoalNow,
    bool GoalIsMine
);

/// <summary>
/// O motor de replay da partida (SPEC-044). Dado a timeline `goals` (SPEC-043) + a duração-alvo,
/// comprime os 90' num tempo real curto (~3–5 min) e emite um `ReplayFrame` a cada novo MINUTO — o
/// relógio corre 0'→90' e o placar SOBE nos minutos dos gols. É 100% LOCAL (o cliente já baixou a
/// timeline; zero feed do servidor) e roda no `DispatcherTimer` (UI thread), com tick coarse pro
/// orçamento (`<1% CPU`). REPRODUZ — nunca recomputa placar (OP-17: a soma converge ao autoritativo).
/// </summary>
public sealed class MatchReplay
{
    private const int MatchMinutes = 90;
    private const int TickMs = 500; // coarse: só ~2 checagens/s (o Emit dispara por MINUTO, não por tick)

    private readonly DispatcherTimer _timer;
    private readonly int _watchSeconds;
    private IReadOnlyList<BandGoal> _goals = System.Array.Empty<BandGoal>();
    private int _elapsedMs;
    private int _lastMinute = -1;
    private int _lastMy;
    private int _lastTheir;

    public event Action<ReplayFrame>? Frame;
    public event Action? Ended;

    public bool IsPlaying { get; private set; }

    public MatchReplay(int watchSeconds)
    {
        _watchSeconds = Math.Clamp(watchSeconds, 180, 300); // a faixa travada com o founder: 3–5 min
        _timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(TickMs) };
        _timer.Tick += (_, _) => Tick();
    }

    /// <summary>(Re)inicia o replay da timeline dada, do 0'. Um replay em curso é substituído.</summary>
    public void Play(IReadOnlyList<BandGoal> goals)
    {
        _goals = goals;
        _elapsedMs = 0;
        _lastMinute = -1;
        _lastMy = 0;
        _lastTheir = 0;
        IsPlaying = true;
        Emit(0); // frame inicial: 0' 0–0
        _timer.Start();
    }

    public void Stop()
    {
        _timer.Stop();
        IsPlaying = false;
    }

    private void Tick()
    {
        _elapsedMs += TickMs;
        int minute = Math.Min(
            MatchMinutes,
            (int)Math.Round((double)MatchMinutes * _elapsedMs / (_watchSeconds * 1000.0))
        );
        if (minute != _lastMinute)
            Emit(minute);
        if (minute >= MatchMinutes)
        {
            Stop();
            Ended?.Invoke();
        }
    }

    private void Emit(int minute)
    {
        _lastMinute = minute;
        int my = 0,
            their = 0;
        foreach (BandGoal g in _goals)
        {
            // A CONTAGEM é a autoridade (OP-17): um gol de acréscimo (minuto > 90) é CLAMPADO ao
            // relógio, nunca dropado → o placar final sempre converge ao goalsFor/goalsAgainst.
            if (Math.Min(g.Minute, MatchMinutes) > minute)
                continue;
            if (g.IsMine)
                my++;
            else
                their++;
        }
        bool goalNow = my > _lastMy || their > _lastTheir;
        bool goalIsMine = my > _lastMy; // se ambos subiram no mesmo minuto (raro), prioriza o SEU
        _lastMy = my;
        _lastTheir = their;
        Frame?.Invoke(new ReplayFrame(minute, my, their, goalNow, goalIsMine));
    }
}
