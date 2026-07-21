// POST /v1/training/spend (SPEC-041) — o jogador DISTRIBUI 1 ponto livre (o gancho de retenção; o
// acúmulo é automático no scheduler). `{ attribute }` → `spendFreePoint`. Autorizado por construção
// (o athleteId vem da sessão via requireAthlete); balde por accountId; erro de domínio mapeado.
//
// ⚠️ AT-LEAST-ONCE (débito conhecido, revisão SPEC-041): é a ÚNICA escrita interativa SEM chave de
// idempotência — um retry após resposta perdida gasta um 2º ponto (se um acúmulo creditou no meio).
// O dano é LIMITADO (nunca negativo, nunca além dos freePoints, e cai no atributo que o jogador
// escolheu). Um token de dedup exigiria uma tabela nova (contra o "sem migration" desta fatia) → card
// futuro; a faixa reconcilia relendo o `GET /v1/band` (o freePoints fresco) após cada spend.
import { spendFreePoint, type Db } from '@camisa-9/player-store';
import type { Focus } from '@camisa-9/player';
import { isRecord } from '../http/body.js';
import { mapDomainError } from '../http/domain-error.js';
import { hit } from '../http/rate-limit.js';
import { fail, rateLimited } from '../http/respond.js';
import type { RouteCtx, RouteResult } from '../http/types.js';

const SPEND_LIMIT = 30;

function isFocus(v: unknown): v is Focus {
  return v === 'fisico' || v === 'tecnico' || v === 'tatico' || v === 'mental';
}

export function trainingSpend(db: Db) {
  return async (ctx: RouteCtx, athleteId: string, accountId: string): Promise<RouteResult> => {
    const limited = hit(`train:acct:${accountId}`, SPEND_LIMIT, ctx.epochMs);
    if (!limited.allowed) return rateLimited(limited.retryAfterSec);
    if (!isRecord(ctx.body) || !isFocus(ctx.body.attribute)) return fail(400, 'invalid_input');
    try {
      await spendFreePoint(db, athleteId, ctx.body.attribute);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return mapDomainError(err);
    }
  };
}
