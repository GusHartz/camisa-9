namespace BandClient.Api;

// O resultado tipado de uma ESCRITA de gameplay (SPEC-045). Roteado pelo `Code` estável do servidor
// (nunca pela frase — OP-11): o `Conflict` (409) carrega o code de domínio (no_free_points,
// insufficient_balance, decision_resolved, regen_ineligible, …) que o ViewModel mapeia para um
// feedback PT-BR curto. As demais categorias espelham o `ApiStatus` do read.

public enum WriteResult
{
    Ok, // 200 → escreveu; a faixa reconcilia relendo o /v1/band
    Unauthorized, // 401 → a sessão morreu; volta ao login (como o poll)
    RateLimited, // 429 → respeita o Retry-After
    Conflict, // 409/400 de domínio → `Code` diz o quê (feedback amigável)
    ServerError, // 5xx / code inesperado
    Network, // falha de socket/timeout
}

/// <summary>Como uma escrita terminou. `Code` só é significativo no `Conflict` (o code de domínio).</summary>
public sealed record WriteOutcome(WriteResult Result, string? Code = null, int RetryAfterSec = 0);
