// POST /v1/regen (SPEC-041) — o jogador PEDE o renascimento (a viragem executa). CROSS-SCHEMA: liga
// a flag `regenRequested` no overlay do mundo via `requestRegen` (trava idade ≥25). O `worldDb`/
// `worldSeed` vêm de `RouteDeps` (env), NUNCA do request. Sem body. `OccupyError` → 409 na borda.
import { requestRegen, type Db as WorldDb } from '@camisa-9/world-store';
import { mapDomainError } from '../http/domain-error.js';
import { hit } from '../http/rate-limit.js';
import { rateLimited } from '../http/respond.js';
import type { RouteCtx, RouteResult } from '../http/types.js';

const REGEN_LIMIT = 5;

export function regen(worldDb: WorldDb, worldSeed: string) {
  return async (ctx: RouteCtx, athleteId: string, accountId: string): Promise<RouteResult> => {
    const limited = hit(`regen:acct:${accountId}`, REGEN_LIMIT, ctx.epochMs);
    if (!limited.allowed) return rateLimited(limited.retryAfterSec);
    try {
      await requestRegen(worldDb, worldSeed, athleteId);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return mapDomainError(err);
    }
  };
}
