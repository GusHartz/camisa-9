using System.Threading;
using System.Windows.Threading;
using BandClient.Api;

namespace BandClient.State;

/// <summary>
/// O batimento do cliente (SPEC-042): faz poll do `GET /v1/band` a cada 60s (a cadência cooperativa
/// que o contrato espera), começando por um fetch imediato. Roda no `DispatcherTimer` (thread da UI),
/// então os eventos disparam já na UI — sem marshalling. Roteia o resultado por eventos: sucesso,
/// 401 (re-login), 429 (respeita o Retry-After adiando o próximo tick), e falha de rede (mostra e
/// tenta de novo no próximo ciclo). Nunca lança: um poll que falha só emite `Failed`.
/// </summary>
public sealed class BandPoller
{
    private const int DefaultIntervalSec = 60;

    private readonly BandApiClient _api;
    private readonly DispatcherTimer _timer;
    private CancellationTokenSource _cts = new();
    private bool _busy;
    private bool _stopped;
    private bool _refreshQueued; // um RefreshNow pedido enquanto um poll voava (SPEC-045)

    public event Action<BandState>? Updated;
    public event Action? Unauthorized;
    public event Action<int>? RateLimited;
    public event Action<string>? Failed;

    public BandPoller(BandApiClient api)
    {
        _api = api;
        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(DefaultIntervalSec) };
        _timer.Tick += async (_, _) => await PollAsync();
    }

    public void Start()
    {
        _stopped = false;
        _cts = new CancellationTokenSource();
        _timer.Start();
        _ = PollAsync(); // primeiro fetch imediato (não espera 60s)
    }

    // Reconciliação pós-escrita (SPEC-045): relê o /v1/band JÁ, fora da cadência de 60s. Se um poll
    // está em voo, ENFILEIRA (o finally re-dispara) — senão a reconciliação se perderia por 60s. Roda
    // na thread da UI (chamado dos handlers), então é seguro tocar os campos do timer.
    public void RefreshNow()
    {
        if (_stopped)
            return;
        if (_busy)
            _refreshQueued = true;
        else
            _ = PollAsync();
    }

    // Para o batimento E cancela um request em voo. Depois disto, NENHUM evento é disparado — um poll
    // que já estava voando quando o usuário fechou/deslogou não coordena mais (evita reabrir janela
    // após o Shutdown; o furo do MAJOR-2 da revisão).
    public void Stop()
    {
        _stopped = true;
        _cts.Cancel();
        _timer.Stop();
    }

    private async Task PollAsync()
    {
        if (_busy || _stopped)
            return; // um poll em voo não empilha; parado, nem começa
        _busy = true;
        try
        {
            BandOutcome outcome = await _api.GetBandAsync(_cts.Token);
            if (_stopped)
                return; // parou enquanto o request voava → não coordena mais
            switch (outcome.Status)
            {
                case ApiStatus.Ok when outcome.State is not null:
                    ResetInterval();
                    Updated?.Invoke(outcome.State);
                    break;
                case ApiStatus.Unauthorized:
                    Unauthorized?.Invoke();
                    break;
                case ApiStatus.RateLimited:
                    Backoff(outcome.RetryAfterSec);
                    RateLimited?.Invoke(outcome.RetryAfterSec);
                    break;
                case ApiStatus.Network:
                    Failed?.Invoke("sem conexão");
                    break;
                default:
                    Failed?.Invoke("erro do servidor");
                    break;
            }
        }
        catch
        {
            // Defensivo: `GetBandAsync` não lança, mas um handler de evento poderia — nunca deixar
            // escapar para o `async void` do Tick (viraria exceção fatal no dispatcher).
        }
        finally
        {
            _busy = false;
            // Um RefreshNow chegou enquanto este poll voava → dispara o poll de reconciliação agora
            // (o estado pós-escrita ainda não foi lido). Fire-and-forget; cliques são user-paced.
            if (_refreshQueued && !_stopped)
            {
                _refreshQueued = false;
                _ = PollAsync();
            }
        }
    }

    // 429: adia o PRÓXIMO tick para depois do Retry-After (se maior que a cadência normal).
    private void Backoff(int retryAfterSec)
    {
        int wait = Math.Max(DefaultIntervalSec, Math.Max(1, retryAfterSec));
        _timer.Interval = TimeSpan.FromSeconds(wait);
    }

    private void ResetInterval()
    {
        if (_timer.Interval.TotalSeconds != DefaultIntervalSec)
            _timer.Interval = TimeSpan.FromSeconds(DefaultIntervalSec);
    }
}
