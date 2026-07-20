// Sessão de login (SPEC-037) — o portão. `authenticate` confere a credencial (com a defesa de
// TIMING contra enumeração de contas); o resto é o CRUD do token. Este repo NUNCA vê o token em
// claro: recebe sempre o `tokenHash` (sha256hex) já derivado pela borda — o segredo não atravessa
// esta camada nem entra no banco. Os dois relógios (absoluto 30d, idle 7d) vivem aqui, e tudo
// recebe `nowMs` INJETADO (zero `Date.now()` neste arquivo → testável sem sleep). Erros genéricos
// (OP-11). Locks: nenhum advisory — só a transação do cap, xact-scoped por construção (ADR-002:57).
import { and, desc, eq, gt, lt, ne, notInArray } from 'drizzle-orm';
import type { Db } from '../client.js';
import { account } from '../schema/account.js';
import { session } from '../schema/session.js';
import { verifyPassword } from './auth.js';
import { normalizeEmail, readActiveAthlete } from './player-repo.js';

/** Política de sessão (SPEC-037). Tunável; os dois TTLs são independentes e ambos valem. */
export const SESSION = {
  /** Teto ABSOLUTO: a sessão morre 30d após criada, por mais ativa que seja. */
  absoluteTtlMs: 30 * 86_400_000,
  /** Janela IDLE: 7d sem uso mata o token (é o "curta duração" do `sdd.md:80`). */
  idleTtlMs: 7 * 86_400_000,
  /** O bump de `last_seen_at` só escreve se o último for mais velho que isto (12h) — um poll de
   *  60s viraria 1.440 UPDATEs/dia sem o throttle; 12h num TTL de 7d é granularidade irrelevante. */
  touchThrottleMs: 12 * 3_600_000,
  /** Sessões vivas simultâneas por conta. Sem cap, um loop de login acumula ~7.200 linhas/dia. */
  maxLive: 10,
} as const;

/** Hash argon2id de uma senha aleatória DESCARTADA, com os MESMOS parâmetros dos hashes reais
 *  (`m=19456,t=2,p=1` — `auth.ts:7`). Existe só para queimar o mesmo tempo no ramo "e-mail não
 *  existe": sem ele, a ausência de conta responde ~50 ms mais rápido e vira oráculo de enumeração.
 *  ⚠️ NÃO é segredo (não protege nada, OP-12 não se aplica) — mas um dummy com parâmetros
 *  DIVERGENTES tem custo divergente e REABRE a enumeração. */
export const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$VKQrCJ17XOg/D2vf7XzWNA$v/HBCjkDmeRRS5gEbWFmB5/ARx3ydTejUqO1gOHDpe0';

export interface AuthResult {
  readonly accountId: string;
  /** `null` numa conta mid-regen (sem atleta ativo): o login SUCEDE; quem recusa é a rota. */
  readonly athleteId: string | null;
}

export interface SessionView {
  readonly accountId: string;
  readonly lastSeenAt: Date;
}

export interface CreatedSession {
  readonly id: string;
  readonly expiresAt: Date;
}

/**
 * Confere e-mail + senha. Devolve `null` para credencial inválida — **sem distinguir** e-mail
 * inexistente de senha errada, nem no corpo nem no TEMPO (o ramo "não achou" roda o argon2id do
 * `DUMMY_HASH` e descarta o resultado).
 */
export async function authenticate(
  db: Db,
  email: string,
  password: string,
): Promise<AuthResult | null> {
  const [row] = await db
    .select({ id: account.id, passwordHash: account.passwordHash })
    .from(account)
    .where(eq(account.email, normalizeEmail(email)))
    .limit(1);
  if (!row) {
    await verifyPassword(DUMMY_HASH, password); // queima o mesmo tempo; resultado ignorado
    return null;
  }
  if (!(await verifyPassword(row.passwordHash, password))) return null;
  const athlete = await readActiveAthlete(db, row.id);
  return { accountId: row.id, athleteId: athlete?.id ?? null };
}

/**
 * Cria a sessão e **poda as excedentes** na MESMA transação (cap de `maxLive` por conta, as mais
 * antigas caem). `expiresAt` = `nowMs + absoluteTtlMs`, derivado aqui — a política de TTL mora
 * num lugar só. Recebe o `tokenHash` já derivado; o token em claro nunca chega aqui.
 */
