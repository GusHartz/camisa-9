// Schema do SNAPSHOT do mundo (SPEC-013 — Fatia 1). Materializa o WorldState que o
// world-engine produz em memória. A `seed` é a FONTE-DA-VERDADE (coluna de 1ª classe);
// o snapshot é cache consultável, reconstruível por replay — nunca autoridade.
// `strength` NÃO é persistida (derivada de `clubStrength` na leitura). Ordem canônica
// preservada via coluna `ord` (posição do item na lista do WorldState).
import { foreignKey, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

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

/** Atleta NPC. `ord` = posição no elenco (POSITIONS × squadShape). */
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
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldSeed, t.id] }),
    clubFk: foreignKey({
      columns: [t.worldSeed, t.clubId],
      foreignColumns: [club.worldSeed, club.id],
    }),
  }),
);
