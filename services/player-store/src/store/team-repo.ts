// Time do quinteto (SPEC-018, card R14) — create/join/lock/read numa transação atômica. A regra
// (validação de nome/camisa/código, vagas por posição, marcos) é da lib pura (@camisa-9/player);
// aqui só persiste + gera o código (ALEATÓRIO, impuro). Concorrência no JOIN: SELECT … FOR UPDATE
// no team (lição SPEC-017). Erros de domínio GENÉRICOS (OP-11) — nada de SQL/constraint vaza.
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  canClaim,
  createTeam,
  humanCount,
  isPosition,
  milestone,
  slotsRemaining,
  validateCodeFormat,
  validatePassword,
  TEAM,
  type AthleteDraft,
  type ClaimedByPosition,
  type Kit,
  type Position,
  type TeamDraft,
} from '@camisa-9/player';
import type { Db } from '../client.js';
import { athlete } from '../schema/athlete.js';
import { team } from '../schema/team.js';
import { hashPassword } from './auth.js';
import {
  insertAccount,
  insertAthlete,
  isUniqueViolation,
  normalizeEmail,
  type Tx,
} from './player-repo.js';

/** Erro de domínio (mensagem já genérica — OP-11). Distingue do erro INESPERADO (que é mascarado). */
class DomainError extends Error {}

export interface CreateTeamInput {
  readonly email: string;
  readonly password: string;
  readonly draft: AthleteDraft;
  readonly teamName: string;
  readonly kit: Kit;
  readonly captainPosition: Position;
}
export interface CreateTeamResult {
  readonly accountId: string;
  readonly athleteId: string;
  readonly teamId: string;
  readonly code: string;
}

/** Capitão: cria conta + time (com código) + o próprio atleta na vaga escolhida. Uma transação. */
export async function createAccountWithTeam(
  db: Db,
  input: CreateTeamInput,
): Promise<CreateTeamResult> {
  if (!validatePassword(input.password).ok) throw new DomainError('senha inválida');
  const draftTeam = createTeam({
    name: input.teamName,
    kit: input.kit,
    captainPosition: input.captainPosition,
  });
  if (!draftTeam.ok) throw new DomainError(draftTeam.reason);
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const accountId = await insertAccount(tx, email, passwordHash);
      const { teamId, code } = await insertTeamWithCode(tx, accountId, draftTeam.value);
      const athleteId = await insertAthlete(tx, accountId, input.draft, {
        position: input.captainPosition,
        teamId,
      });
      return { accountId, athleteId, teamId, code };
    });
  } catch (err) {
    throw toDomainError(err, 'não foi possível criar o time');
  }
}

export interface JoinTeamInput {
  readonly email: string;
  readonly password: string;
  readonly draft: AthleteDraft;
  readonly code: string;
  readonly position: Position;
}
export interface JoinTeamResult {
  readonly accountId: string;
  readonly athleteId: string;
  readonly teamId: string;
}

/** Amigo entra com o código na vaga escolhida. Transação + FOR UPDATE no team (corrida pela vaga). */
export async function joinTeamWithCode(db: Db, input: JoinTeamInput): Promise<JoinTeamResult> {
  if (!validatePassword(input.password).ok) throw new DomainError('senha inválida');
  if (!isPosition(input.position)) throw new DomainError('posição inválida');
  const fmt = validateCodeFormat(input.code);
  if (!fmt.ok) throw new DomainError('código inválido');
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const t = await loadTeamForUpdate(tx, fmt.value);
      if (!t) throw new DomainError('código inválido');
      if (t.locked) throw new DomainError('time indisponível');
      const claimed = await claimedByPosition(tx, t.id);
      if (humanCount(claimed) >= TEAM.fullSquad) throw new DomainError('time cheio');
      if (!canClaim(claimed, input.position)) throw new DomainError('posição sem vaga');
      const accountId = await insertAccount(tx, email, passwordHash);
      const athleteId = await insertAthlete(tx, accountId, input.draft, {
        position: input.position,
        teamId: t.id,
      });
      if (humanCount(claimed) + 1 >= TEAM.fullSquad) {
        await tx.update(team).set({ locked: true }).where(eq(team.id, t.id));
      }
      return { accountId, athleteId, teamId: t.id };
    });
  } catch (err) {
    throw toDomainError(err, 'não foi possível entrar no time');
  }
}

/** Tranca o elenco (só o capitão). */
export async function lockTeam(db: Db, teamId: string, captainAccountId: string): Promise<void> {
  const rows = await db
    .select({ captain: team.captainAccountId })
    .from(team)
    .where(eq(team.id, teamId))
    .limit(1);
  if (rows[0]?.captain !== captainAccountId) throw new DomainError('operação não permitida');
  await db.update(team).set({ locked: true }).where(eq(team.id, teamId));
}