export async function createSession(
  db: Db,
  accountId: string,
  tokenHash: string,
  nowMs: number,
): Promise<CreatedSession> {
  const now = new Date(nowMs);
  const expiresAt = new Date(nowMs + SESSION.absoluteTtlMs);
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(session)
        // ⚠️ `created_at` e `last_seen_at` são gravados EXPLICITAMENTE do `nowMs` injetado, e não
        // deixados no `defaultNow()` do Postgres. Senão os dois relógios da sessão rodariam em
        // bases diferentes (`expires_at` no relógio da APLICAÇÃO, os outros no do BANCO): em
        // produção pareceria idêntico, mas sob clock skew a janela idle e o teto absoluto
        // divergem — e nenhum teste determinístico consegue provar a expiração.
        .values({ accountId, tokenHash, createdAt: now, expiresAt, lastSeenAt: now })
        .returning({ id: session.id });
      if (!created) throw new Error('falha ao criar sessão');
      // ⚠️ A poda é UM statement só, com o SELECT das mantidas como SUBQUERY — nunca dois.
      // Com dois (SELECT materializado + DELETE), em READ COMMITTED cada statement tira um
      // snapshot NOVO: um login CONCORRENTE da mesma conta que commite no meio fica visível ao
      // DELETE mas ausente da lista de mantidas, e é APAGADO. O outro cliente já recebeu 200 com
      // o token, que então dá 401 no primeiro uso, sem log nem sinal. Não depende do cap estar
      // cheio, e dois dispositivos (ou um duplo clique) bastam.
      // O `ne(id, created.id)` é cinto e suspensório: a linha recém-inserida nunca se auto-apaga.
      // Desempate por `id` além de `created_at` — dois logins no mesmo milissegundo teriam ordem
      // indefinida só pelo timestamp, e a poda precisa ser determinística.
      const manter = tx
        .select({ id: session.id })
        .from(session)
        .where(eq(session.accountId, accountId))
        .orderBy(desc(session.createdAt), desc(session.id))
        .limit(SESSION.maxLive);
      await tx
        .delete(session)
        .where(
          and(
            eq(session.accountId, accountId),
            ne(session.id, created.id),
            notInArray(session.id, manter),
          ),
        );
      return { id: created.id, expiresAt };
    });
  } catch {
    throw new Error('não foi possível criar a sessão'); // OP-11: sem SQL/constraint
  }
}

/**
 * Resolve o token para a conta — **só se a sessão estiver viva nos DOIS relógios**: dentro do teto
 * absoluto (`expires_at`) e dentro da janela idle (`last_seen_at` recente). Ambos no WHERE: a
 * decisão é do banco, sem janela de leitura-e-decisão.
 */
export async function readSessionByHash(
  db: Db,
  tokenHash: string,
  nowMs: number,
): Promise<SessionView | null> {
  const now = new Date(nowMs);
  const idleFloor = new Date(nowMs - SESSION.idleTtlMs);
  const [row] = await db
    .select({ accountId: session.accountId, lastSeenAt: session.lastSeenAt })
    .from(session)
    .where(
      and(
        eq(session.tokenHash, tokenHash),
        gt(session.expiresAt, now),
        gt(session.lastSeenAt, idleFloor),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Desliza a janela idle. **Write condicional atômico** (o throttle vive no WHERE): só escreve se o
 * `last_seen_at` já passou de `touchThrottleMs`. Devolve `true` se escreveu — o teste usa isso para
 * provar 1 UPDATE em dois usos seguidos.
 */
export async function touchSession(db: Db, tokenHash: string, nowMs: number): Promise<boolean> {
  const rows = await db
    .update(session)
    .set({ lastSeenAt: new Date(nowMs) })
    .where(
      and(
        eq(session.tokenHash, tokenHash),
        lt(session.lastSeenAt, new Date(nowMs - SESSION.touchThrottleMs)),
      ),
    )
    .returning({ id: session.id });
  return rows.length > 0;
}

/** Logout: DELETA a linha (a "rotação no logout" do `sdd.md:80`). Idempotente — apagar o que já
 *  não existe é no-op, e é isso que impede a rota de virar oráculo de validade do token. */
export async function deleteSession(db: Db, tokenHash: string): Promise<void> {
  await db.delete(session).where(eq(session.tokenHash, tokenHash));
}

/**
 * Purga as sessões vencidas pelo teto ABSOLUTO (`expires_at < now`). Roda 1× por tick, isolada.
 * ⚠️ Sessões mortas só por IDLE continuam na tabela até o teto absoluto — decisão da SPEC-037
 * (o cap de `maxLive` por conta é o que limita o acúmulo). Devolve quantas linhas caíram.
 */
export async function deleteExpiredSessions(db: Db, nowMs: number): Promise<number> {
  const rows = await db
    .delete(session)
    .where(lt(session.expiresAt, new Date(nowMs)))
    .returning({ id: session.id });
  return rows.length;
}
