// A rota GET /v1/band (SPEC-038) — a superfície que a faixa lê. Registrada via `requireAthlete` (o
// middleware da SPEC-037): sem sessão viva COM atleta ativo, o handler NÃO RODA (o 401 e o 409
// `no_active_athlete` nascem no middleware, não aqui). O `athleteId` vem SEMPRE da sessão — a rota
// NÃO tem path param, query param nem body, então não há identificador de ator a validar (OP-09 #2).
//
// DOIS baldes em camada: (a) por IP, no ROUTER (pré-auth, contra flood de token inválido); (b) por
// `accountId` AQUI (pós-sessão, contra loop autenticado — um token válido em loop satura os pools e
// derrubaria a faixa de todos). A política 1×/60s do cliente é COOPERAÇÃO; este balde é o controle.
import { hit } from '../http/rate-limit.js';
import { rateLimited } from '../http/respond.js';
import type { RouteCtx, RouteResult } from '../http/types.js';
import { readBandState, type BandDeps } from '../band/band-state.js';

/** Teto por conta: 30/min (bem acima do poll cooperativo de 1×/60s; morde só o loop autenticado). */
const BAND_ACCOUNT_LIMIT = 30;

export function band(
  deps: BandDeps,
): (ctx: RouteCtx, athleteId: string, accountId: string) => Promise<RouteResult> {
  return async (ctx, athleteId, accountId) => {
    const limited = hit(`band:acct:${accountId}`, BAND_ACCOUNT_LIMIT, ctx.epochMs);
    if (!limited.allowed) return rateLimited(limited.retryAfterSec);
    const state = await readBandState(deps, athleteId, ctx.epochMs);
    return { status: 200, body: state };
  };
}