export interface TeamView {
  readonly id: string;
  readonly name: string;
  readonly kit: Kit;
  readonly code: string;
  readonly locked: boolean;
  readonly humanCount: number;
  readonly milestone: ReturnType<typeof milestone>;
  readonly slotsRemaining: Record<Position, number>;
  readonly members: ReadonlyArray<{ athleteId: string; name: string; position: Position }>;
}

/** Estado do time (por id ou código) p/ UI/testes. `null` se não existe. */
export async function readTeam(
  db: Db,
  sel: { teamId?: string; code?: string },
): Promise<TeamView | null> {
  const rows = await db
    .select({ id: team.id, name: team.name, kit: team.kit, code: team.code, locked: team.locked })
    .from(team)
    .where(
      sel.teamId ? eq(team.id, sel.teamId) : eq(team.code, (sel.code ?? '').trim().toUpperCase()),
    )
    .limit(1);
  const t = rows[0];
  if (!t) return null;
  const members = await readMembers(db, t.id);
  const claimed = tally(members.map((m) => m.position));
  const count = humanCount(claimed);
  return {
    ...t,
    humanCount: count,
    milestone: milestone(count),
    slotsRemaining: slotsRemaining(claimed),
    members,
  };
}

async function insertTeamWithCode(
  tx: Tx,
  captainAccountId: string,
  draft: TeamDraft,
): Promise<{ teamId: string; code: string }> {
  const code = await freeCode(tx);
  const [row] = await tx
    .insert(team)
    .values({ name: draft.name, kit: draft.kit, code, captainAccountId })
    .returning({ id: team.id });
  if (!row) throw new DomainError('não foi possível criar o time');
  return { teamId: row.id, code };
}

/** Gera um código livre (pré-checa a unicidade; o UNIQUE do banco é a rede final). */
async function freeCode(tx: Tx): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateCode();
    const hit = await tx.select({ id: team.id }).from(team).where(eq(team.code, code)).limit(1);
    if (!hit[0]) return code;
  }
  throw new DomainError('não foi possível gerar o código');
}

function generateCode(): string {
  let out = '';
  for (let i = 0; i < TEAM.code.len; i++)
    out += TEAM.code.alphabet[randomInt(TEAM.code.alphabet.length)];
  return out;
}

async function loadTeamForUpdate(
  tx: Tx,
  code: string,
): Promise<{ id: string; locked: boolean } | null> {
  const rows = await tx
    .select({ id: team.id, locked: team.locked })
    .from(team)
    .where(eq(team.code, code))
    .limit(1)
    .for('update');
  return rows[0] ?? null;
}

async function claimedByPosition(tx: Tx, teamId: string): Promise<ClaimedByPosition> {
  const rows = await tx
    .select({ position: athlete.position })
    .from(athlete)
    .where(eq(athlete.teamId, teamId));
  return tally(rows.map((r) => r.position));
}

async function readMembers(
  db: Db,
  teamId: string,
): Promise<Array<{ athleteId: string; name: string; position: Position }>> {
  const rows = await db
    .select({ athleteId: athlete.id, name: athlete.name, position: athlete.position })
    .from(athlete)
    .where(eq(athlete.teamId, teamId));
  return rows.map((r) => ({
    athleteId: r.athleteId,
    name: r.name,
    position: asPosition(r.position),
  }));
}

/** Conta as posições ocupadas (ignora valores fora das 4 — não devem existir). */
function tally(positions: readonly string[]): ClaimedByPosition {
  const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of positions) {
    if (p === 'GK' || p === 'DEF' || p === 'MID' || p === 'FWD') c[p] += 1;
  }
  return c;
}

function asPosition(p: string): Position {
  if (p === 'GK' || p === 'DEF' || p === 'MID' || p === 'FWD') return p;
  throw new DomainError('posição inválida');
}

/** Sai do quinteto (SPEC-033): o humano transferido RACHA o time (`team_id` → NULL). Idempotente
 *  (solo = no-op). A contagem/marcos do time são derivados do `team_id` → se ajustam sozinhos. */
export async function leaveTeam(db: Db, athleteId: string): Promise<void> {
  await db.update(athlete).set({ teamId: null }).where(eq(athlete.id, athleteId));
}

function toDomainError(err: unknown, fallback: string): DomainError {
  if (isUniqueViolation(err)) return new DomainError('e-mail já em uso');
  if (err instanceof DomainError) return err;
  return new DomainError(fallback);
}
