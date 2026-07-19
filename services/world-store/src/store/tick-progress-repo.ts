// Cursor de progresso do tick (SPEC-032). O `last_day_index` é o último dia cuja RODADA DO
// MUNDO liquidou; o catch-up retoma de `last + 1`. `advanceTickCursor` é um upsert MONOTÔNICO
// (só avança — `greatest` protege contra dois ticks concorrentes / avanço fora de ordem).
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { tickProgress } from '../schema/tick-progress.js';

/** O último dayIndex liquidado deste mundo (null se o tick nunca rodou). */
export async function readTickCursor(db: Db, seed: string): Promise<number | null> {
  const rows = await db
    .select({ lastDayIndex: tickProgress.lastDayIndex })
    .from(tickProgress)
    .where(eq(tickProgress.worldSeed, seed))
    .limit(1);
  return rows[0]?.lastDayIndex ?? null;
}

/** Avança o cursor até `dayIndex` (monotônico: nunca retrocede). Idempotente. */
export async function advanceTickCursor(db: Db, seed: string, dayIndex: number): Promise<void> {
  await db
    .insert(tickProgress)
    .values({ worldSeed: seed, lastDayIndex: dayIndex })
    .onConflictDoUpdate({
      target: tickProgress.worldSeed,
      set: { lastDayIndex: sql`greatest(${tickProgress.lastDayIndex}, ${dayIndex})` },
    });
}
