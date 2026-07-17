// Schema do SNAPSHOT do mundo (SPEC-013 — Fatia 1). Materializa o WorldState que o
// world-engine produz em memória. A `seed` é a FONTE-DA-VERDADE (coluna de 1ª classe);
// o snapshot é cache consultável, reconstruível por replay — nunca autoridade.
// `strength` NÃO é persistida (derivada de `clubStrength` na leitura). Ordem canônica
// preservada via coluna `ord` (posição do item na lista do WorldState).
import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** O mundo semeado: a seed é a raiz e a fonte-da-verdade. */
export const world = pgTable('world', {
  seed: text('seed').primaryKey(),
  seasonId: text('season_id').notNull(),
});

/** Andar da pirâmide (SPEC-009: tier→[leagues]). */
export const worldTier = pgTable(
  'world_tier',
  {
    worldSeed: text('world_seed')
      .notNull()
      .references(() => world.seed),
    tier: integer('tier').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.worldSeed, t.tier] }) }),
);

/** Liga (grupo) dentro de um andar. `ord` = posição da liga no andar. */
export const league = pgTable(
  'league',
  {
    worldSeed: text('world_seed').notNull(),
    tier: integer('tier').notNull(),
    leagueId: text('league_id').notNull(),
    ord: integer('ord').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldSeed, t.leagueId] }),
    tierFk: foreignKey({
      columns: [t.worldSeed, t.tier],
      foreignColumns: [worldTier.worldSeed, worldTier.tier],
    }),
  }),
);

/** Clube: elenco + arquétipo/pesos seed-sorteados. `strength` é derivada — não entra. */
export const club = pgTable(
  'club',
  {
    worldSeed: text('world_seed').notNull(),
    leagueId: text('league_id').notNull(),
    id: text('id').notNull(),
    ord: integer('ord').notNull(),
    name: text('name').notNull(),
    archetype: text('archetype').notNull(),
    weights: jsonb('weights').$type<number[]>().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldSeed, t.id] }),
    leagueFk: foreignKey({
      columns: [t.worldSeed, t.leagueId],
      foreignColumns: [league.worldSeed, league.leagueId],
    }),
  }),
);

/** Atleta NPC. `ord` = posição no elenco (POSITIONS × squadShape). `is_human` (SPEC-020, card
 *  21) = a vaga foi assumida por um humano — CACHE derivada de `world_occupation` (a autoridade);
 *  a viragem (Fatia 3) vai ler este flag para tornar o humano imune. */
export const athlete = pgTable(
  'athlete',
  {
    worldSeed: text('world_seed').notNull(),
    clubId: text('club_id').notNull(),
    id: text('id').notNull(),
    ord: integer('ord').notNull(),
    name: text('name').notNull(),
    age: integer('age').notNull(),
    ability: integer('ability').notNull(),
    position: text('position').notNull(),
    isHuman: boolean('is_human').notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldSeed, t.id] }),
    clubFk: foreignKey({
      columns: [t.worldSeed, t.clubId],
      foreignColumns: [club.worldSeed, club.id],
    }),
  }),
);

/**
 * Ocupação HUMANA de uma vaga (SPEC-020, card 21) — a AUTORIDADE de "o humano X ocupa esta
 * vaga". A linha do atleta (`name`/`ability`/`is_human`) é cache DERIVADA disto: seed + ocupações
 * = replayável (evolução aprovada do invariante "snapshot é cache"). Para o replay ser HONESTO,
 * o overlay carrega os VALORES CONGELADOS que sobrescrevem o NPC (`human_name` + `ability`) — o
 * `ability` é projeção dos focos MUTÁVEIS do player (o treino cresce depois), então não é
 * recuperável do player; tem de morar aqui. `human_athlete_id` é ref LÓGICA ao `player.athlete.id`
 * (sem FK cross-schema — validada na borda, como `position`).
 */
export const worldOccupation = pgTable(
  'world_occupation',
  {
    worldSeed: text('world_seed').notNull(),
    athleteId: text('athlete_id').notNull(),
    humanAthleteId: uuid('human_athlete_id').notNull(),
    seasonId: text('season_id').notNull(),
    clubId: text('club_id').notNull(),
    position: text('position').notNull(),
    humanName: text('human_name').notNull(),
    ability: integer('ability').notNull(),
    // Regen voluntário (SPEC-022): o jogador liga esta flag (idade ≥ 25) para renascer na próxima
    // virada. O regen forçado (idade ≥ 42) não depende dela. O `runRegenPass` a consome pós-virada.
    regenRequested: boolean('regen_requested').notNull().default(false),
    occupiedAt: timestamp('occupied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldSeed, t.athleteId] }),
    oneSlotPerHuman: uniqueIndex('occupation_one_slot_per_human').on(t.worldSeed, t.humanAthleteId),
    athleteFk: foreignKey({
      columns: [t.worldSeed, t.athleteId],
      foreignColumns: [athlete.worldSeed, athlete.id],
    }),
  }),
);
