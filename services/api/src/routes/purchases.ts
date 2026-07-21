// POST /v1/purchases (SPEC-041) — o jogador compra um item do catálogo. `{ itemId }` → `purchaseItem`
// (compra atômica: valida saldo/posse/moradia sob FOR UPDATE; erro tipado). Autorizado por construção.
import { purchaseItem, type Db } from '@camisa-9/player-store';
import { isRecord } from '../http/body.js';
import { mapDomainError } from '../http/domain-error.js';
import { hit } from '../http/rate-limit.js';
import { fail, rateLimited } from '../http/respond.js';
import type { RouteCtx, RouteResult } from '../http/types.js';

const PURCHASE_LIMIT = 20;

function parseBody(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const { itemId } = raw;
  return typeof itemId === 'string' && itemId.length > 0 ? itemId : null;
}

export function purchases(db: Db) {
  return async (ctx: RouteCtx, athleteId: string, accountId: string): Promise<RouteResult> => {
    const limited = hit(`purchase:acct:${accountId}`, PURCHASE_LIMIT, ctx.epochMs);
    if (!limited.allowed) return rateLimited(limited.retryAfterSec);
    const itemId = parseBody(ctx.body);
    if (!itemId) return fail(400, 'invalid_input');
    try {
      await purchaseItem(db, athleteId, itemId);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return mapDomainError(err);
    }
  };
}
