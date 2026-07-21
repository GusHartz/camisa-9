// O ÚNICO serializador de resposta (SPEC-037) — OP-11 por construção. Nenhum outro arquivo escreve
// em `res`. Ele NUNCA propaga `err.message` das camadas de baixo: mapeia por outcome EXPLÍCITO, e
// qualquer throw inesperado vira `500 internal` + o detalhe só no log server-side. `Cache-Control:
// no-store` é o DEFAULT (toda resposta, autenticada ou não — inclusive a do login, que carrega o
// token no corpo, e todo 4xx/5xx); a ÚNICA exceção é `/healthz`, e ela é explícita por rota.
import type { ServerResponse } from 'node:http';
import type { ErrorCode, RouteResult } from './types.js';

/** Frase genérica por código. É fallback de UI — o cliente traduz pelo `code`, não por isto. */
const MESSAGE: Readonly<Record<ErrorCode, string>> = {
  invalid_input: 'requisição inválida',
  invalid_credentials: 'credenciais inválidas',
  payload_too_large: 'requisição inválida',
  rate_limited: 'muitas tentativas',
  unauthorized: 'não autorizado',
  no_active_athlete: 'sem atleta ativo',
  not_found: 'recurso não encontrado',
  no_free_points: 'sem ponto de treino disponível',
  decision_resolved: 'decisão já resolvida',
  invalid_option: 'opção inválida',
  insufficient_balance: 'saldo insuficiente',
  already_owned: 'item já adquirido',
  regen_ineligible: 'renascimento indisponível',
  conflict: 'ação não permitida agora',
  internal: 'erro interno',
};

/** Monta o `RouteResult` de erro. Nenhum detalhe interno atravessa — só código + frase genérica. */
export function fail(
  status: number,
  code: ErrorCode,
  extra?: Readonly<Record<string, unknown>>,
): RouteResult {
  return { status, body: { error: MESSAGE[code], code, ...extra } };
}

/** O 429 padrão: `retryAfter` no corpo (para o cliente tipado) E no header `Retry-After`. */
export function rateLimited(retryAfterSec: number): RouteResult {
  return {
    ...fail(429, 'rate_limited', { retryAfter: retryAfterSec }),
    headers: { 'retry-after': String(retryAfterSec) },
  };
}

/** Escreve o `RouteResult` no socket. `no-store` sempre, salvo opt-out EXPLÍCITO da rota. */
export function send(
  res: ServerResponse,
  result: RouteResult,
  opts?: { cacheable?: boolean },
): void {
  const headers: Record<string, string> = { ...result.headers };
  if (!opts?.cacheable) headers['cache-control'] = 'no-store';
  if (result.body === undefined) {
    res.writeHead(result.status, headers);
    res.end();
    return;
  }
  const payload = JSON.stringify(result.body);
  headers['content-type'] = 'application/json; charset=utf-8';
  headers['content-length'] = String(Buffer.byteLength(payload));
  res.writeHead(result.status, headers);
  res.end(payload);
}

/** Log server-side do que NUNCA vai para o cliente. O `requestId` correlaciona com o 500 devolvido. */
export function logInternal(requestId: string, err: unknown): void {
  console.error(`api: erro interno [${requestId}] —`, err instanceof Error ? err.message : 'erro');
}
