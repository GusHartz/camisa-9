// POST /v1/decisions/answer (SPEC-041) — o jogador responde uma decisão. `{ decisionId, optionId }`
// → `answerDecision` (que já FILTRA por dono: decisão de outro atleta → 404). Id no body (o router é
// exato, sem params); o id da decisão é RECURSO do atleta, não ator. Erro de domínio mapeado.
import { answerDecision, type Db } from '@camisa-9/player-store';
import { isRecord } from '../http/body.js';
import { mapDomainError } from '../http/domain-error.js';
import { hit } from '../http/rate-limit.js';
import { fail, rateLimited } from '../http/respond.js';
import type { RouteCtx, RouteResult } from '../http/types.js';

const ANSWER_LIMIT = 30;

/** O `decisionId` é coluna `uuid` — validar o FORMATO aqui impede que um id sintaticamente inválido
 *  chegue ao `WHERE id = $1` e estoure `22P02` (→ 500). Um id mal-formado é `invalid_input` (400),
 *  não erro interno. (O `optionId` é chave de opção, texto livre → conferido contra a decisão no repo.) */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBody(raw: unknown): { decisionId: string; optionId: string } | null {
  if (!isRecord(raw)) return null;
  const { decisionId, optionId } = raw;
  if (typeof decisionId !== 'string' || typeof optionId !== 'string') return null;
  if (!UUID_RE.test(decisionId) || optionId.length === 0) return null;
  return { decisionId, optionId };
}

export function answerDecisionRoute(db: Db) {
  return async (ctx: RouteCtx, athleteId: string, accountId: string): Promise<RouteResult> => {
    const limited = hit(`decision:acct:${accountId}`, ANSWER_LIMIT, ctx.epochMs);
    if (!limited.allowed) return rateLimited(limited.retryAfterSec);
    const body = parseBody(ctx.body);
    if (!body) return fail(400, 'invalid_input');
    try {
      await answerDecision(db, athleteId, body.decisionId, body.optionId);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      return mapDomainError(err);
    }
  };
}
