using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace BandClient.Api;

/// <summary>Como uma chamada terminou — roteada pelo `code` estável do servidor, nunca pela frase (OP-11).</summary>
public enum ApiStatus
{
    Ok,
    Unauthorized, // 401 → o cliente volta ao login
    RateLimited, // 429 → respeita Retry-After antes do próximo poll
    InvalidCredentials, // 401 no login (e-mail/senha)
    BadRequest, // 400
    ServerError, // 5xx / code inesperado
    Network, // falha de socket/timeout (offline, api fora do ar)
}

public sealed record LoginOutcome(ApiStatus Status, string? Token = null, int RetryAfterSec = 0);

public sealed record BandOutcome(ApiStatus Status, BandState? State = null, int RetryAfterSec = 0);

/// <summary>
/// O cliente HTTP da faixa (SPEC-042). UM `HttpClient` reusado (nunca socket por request). Consome
/// os endpoints já existentes: `POST /v1/auth/login` e `GET /v1/band` (Bearer). Não cria nem modifica
/// API — consumidor puro. Toda resposta é roteada pelo status/`code`; a mensagem do servidor nunca
/// vira lógica de UI.
/// </summary>
public sealed class BandApiClient
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _http;
    private string? _token;

    public BandApiClient(string baseUrl)
    {
        _http = new HttpClient { BaseAddress = new Uri(baseUrl), Timeout = TimeSpan.FromSeconds(15) };
    }

    public void SetToken(string token) => _token = token;

    /// <summary>Esquece o token em memória (chamado no 401/reauth, junto do TokenStore.Clear).</summary>
    public void ClearToken() => _token = null;

    public async Task<LoginOutcome> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        try
        {
            using var resp = await _http.PostAsJsonAsync(
                "/v1/auth/login",
                new { email, password },
                ct
            );
            if (resp.StatusCode == HttpStatusCode.OK)
            {
                LoginResponse? body = await resp.Content.ReadFromJsonAsync<LoginResponse>(Json, ct);
                return body?.Token is { Length: > 0 } t
                    ? new LoginOutcome(ApiStatus.Ok, t)
                    : new LoginOutcome(ApiStatus.ServerError);
            }
            if (resp.StatusCode == HttpStatusCode.TooManyRequests)
                return new LoginOutcome(ApiStatus.RateLimited, RetryAfterSec: await RetryAfter(resp, ct));
            if (resp.StatusCode == HttpStatusCode.Unauthorized)
                return new LoginOutcome(ApiStatus.InvalidCredentials);
            if (resp.StatusCode == HttpStatusCode.BadRequest)
                return new LoginOutcome(ApiStatus.BadRequest);
            return new LoginOutcome(ApiStatus.ServerError);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new LoginOutcome(ApiStatus.Network);
        }
        catch
        {
            // JsonException / NotSupportedException (200 não-JSON: proxy/captive portal) e qualquer
            // outra → erro genérico. O cliente NUNCA lança daqui (promessa do BandPoller).
            return new LoginOutcome(ApiStatus.ServerError);
        }
    }

    public async Task<BandOutcome> GetBandAsync(CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, "/v1/band");
            if (_token is { Length: > 0 })
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            using var resp = await _http.SendAsync(req, ct);
            if (resp.StatusCode == HttpStatusCode.OK)
            {
                BandState? state = await resp.Content.ReadFromJsonAsync<BandState>(Json, ct);
                return state is null
                    ? new BandOutcome(ApiStatus.ServerError)
                    : new BandOutcome(ApiStatus.Ok, state);
            }
            if (resp.StatusCode == HttpStatusCode.Unauthorized)
                return new BandOutcome(ApiStatus.Unauthorized);
            if (resp.StatusCode == HttpStatusCode.TooManyRequests)
                return new BandOutcome(ApiStatus.RateLimited, RetryAfterSec: await RetryAfter(resp, ct));
            return new BandOutcome(ApiStatus.ServerError);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new BandOutcome(ApiStatus.Network);
        }
        catch
        {
            // JsonException / NotSupportedException (200 não-JSON: proxy/captive portal) e qualquer
            // outra → erro genérico. Um 200 torto NUNCA derruba a faixa (o `async void` do poller
            // transformaria um throw daqui em exceção fatal no dispatcher).
            return new BandOutcome(ApiStatus.ServerError);
        }
    }

    // --- Escritas de gameplay (SPEC-045): as 4 rotas POST da SPEC-041. Consumidor puro (não cria API).
    //     Cada uma roteia pelo `code` estável (OP-11) e NUNCA lança (mesma promessa do GetBandAsync). ---

    public Task<WriteOutcome> SpendTrainingAsync(string attribute, CancellationToken ct = default) =>
        WriteAsync("/v1/training/spend", new { attribute }, ct);

    public Task<WriteOutcome> AnswerDecisionAsync(string decisionId, string optionId, CancellationToken ct = default) =>
        WriteAsync("/v1/decisions/answer", new { decisionId, optionId }, ct);

    public Task<WriteOutcome> PurchaseAsync(string itemId, CancellationToken ct = default) =>
        WriteAsync("/v1/purchases", new { itemId }, ct);

    public Task<WriteOutcome> RegenAsync(CancellationToken ct = default) =>
        WriteAsync("/v1/regen", new { }, ct); // sem body — a rota não lê nada; `{}` é ignorado

    private async Task<WriteOutcome> WriteAsync(string path, object body, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, path)
            {
                Content = JsonContent.Create(body),
            };
            if (_token is { Length: > 0 })
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            using var resp = await _http.SendAsync(req, ct);
            switch (resp.StatusCode)
            {
                case HttpStatusCode.OK:
                    return new WriteOutcome(WriteResult.Ok);
                case HttpStatusCode.Unauthorized:
                    return new WriteOutcome(WriteResult.Unauthorized);
                case HttpStatusCode.TooManyRequests:
                    return new WriteOutcome(WriteResult.RateLimited, RetryAfterSec: await RetryAfter(resp, ct));
                // 400/404/409 = rejeição de DOMÍNIO — o `code` diz o quê (feedback amigável).
                case HttpStatusCode.BadRequest:
                case HttpStatusCode.NotFound:
                case HttpStatusCode.Conflict:
                    return new WriteOutcome(WriteResult.Conflict, await ReadCode(resp, ct));
                default:
                    return new WriteOutcome(WriteResult.ServerError);
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return new WriteOutcome(WriteResult.Network);
        }
        catch
        {
            // corpo/resposta torto (200 não-JSON etc.) → genérico. Uma escrita NUNCA derruba a faixa.
            return new WriteOutcome(WriteResult.ServerError);
        }
    }

    // Lê o `code` estável do corpo de erro (OP-11); ausente/ilegível → null (o VM cai no feedback genérico).
    private static async Task<string?> ReadCode(HttpResponseMessage resp, CancellationToken ct)
    {
        try
        {
            ErrorBody? body = await resp.Content.ReadFromJsonAsync<ErrorBody>(Json, ct);
            return body?.Code;
        }
        catch
        {
            return null;
        }
    }

    // Retry-After no header (segundos) tem precedência; senão o `retryAfter` do corpo; senão 30s.
    private static async Task<int> RetryAfter(HttpResponseMessage resp, CancellationToken ct)
    {
        if (resp.Headers.RetryAfter?.Delta is { } delta)
            return Math.Max(1, (int)delta.TotalSeconds);
        try
        {
            ErrorBody? body = await resp.Content.ReadFromJsonAsync<ErrorBody>(Json, ct);
            if (body?.RetryAfter is { } r && r > 0)
                return r;
        }
        catch
        {
            // corpo ausente/ilegível → cai no default
        }
        return 30;
    }

    // Sem IDisposable de propósito: o HttpClient é singleton de vida-do-processo, reusado por todos os
    // ciclos de reauth (dispor no meio quebraria o reauth e churnaria sockets). A liberação é a saída
    // do processo — o padrão recomendado para HttpClient de longa vida.

    private sealed record LoginResponse(string? Token);

    private sealed record ErrorBody(string? Code, int? RetryAfter);
}
