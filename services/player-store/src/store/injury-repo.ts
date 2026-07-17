// Lesões persistidas (SPEC-026, card 2.5) — o arco. `injureFromMatch` é o SEAM da ocorrência (a
// partida rica injeta); `advanceRecovery` é o passe diário que fecha o arco no prazo (a volta por
// cima); `readInjuryState` dá a lesão ativa + `available` (o seam que o mundo lê); `readInjuryLog` é
// a história. SÓ player-store (a disponibilidade é seam; zero cross-schema). Erros genéricos (OP-11).
import { and, desc, eq, sql } from 'drizzle-orm';
import { isAvailable, isSeverity, recoveryDaysFor, type Injury } from '@camisa-9/player';
import type { Db } from '../client.js';
import { injury } from '../schema/injury.js';

export interface InjuryState {
  readonly injury: Injury | null;
  readonly available: boolean;
}

export interface InjuryLogEntry {
  readonly id: string;
  readonly severity: string;
  readonly startedDay: number;
  readonly recoveryDays: number;
  readonly status: string;
}

/** O SEAM da ocorrência: a partida rica (card 1.1/3.2) injeta a lesão. Cria a lesão ATIVA; se já há
 *  uma GENUINAMENTE ativa (ainda recuperando), é no-op (1 ativa/atleta). Sob lock advisory +
 *  fecha-lazily a vencida (o índice parcial é a rede de segurança). Gravidade validada (OP-11). */
export async function injureFromMatch(
  db: Db,
  athleteId: string,
  day: number,
  severity: string,
): Promise<{ injured: boolean }> {
  if (!isSeverity(severity)) throw new Error('gravidade inválida');
  return db.transaction(async (tx) => {
    // Lock advisory (atleta) — serializa ocorrências concorrentes (exatamente 1 vence). Depois FECHA
    // lazily a lesão cujo prazo JÁ venceu: senão a linha stale (ainda status=active, mas o arco já
    // diz "recuperado") bloquearia a nova por status → reconcilia o "1 ativa" (status) com o arco
    // (dia) — a inconsistência que a revisão pegou.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`injury:${athleteId}`}, 0))`,
    );
    await tx
      .update(injury)
      .set({ status: 'recovered' })
      .where(
        and(
          eq(injury.athleteId, athleteId),
          eq(injury.status, 'active'),
          sql`${injury.startedDay} + ${injury.recoveryDays} <= ${day}`,
        ),
      );
    const active = await tx
      .select({ id: injury.id })
      .from(injury)
      .where(and(eq(injury.athleteId, athleteId), eq(injury.status, 'active')))
      .limit(1);
    if (active.length > 0) return { injured: false }; // ainda recuperando (genuína) → no-op
    await tx.insert(injury).values({
      athleteId,
      severity,
      startedDay: day,
      recoveryDays: recoveryDaysFor(severity),
    });
    return { injured: true };
  });
}

/** O passe diário: fecha o arco da lesão ativa cujo prazo venceu (status=recovered — a volta por
 *  cima). Condicional (`status='active' AND started+recovery <= currentDay`). Devolve se recuperou. */
export async function advanceRecovery(
  db: Db,
  athleteId: string,
  currentDay: number,
): Promise<{ recovered: boolean }> {
  const rows = await db
    .update(injury)
    .set({ status: 'recovered' })
    .where(
      and(
        eq(injury.athleteId, athleteId),
        eq(injury.status, 'active'),
        sql`${injury.startedDay} + ${injury.recoveryDays} <= ${currentDay}`,
      ),
    )
    .returning({ id: injury.id });
  return { recovered: rows.length > 0 };
}

/** A lesão ATIVA (ou null) + `available` (derivado do arco — recuperando = indisponível; o SEAM que
 *  o mundo/partida lê). O `currentDay` decide a fase mesmo antes de o passe fechar o status. */
export async function readInjuryState(
  db: Db,
  athleteId: string,
  currentDay: number,
): Promise<InjuryState> {
  const [row] = await db
    .select({
      severity: injury.severity,
      startedDay: injury.startedDay,
      recoveryDays: injury.recoveryDays,
    })
    .from(injury)
    .where(and(eq(injury.athleteId, athleteId), eq(injury.status, 'active')))
    .limit(1);
  const inj: Injury | null =
    row && isSeverity(row.severity)
      ? { severity: row.severity, startedDay: row.startedDay, recoveryDays: row.recoveryDays }
      : null;
  return { injury: inj, available: isAvailable(inj, currentDay) };
}

/** O histórico de lesões (a HISTÓRIA) — mais recentes primeiro. */
export async function readInjuryLog(db: Db, athleteId: string): Promise<InjuryLogEntry[]> {
  const rows = await db
    .select()
    .from(injury)
    .where(eq(injury.athleteId, athleteId))
    .orderBy(desc(injury.startedDay));
  return rows.map((r) => ({
    id: r.id,
    severity: r.severity,
    startedDay: r.startedDay,
    recoveryDays: r.recoveryDays,
    status: r.status,
  }));
}
