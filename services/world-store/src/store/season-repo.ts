// Reader/writer da âncora de temporada (SPEC-015). `start_day_index` é semeado
// explicitamente por ops (setSeasonAnchor) — pré-condição do tick diário. Re-ancorar
// (empurrar o calendário após um dia adiado) é upsert deliberado, nunca automático.
import { and, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { season } from '../schema/season.js';

/** Grava (ou re-ancora) o dia-índice do round 1 de uma temporada. */
export async function setSeasonAnchor(
  db: Db,
  seed: string,
  seasonId: string,
  startDayIndex: number,
): Promise<void> {
  await db
    .insert(season)
    .values({ worldSeed: seed, seasonId, startDayIndex })
    .onConflictDoUpdate({ target: [season.worldSeed, season.seasonId], set: { startDayIndex } });
}

/** Lê o dia-índice do round 1 (null se a temporada não foi ancorada). */
export async function readSeasonAnchor(
  db: Db,
  seed: string,
  seasonId: string,
): Promise<number | null> {
  const rows = await db
    .select({ startDayIndex: season.startDayIndex })
    .from(season)
    .where(and(eq(season.worldSeed, seed), eq(season.seasonId, seasonId)))
    .limit(1);
  return rows[0]?.startDayIndex ?? null;
}
