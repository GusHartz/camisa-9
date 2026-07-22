// POST /v1/matches/choices/answer (SPEC-050) — o jogador responde uma escolha da partida mostrada.
// `{ round, templateId, optionId }` → a orquestração recomputa a oferta server-side (zero confiança
// no cliente) e persiste via a tx do repo (PK = idempotência). Nenhum identificador de ator no body
// (autorização por construção — o athleteId vem da sessão). Erro de domínio mapeado (OP-11).
import type { Db } from '@camisa-9/player-store';
import type { Db as WorldDb } from '@camisa-9/world-store';
import { answerMatchChoiceAction } from '../gameplay/match-choice.js';
import { isRecord } from '../http/body.js';
import { mapDomainError } from '../http/domain-error.js';
import { hit } from '../http/rate-limit.js';
import { fail, rateLimited } from '../http/respond.js';
import type { RouteCtx, RouteResult } from '../http/types.js';

const ANSWER_LIMIT = 30;

/** `round` inteiro ≥ 1 (o gate REAL é `round === rodada mostrada`, na orquestração); `templateId`/
 *  `optionId` são chaves de catálogo (texto), conferidas contra a oferta RECOMPUTADA — nunca contra
 *  o que o cliente afirma. */
function parseBody(raw: unknown): { round: number; templateId: string; optionId: string } | null {
  if (!isRecord(raw)) return null;
  const { round, templateId, optionId } = raw;
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 1) return null;
  if (typeof templateId !== 'string' || templateId.length === 0) return null;
  if (typeof optionId !== 'string' || optionId.length === 0) return null;
  return { round, templateId, optionId };
}

export function answerMatchChoiceRoute(db: Db, worldDb: WorldDb, worldSeed: string) {
  return async (ctx: RouteCtx, athleteId: string, accountId: string): Promise<RouteResult> => {
    const limited = hit(`match-choice:acct:${accountId}`, ANSWER_LIMIT, ctx.epochMs);
    if (!limited.allowed) return rateLimited(limited.retryAfterSec);
    const body = parseBody(ctx.body);
    if (!body) return fail(400, 'invalid_input');
    try {
      await answerMatchChoiceAction({ db, worldDb, worldSeed }, athleteId, body, ctx.epochMs);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return mapDomainError(err);
    }
  };
}
