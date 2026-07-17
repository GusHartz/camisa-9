// Lesões (SPEC-026, card 2.5) — o arco persistido. Uma linha por lesão; `status` active → recovered
// (o passe diário `advanceRecovery` fecha o arco no prazo). Índice único parcial `(athlete_id) WHERE
// status='active'` = 1 lesão ativa por atleta. A OCORRÊNCIA é seam (a partida rica injeta); a
// disponibilidade é derivada (o mundo lê). `severity` é `text` sem CHECK de enum (validado na borda
// com `isSeverity`, como `position`). No schema `player`.
import { sql } from 'drizzle-orm';
import { integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { playerSchema } from './account.js';
import { athlete } from './athlete.js';

export const injury = playerSchema.table(
  'injury',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id),
    severity: text('severity').notNull(),
    startedDay: integer('started_day').notNull(),
    recoveryDays: integer('recovery_days').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oneActive: uniqueIndex('injury_one_active_per_athlete')
      .on(t.athleteId)
      .where(sql`${t.status} = 'active'`),
  }),
);
