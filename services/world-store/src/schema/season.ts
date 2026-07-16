// Âncora de temporada (SPEC-015 — 1.2). Guarda o `start_day_index`: o dayIndex (id de
// dia do resolveSlot) em que o round 1 da temporada acontece — o que o snapshot NÃO tem
// (readWorld só dá o rótulo season_id). Destrava o mapa dia→rodada (Model B calendar-
// derived: targetRound = dayIndex - start_day_index + 1). É INPUT DE OPS, não derivável
// da seed — semeado explicitamente por setSeasonAnchor. Também servirá o rollover (Fatia 3).
import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { world } from './world.js';

export const season = pgTable(
  'season',
  {
    worldSeed: text('world_seed')
      .notNull()
      .references(() => world.seed),
    seasonId: text('season_id').notNull(),
    startDayIndex: integer('start_day_index').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.worldSeed, t.seasonId] }) }),
);
