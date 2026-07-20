// Criação de conta + atleta (SPEC-016) — uma transação all-or-nothing (padrão do projeto).
// Recebe um AthleteDraft JÁ validado pela lib pura (@camisa-9/player); aqui só persiste +
// hasheia. E-mail duplicado → erro GENÉRICO (OP-11), nunca vaza SQL/constraint.
import { and, eq } from 'drizzle-orm';
import {
  pointsEarnedTotal,
  regenLegacyPoints,
  validatePassword,
  type Appearance,
  type Attributes,
  type AthleteDraft,
  type Position,
} from '@camisa-9/player';
import type { Db } from '../client.js';
import { account } from '../schema/account.js';
import { athlete } from '../schema/athlete.js';
import { hashPassword } from './auth.js';

/** Handle de transação — reusado pelos repos de conta/atleta (SPEC-016) e de time (SPEC-018). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

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
    throw isUniqueViolation(err)
      ? new Error('e-mail já em uso')
      : new Error('não foi possível criar a conta');
  }
}

export async function insertAccount(tx: Tx, email: string, passwordHash: string): Promise<string> {
  const [row] = await tx
    .insert(account)
    .values({ email, passwordHash })
    .returning({ id: account.id });
  if (!row) throw new Error('falha ao criar conta');
  return row.id;
}

/** Insere o atleta. `opts` sobrepõe a posição (vaga do time) e liga o `team_id` (SPEC-018). */
export async function insertAthlete(
  tx: Tx,
  accountId: string,
  draft: AthleteDraft,
  opts?: { position?: Position; teamId?: string },
): Promise<string> {
  const [row] = await tx
    .insert(athlete)
    .values({
      accountId,
      name: draft.name,
      position: opts?.position ?? draft.position,
      appearance: draft.appearance,
      fisico: draft.attributes.fisico,
      tecnico: draft.attributes.tecnico,
      tatico: draft.attributes.tatico,
      mental: draft.attributes.mental,
      teamId: opts?.teamId,
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

/** Identidade do atleta (nome/posição/focos/ativo) — o que a costura de entrada no mundo
 *  (SPEC-020, card 21) precisa para projetar `ability` e ocupar a vaga. `position` volta como
 *  `string` (a coluna é `text`); a borda valida com `isPosition`. Sem PII sensível. */
export interface AthleteIdentity {
  readonly name: string;
  readonly position: string;
  readonly attributes: Attributes;
  readonly active: boolean;
  /** A aparência escolhida na criação (SPEC-016) — a faixa monta o avatar em camadas a partir dela
   *  (SPEC-038). Aditivo: a coluna sempre existiu; só o SELECT passou a puxá-la. */
  readonly appearance: Appearance;
}

/** Lê a identidade de um atleta por id (null se não existe). */
export async function readAthleteIdentity(
  db: Db,
  athleteId: string,
): Promise<AthleteIdentity | null> {
  const rows = await db
    .select({
      name: athlete.name,
      position: athlete.position,
      fisico: athlete.fisico,
      tecnico: athlete.tecnico,
      tatico: athlete.tatico,
      mental: athlete.mental,
      active: athlete.active,
      appearance: athlete.appearance,
    })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    name: r.name,
    position: r.position,
    attributes: { fisico: r.fisico, tecnico: r.tecnico, tatico: r.tatico, mental: r.mental },
    active: r.active,
    appearance: r.appearance,
  };
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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Resultado do renascimento (SPEC-022): o novo atleta ativo + o banco de pontos de legado
 *  (também gravado no Hall of Fame pela borda). */
export interface RebirthResult {
  readonly newAthleteId: string;
  readonly legacyPoints: number;
}

interface AthleteForRebirth {
  readonly accountId: string;
  readonly position: string;
  readonly appearance: Appearance;
  readonly attributes: Attributes;
  readonly freePoints: number;
  readonly teamId: string | null;
  readonly active: boolean;
}

/**
 * Renascimento de carreira (SPEC-022): o atleta velho vira `active=false` (a lenda) e nasce um novo
 * atleta ATIVO na mesma conta — nome novo, `attributes` frescos (reset), `free_points` = LEGADO
 * (`legacyPct`% dos pontos da carreira anterior). Idempotente: se o velho já é inativo, devolve o
 * ativo atual da conta (o renascido já criado) sem duplicar. Reusa o índice "1 ativo por conta".
 */
export async function rebirthAthlete(
  db: Db,
  oldAthleteId: string,
  newName: string,
  attributes: Attributes,
): Promise<RebirthResult> {
  const old = await readAthleteForRebirth(db, oldAthleteId);
  if (!old) throw new Error('atleta não encontrado');
  const legacyPoints = regenLegacyPoints(pointsEarnedTotal(old.attributes, old.freePoints));
  if (!old.active) {
    const active = await readActiveAthlete(db, old.accountId);
    if (!active) throw new Error('renascimento inconsistente');
    return { newAthleteId: active.id, legacyPoints }; // já renasceu → no-op idempotente
  }
  try {
    const newAthleteId = await db.transaction((tx) =>
      insertReborn(tx, old, oldAthleteId, newName, attributes, legacyPoints),
    );
    return { newAthleteId, legacyPoints };
  } catch (err) {
    // OP-11: e-mail/índice em conflito (ex. renascimento concorrente) vira erro GENÉRICO — nunca
    // vaza SQL/constraint. Espelha `createAccountWithAthlete`.
    throw isUniqueViolation(err)
      ? new Error('renascimento concorrente')
      : new Error('não foi possível renascer');
  }
}

async function readAthleteForRebirth(db: Db, athleteId: string): Promise<AthleteForRebirth | null> {
  const rows = await db
    .select({
      accountId: athlete.accountId,
      position: athlete.position,
      appearance: athlete.appearance,
      fisico: athlete.fisico,
      tecnico: athlete.tecnico,
      tatico: athlete.tatico,
      mental: athlete.mental,
      freePoints: athlete.freePoints,
      teamId: athlete.teamId,
      active: athlete.active,
    })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    accountId: r.accountId,
    position: r.position,
    appearance: r.appearance,
    attributes: { fisico: r.fisico, tecnico: r.tecnico, tatico: r.tatico, mental: r.mental },
    freePoints: r.freePoints,
    teamId: r.teamId,
    active: r.active,
  };
}

async function insertReborn(
  tx: Tx,
  old: AthleteForRebirth,
  oldAthleteId: string,
  newName: string,
  attributes: Attributes,
  legacyPoints: number,
): Promise<string> {
  await tx.update(athlete).set({ active: false }).where(eq(athlete.id, oldAthleteId));
  const [row] = await tx
    .insert(athlete)
    .values({
      accountId: old.accountId,
      name: newName,
      position: old.position,
      appearance: old.appearance,
      fisico: attributes.fisico,
      tecnico: attributes.tecnico,
      tatico: attributes.tatico,
      mental: attributes.mental,
      freePoints: legacyPoints,
      teamId: old.teamId,
    })
    .returning({ id: athlete.id });
  if (!row) throw new Error('falha ao renascer');
  return row.id;
}

/** pg unique_violation = SQLSTATE 23505. O Drizzle ENVELOPA o erro do pg, então o `code`
 *  fica em `err.cause` — caminhamos a cadeia de causas. Narrow sem `any` (OP-14). */
export function isUniqueViolation(err: unknown): boolean {
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
