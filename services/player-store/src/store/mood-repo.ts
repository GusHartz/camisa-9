// Forma & Moral persistidas (SPEC-027, card 2.3) — as duas barras. `applyDailyMood` é o PASSE
// diário (decai a moral rumo ao alvo do estilo de vida + a forma rumo ao baseline, rebaixado se
// recuperando); `readMood` lê o par; `bumpMoral`/`bumpForma` são as primitivas de EVENTO-NA-FONTE
// (os repos irmãos as chamam DENTRO da própria transação: decisão → moral, comeback → moral, treino
// → forma). A MATEMÁTICA é da lib pura (@camisa-9/player). SÓ player-store. Erros genéricos (OP-11).
import { and, eq, inArray } from 'drizzle-orm';
import {
  aggregateTradeoffs,
  bumpBar,
  isAvailable,
  isSeverity,
  lifestyleMoralOffset,
  nextForma,
  nextMoral,
  type Injury,
} from '@camisa-9/player';
import type { Db } from '../client.js';
import { athlete } from '../schema/athlete.js';
import { purchase } from '../schema/purchase.js';
import { injury } from '../schema/injury.js';
import { dailyLedger } from '../schema/daily-ledger.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Mood {
  readonly forma: number;
  readonly moral: number;
}

/** O par (Forma, Moral) do atleta — `null` se não existe. */
export async function readMood(db: Db, athleteId: string): Promise<Mood | null> {
  const [row] = await db
    .select({ forma: athlete.forma, moral: athlete.moral })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1);
  return row ?? null;
}

/** Forma/Moral de VÁRIOS atletas de uma vez (batch) — a costura da partida (SPEC-029) usa para
 *  modular a ability dos humanos ocupantes. Devolve um mapa por id (ausentes ficam de fora). */
export async function readMoodByIds(
  db: Db,
  athleteIds: readonly string[],
): Promise<Map<string, Mood>> {
  if (athleteIds.length === 0) return new Map();
  const rows = await db
    .select({ id: athlete.id, forma: athlete.forma, moral: athlete.moral })
    .from(athlete)
    .where(inArray(athlete.id, [...athleteIds]));
  return new Map(rows.map((r) => [r.id, { forma: r.forma, moral: r.moral }]));
}

/** Os 4 focos VIVOS do atleta (0..99). */
export interface Focos {
  readonly fisico: number;
  readonly tecnico: number;
  readonly tatico: number;
  readonly mental: number;
}

/** Os focos vivos de VÁRIOS atletas (batch) — a costura da partida (SPEC-046) usa para injetar as
 *  afinidades de papel (Técnico→finishing, Tático→playmaking, Físico→durability) do humano no elenco.
 *  Devolve um mapa por id (ausentes ficam de fora). */
export async function readFocosByIds(
  db: Db,
  athleteIds: readonly string[],
): Promise<Map<string, Focos>> {
  if (athleteIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: athlete.id,
      fisico: athlete.fisico,
      tecnico: athlete.tecnico,
      tatico: athlete.tatico,
      mental: athlete.mental,
    })
    .from(athlete)
    .where(inArray(athlete.id, [...athleteIds]));
  return new Map(
    rows.map((r) => [
      r.id,
      { fisico: r.fisico, tecnico: r.tecnico, tatico: r.tatico, mental: r.mental },
    ]),
  );
}

/** O PASSE diário (`FOR UPDATE`): decai a Moral rumo a `baseline + offset do estilo de vida` (as
 *  compras possuídas) e a Forma rumo ao `baseline` (rebaixado enquanto recuperando de lesão no `day`).
 *  Monotônico (converge ao alvo, não oscila). Os eventos já entraram como bumps na fonte. IDEMPOTENTE
 *  por `(athlete, day)` via o ledger (SPEC-030): o claim 'mood' já rodado hoje → no-op (sem re-decair). */
export async function applyDailyMood(db: Db, athleteId: string, day: number): Promise<Mood> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ forma: athlete.forma, moral: athlete.moral })
      .from(athlete)
      .where(eq(athlete.id, athleteId))
      .limit(1)
      .for('update');
    if (!row) throw new Error('atleta não encontrado');
    const claimed = await tx
      .insert(dailyLedger)
      .values({ athleteId, day, scope: 'mood' })
      .onConflictDoNothing()
      .returning({ athleteId: dailyLedger.athleteId });
    if (claimed.length === 0) return { forma: row.forma, moral: row.moral }; // já decaiu hoje → no-op
    const owned = await tx
      .select({ itemId: purchase.itemId })
      .from(purchase)
      .where(eq(purchase.athleteId, athleteId));
    const offset = lifestyleMoralOffset(aggregateTradeoffs(owned.map((o) => o.itemId)));
    const recovering = await isRecovering(tx, athleteId, day);
    const moral = nextMoral(row.moral, offset);
    const forma = nextForma(row.forma, recovering);
    await tx.update(athlete).set({ forma, moral }).where(eq(athlete.id, athleteId));
    return { forma, moral };
  });
}

/** Aplica um delta de EVENTO à Moral, clampeado, DENTRO da transação do repo-fonte (`FOR UPDATE`
 *  para serializar contra o passe/outros bumps). No-op se delta 0 ou atleta inexistente. */
export async function bumpMoral(tx: Tx, athleteId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const [row] = await tx
    .select({ moral: athlete.moral })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1)
    .for('update');
  if (!row) return;
  await tx
    .update(athlete)
    .set({ moral: bumpBar(row.moral, delta) })
    .where(eq(athlete.id, athleteId));
}

/** Aplica um delta de EVENTO à Forma, clampeado, DENTRO da transação do repo-fonte. */
export async function bumpForma(tx: Tx, athleteId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const [row] = await tx
    .select({ forma: athlete.forma })
    .from(athlete)
    .where(eq(athlete.id, athleteId))
    .limit(1)
    .for('update');
  if (!row) return;
  await tx
    .update(athlete)
    .set({ forma: bumpBar(row.forma, delta) })
    .where(eq(athlete.id, athleteId));
}

/** O atleta está numa lesão ATIVA ainda recuperando no `day`? (o driver da Forma). */
async function isRecovering(tx: Tx, athleteId: string, day: number): Promise<boolean> {
  const [row] = await tx
    .select({
      severity: injury.severity,
      startedDay: injury.startedDay,
      recoveryDays: injury.recoveryDays,
    })
    .from(injury)
    .where(and(eq(injury.athleteId, athleteId), eq(injury.status, 'active')))
    .limit(1);
  if (!row || !isSeverity(row.severity)) return false;
  const inj: Injury = {
    severity: row.severity,
    startedDay: row.startedDay,
    recoveryDays: row.recoveryDays,
  };
  return !isAvailable(inj, day);
}
