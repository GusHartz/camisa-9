using System.Threading;
using BandClient.Api;

namespace BandClient.State;

/// <summary>
/// O coordenador de ESCRITA da faixa (SPEC-045) — a contraparte do <see cref="BandPoller"/> (leitura).
/// Dispara uma das 4 POST (SPEC-041) e, no resultado, roteia: sucesso/conflito → feedback + reconcilia
/// (relê o /v1/band, a autoridade é o servidor); 401 → reauth (como o poll); 429/rede/erro → feedback.
/// NUNCA lança (a promessa da faixa) e, depois do <see cref="Stop"/>, não coordena mais — um request
/// que voltou após o teardown não toca a UI nem reabre o login (a classe do MAJOR-2 da SPEC-042/044).
/// </summary>
public sealed class BandActions
{
    private readonly BandApiClient _api;
    private readonly BandPoller _poller;
    private readonly CancellationTokenSource _cts = new();
    private bool _stopped;

    /// <summary>Feedback PT-BR curto da ação (o VM mostra na linha transitória).</summary>
    public event Action<string>? Feedback;

    /// <summary>A sessão foi rejeitada (401) numa escrita — o App volta ao login.</summary>
    public event Action? Unauthorized;

    public BandActions(BandApiClient api, BandPoller poller)
    {
        _api = api;
        _poller = poller;
    }

    public Task SpendTrainingAsync(string attribute) =>
        Run(ct => _api.SpendTrainingAsync(attribute, ct), $"+1 em {AttrLabel(attribute)}");

    public Task AnswerDecisionAsync(string decisionId, string optionId) =>
        Run(ct => _api.AnswerDecisionAsync(decisionId, optionId, ct), "decisão registrada");

    public Task PurchaseAsync(string itemId) => Run(ct => _api.PurchaseAsync(itemId, ct), "comprado!");

    public Task RegenAsync() => Run(ct => _api.RegenAsync(ct), "renascimento solicitado");

    /// <summary>Para o coordenador e cancela um request em voo — chamado no Cleanup da faixa.</summary>
    public void Stop()
    {
        _stopped = true;
        _cts.Cancel();
    }

    private async Task Run(Func<CancellationToken, Task<WriteOutcome>> call, string okMsg)
    {
        if (_stopped)
            return;
        WriteOutcome o;
        try
        {
            o = await call(_cts.Token);
        }
        catch
        {
            return; // o ApiClient não lança, mas nunca deixamos escapar p/ o async void do handler
        }
        if (_stopped)
            return; // fechou/deslogou enquanto o request voava → não coordena mais
        switch (o.Result)
        {
            case WriteResult.Ok:
                Feedback?.Invoke(okMsg);
                _poller.RefreshNow(); // reconcilia: o freePoints/saldo/decisões frescos vêm do servidor
                break;
            case WriteResult.Conflict:
                Feedback?.Invoke(MapCode(o.Code));
                _poller.RefreshNow(); // o estado do servidor pode ter mudado (ex.: decisão já resolvida)
                break;
            case WriteResult.Unauthorized:
                Unauthorized?.Invoke();
                break;
            case WriteResult.RateLimited:
                Feedback?.Invoke($"muitas ações; tente em {o.RetryAfterSec}s");
                break;
            case WriteResult.Network:
                Feedback?.Invoke("sem conexão");
                break;
            default:
                Feedback?.Invoke("erro; tente de novo");
                break;
        }
    }

    // O `code` estável do servidor → feedback PT-BR (nunca a frase do servidor, OP-11).
    private static string MapCode(string? code) =>
        code switch
        {
            "no_free_points" => "sem pontos para distribuir",
            "insufficient_balance" => "saldo insuficiente",
            "already_owned" => "você já tem esse item",
            "decision_resolved" => "essa decisão já foi resolvida",
            "not_found" => "decisão indisponível",
            "invalid_option" => "opção inválida",
            "regen_ineligible" => "regen ainda não disponível",
            "invalid_input" => "ação inválida",
            _ => "não foi possível concluir", // 'conflict'/attribute_maxed/desconhecido
        };

    private static string AttrLabel(string attr) =>
        attr switch
        {
            "fisico" => "Físico",
            "tecnico" => "Técnico",
            "tatico" => "Tático",
            "mental" => "Mental",
            _ => attr,
        };
}
