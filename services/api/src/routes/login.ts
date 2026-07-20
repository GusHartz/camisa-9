// O portão (SPEC-037). Rota PÚBLICA — não há passo 1 do OP-09 aqui; a ordem é: balde de IP →
// validação de input → balde de e-mail → argon2id. O argon2 fica atrás dos DOIS baldes de propósito:
// é a operação cara, e deixá-la exposta transformaria o rate limit em teatro.
//
// ⚠️ A resposta 401 é IDÊNTICA em corpo E em tempo para "e-mail não existe" e "senha errada" — a
// defesa contra enumeração de contas vive no `authenticate` (o dummy-hash com os MESMOS parâmetros
// argon2). Qualquer ramo que devolva antes de queimar esse tempo reabre o oráculo.
import { authenticate, normalizeEmail, type Db } from '@camisa-9/player-store';
import { isRecord } from '../http/body.js';
import { hit } from '../http/rate-limit.js';
import { fail, rateLimited } from '../http/respond.js';
import type { Handler, Parsed } from '../http/types.js';
import { issueSession } from '../auth/session.js';

/**
 * Teto por e-mail numa janela de 1 min (`sdd.md:100`). O balde de IP vive no roteador, aplicado a
 * todo `/v1/auth/*`.
 *
 * ⚠️ A chave é o PAR `e-mail + IP`, não o e-mail sozinho — e isso é a correção de um furo real.
 * Chaveado só pelo e-mail, o balde é consumido ANTES do `authenticate`, logo conta TENTATIVAS e não
 * falhas: bastava um atacante mandar 5 logins com senha qualquer no e-mail da vítima para que ela,
 * **com a senha correta**, passasse a receber 429 — renovável a cada janela, indefinidamente. Era
 * exatamente o lockout de conta que a doutrina desta rota diz recusar (ele entrega a um terceiro o
 * poder de negar serviço só sabendo o e-mail).
 *
 * O trade-off, declarado: com a chave por par, um ataque DISTRIBUÍDO (muitos IPs) contra UMA conta
 * deixa de ser limitado por este balde — sobra o teto de IP, que vale por IP. Proteção por conta
 * cross-IP exige estado compartilhado, e é o mesmo card do rate limit distribuído (>1 instância),
 * já declarado como débito.
 */
const EMAIL_LIMIT = 5;

interface LoginInput {
  readonly email: string;
  readonly password: string;
}

/** Validação de FORMA (o passo 3 do OP-09), sem `zod` — molde do `validatePassword`/`isPosition`
 *  da lib pura. Não julga a credencial, só o formato. */
export function parseLoginBody(raw: unknown): Parsed<LoginInput> {
  if (!isRecord(raw)) return { ok: false };
  const { email, password } = raw;
  if (typeof email !== 'string' || typeof password !== 'string') return { ok: false };
  if (email.length === 0 || email.length > 320 || password.length === 0) return { ok: false };
  return { ok: true, value: { email, password } };
}

export function login(db: Db): Handler {
  return async (ctx) => {
    // O balde de IP já foi aplicado pelo roteador (todo `/v1/auth/*`).
    const parsed = parseLoginBody(ctx.body);
    if (!parsed.ok) return fail(400, 'invalid_input');

    // A chave usa a MESMA normalização do lookup — senão trocar a caixa do e-mail criaria um balde
    // novo e o limite viraria decorativo.
    const email = normalizeEmail(parsed.value.email);
    const byEmail = hit(`login:email:${email}:${ctx.ip}`, EMAIL_LIMIT, ctx.epochMs);
    if (!byEmail.allowed) return rateLimited(byEmail.retryAfterSec);

    const auth = await authenticate(db, parsed.value.email, parsed.value.password);
    if (!auth) return fail(401, 'invalid_credentials');

    const issued = await issueSession(db, auth.accountId, ctx.epochMs);
    return { status: 200, body: { token: issued.token, expiresAt: issued.expiresAt } };
  };
}
