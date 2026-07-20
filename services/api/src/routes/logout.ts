// Logout (SPEC-037) — a "rotação no logout" do `sdd.md:80`, feita por DESTRUIÇÃO da linha.
//
// ⚠️ A assimetria aqui é deliberada e fácil de "corrigir" errado: exige-se um header `Authorization`
// BEM-FORMADO (sem ele → 401, e isso é o passo 1 do OP-09 acontecendo ANTES de olhar o corpo), mas
// NÃO se exige que o token seja VÁLIDO. Token vivo, morto ou inventado devolvem o mesmo 204.
// Se a validade fosse pré-requisito, o endpoint viraria um ORÁCULO: um atacante com uma lista de
// tokens descobriria quais estão vivos só pelo status. Deletar o que não existe é no-op.
import type { Db } from '@camisa-9/player-store';
import { fail } from '../http/respond.js';
import type { Handler } from '../http/types.js';
import { bearerToken, revokeSession } from '../auth/session.js';

export function logout(db: Db): Handler {
  return async (ctx) => {
    // Header ausente ou malformado → 401, ANTES de qualquer leitura de corpo (OP-09: autenticação
    // precede input; um body malformado nunca deve virar 400 aqui).
    if (bearerToken(ctx.authorization) === null) return fail(401, 'unauthorized');
    await revokeSession(db, ctx.authorization);
    return { status: 204 };
  };
}
