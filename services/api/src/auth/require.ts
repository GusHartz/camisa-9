// O middleware do OP-09 (SPEC-037) — a ordem "autenticação → autorização → input" imposta pelo
// TIPO, não por convenção que alguém pode esquecer.
//
// `requireSession` converte um `AuthedHandler` (que EXIGE um `SessionCtx`) num `Handler` comum. A
// consequência é estrutural: uma rota protegida é **inalcançável** sem sessão viva — o handler não
// "checa e retorna 401", ele simplesmente NÃO RODA, e nenhuma query de domínio chega a ser emitida.
//
// O passo 2 (autorização) também é por construção: o `athleteId` do `SessionCtx` vem de
// `readActiveAthlete(session.accountId)` — NENHUMA rota aceita identificador de ator em path, query
// ou body, então `sdd.md:84` ("o ator só age sobre os próprios atletas") não depende de checagem.
import type { Db } from '@camisa-9/player-store';
import { fail } from '../http/respond.js';
import type { AuthedHandler, Handler } from '../http/types.js';
import { resolveSession } from './session.js';

/** Envolve um handler protegido. Sem sessão viva → 401 e o handler nunca é invocado. */
export function requireSession(db: Db, handler: AuthedHandler): Handler {
  return async (ctx) => {
    const session = await resolveSession(db, ctx.authorization, ctx.epochMs);
    if (!session) return fail(401, 'unauthorized');
    return handler(ctx, session);
  };
}

/** Variante para rotas que exigem ATLETA ativo, não só conta (uma conta mid-regen loga, mas não
 *  tem atleta). O `GET /v1/band` da SPEC-038 é o primeiro consumidor. */
export function requireAthlete(
  db: Db,
  handler: (
    ctx: Parameters<AuthedHandler>[0],
    athleteId: string,
    accountId: string,
  ) => ReturnType<AuthedHandler>,
): Handler {
  return requireSession(db, async (ctx, session) => {
    if (!session.athleteId) return fail(409, 'no_active_athlete');
    return handler(ctx, session.athleteId, session.accountId);
  });
}
