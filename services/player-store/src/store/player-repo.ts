// Criação de conta + atleta (SPEC-016) — uma transação all-or-nothing (padrão do projeto).
// Recebe um AthleteDraft JÁ validado pela lib pura (@camisa-9/player); aqui só persiste +
// hasheia. E-mail duplicado → erro GENÉRICO (OP-11), nunca vaza SQL/constraint.
import { and, eq } from 'drizzle-orm';
import { validatePassword, type AthleteDraft } from '@camisa-9/player';
import type { Db } from '../client.js';
import { account } from '../schema/account.js';
import { athlete } from '../schema/athlete.js';
import { hashPassword } from './auth.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface SignupInput {
  readonly email: string;
  readonly password: string;
  readonly draft: AthleteDraft;
}

export interface SignupResult {
  readonly accountId: string;
  readonly athleteId: string;
}

/** Cria conta + atleta numa ÚNICA transação. Falha (ex. e-mail duplicado) → ROLLBACK total. */
export async function createAccountWithAthlete(db: Db, input: SignupInput): Promise<SignupResult> {
  if (!validatePassword(input.password).ok) throw new Error('senha inválida');
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const accountId = await insertAccount(tx, email, passwordHash);
      const athleteId = await insertAthlete(tx, accountId, input.draft);
      return { accountId, athleteId };
    });
  } catch (err) {
    throw isUniqueViolation(err) ? new Error('e-mail já em uso') : new Error('não foi possível criar a conta');
  }
}

async function insertAccount(tx: Tx, email: string, passwordHash: string): Promise<string> {
  const [row] = await tx.insert(account).values({ email, passwordHash }).returning({ id: account.id });
  if (!row) throw new Error('falha ao criar conta');
  return row.id;
}

async function insertAthlete(tx: Tx, accountId: string, draft: AthleteDraft): Promise<string> {
  const [row] = await tx
    .insert(athlete)
    .values({
      accountId,
      name: draft.name,
      position: draft.position,
      appearance: draft.appearance,
      fisico: draft.attributes.fisico,
      tecnico: draft.attributes.tecnico,
      tatico: draft.attributes.tatico,
      mental: draft.attributes.mental,
    })
    .returning({ id: athlete.id });
  if (!row) throw new Error('falha ao criar atleta');
  return row.id;
}

/** Id da conta por e-mail (null se não existe). Para uniqueness/futuro login. */
export async function readAccountByEmail(db: Db, email: string): Promise<string | null> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(eq(account.email, normalizeEmail(email)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Atleta ATIVO de uma conta (null se nenhum). */
export async function readActiveAthlete(
  db: Db,
  accountId: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await db
    .select({ id: athlete.id, name: athlete.name })
    .from(athlete)
    .where(and(eq(athlete.accountId, accountId), eq(athlete.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** pg unique_violation = SQLSTATE 23505. O Drizzle ENVELOPA o erro do pg, então o `code`
 *  fica em `err.cause` — caminhamos a cadeia de causas. Narrow sem `any` (OP-14). */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && isRecord(cur); i++) {
    if (cur['code'] === '23505') return true;
    cur = cur['cause'];
  }
  return false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
