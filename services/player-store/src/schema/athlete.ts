// Atleta que o humano encarna (SPEC-016). Identidade STANDALONE — SEM FK ao world-store
// (colocar no mundo é o card 21, bloqueado pelo snapshot imutável). Os 4 focos são inteiros
// 0..99 (CHECK); `training_xp` é o SEAM da barra de treino (o card 13 enche). Índice único
// parcial `(account_id) WHERE active` = invariante "1 atleta ativo por conta".
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Appearance } from '@camisa-9/player';
import { account, playerSchema } from './account.js';
import { team } from './team.js';

export const athlete = playerSchema.table(
  'athlete',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    name: text('name').notNull(),
    position: text('position').notNull(),
    appearance: jsonb('appearance').$type<Appearance>().notNull(),
    fisico: integer('fisico').notNull(),
    tecnico: integer('tecnico').notNull(),
    tatico: integer('tatico').notNull(),
    mental: integer('mental').notNull(),
    trainingXp: integer('training_xp').notNull().default(0),
    // Pontos livres GANHOS por treino e ainda não gastos (SPEC-017, card 13). O gasto (+1 num
    // foco) decrementa este pool; a barra `training_xp` é o acumulador rumo ao próximo ponto.
    freePoints: integer('free_points').notNull().default(0),
    // Streak de FOCO do treino (SPEC-019, card 2.7): `last_focus` = último foco treinado (NULL =
    // nunca treinou), `focus_streak` = sessões consecutivas nele. Alimentam o rendimento
    // decrescente ao repetir (a regra é da lib pura; a coluna é `text` sem CHECK de enum, como
    // `position`). Membros novos começam frescos.
    lastFocus: text('last_focus'),
    focusStreak: integer('focus_streak').notNull().default(0),
    // Time do quinteto (SPEC-018). NULL = solo; setado no create/join do time. A `position`
    // acima é a vaga reivindicada no elenco. Membros do time = atletas com este `team_id`.
    teamId: uuid('team_id').references(() => team.id),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneActive: uniqueIndex('athlete_one_active_per_account')
      .on(t.accountId)
      .where(sql`${t.active}`),
    fisicoRange: check('athlete_fisico_range', sql`${t.fisico} between 0 and 99`),
    tecnicoRange: check('athlete_tecnico_range', sql`${t.tecnico} between 0 and 99`),
    taticoRange: check('athlete_tatico_range', sql`${t.tatico} between 0 and 99`),
    mentalRange: check('athlete_mental_range', sql`${t.mental} between 0 and 99`),
    freePointsRange: check('athlete_free_points_range', sql`${t.freePoints} >= 0`),
    focusStreakRange: check('athlete_focus_streak_range', sql`${t.focusStreak} >= 0`),
  }),
);
