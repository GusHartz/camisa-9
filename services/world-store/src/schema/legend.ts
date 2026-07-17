// Hall of Fame (SPEC-022, card Regen). Quando uma carreira humana termina (idade ≥42, ou por
// escolha ≥25), ela é CONGELADA aqui antes do renascimento — o nome antigo vira lenda permanente.
// É o único registro durável do humano (o `turnover_report` guarda só diff de NPC, e o imune nunca
// aparece nele). PK `(world_seed, human_athlete_id, season_ended)` = N lendas por humano ao longo
// dos renascimentos. `legacy_points` = o banco de largada que o herdeiro daquela virada recebeu.
import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const legend = pgTable(
  'legend',
  {
    worldSeed: text('world_seed').notNull(),
    humanAthleteId: uuid('human_athlete_id').notNull(),
    seasonEnded: text('season_ended').notNull(),
    humanName: text('human_name').notNull(),
    clubId: text('club_id').notNull(),
    position: text('position').notNull(),
    ability: integer('ability').notNull(),
    age: integer('age').notNull(),
    legacyPoints: integer('legacy_points').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.worldSeed, t.humanAthleteId, t.seasonEnded] }) }),
);
