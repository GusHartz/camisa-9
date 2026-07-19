// Ledger de idempotência do tick diário (SPEC-030) — a marca "este passe rodou p/ este atleta neste
// dia". PK `(athlete_id, day, scope)` = a chave de idempotência durável (molde do `decision_one_per_day`
// / `published_round`): o INSERT-onConflict É a reivindicação atômica → 0 linhas = já rodou → skip.
// `scope` distingue os passes NÃO-idempotentes que precisam da guarda: `accrue` (pagamento) e `mood`
// (decay). Os demais passes (decisão/recuperação) já são retry-safe e NÃO usam o ledger. No schema `player`.
import { integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { playerSchema } from './account.js';
import { athlete } from './athlete.js';

export const dailyLedger = playerSchema.table(
  'daily_ledger',
  {
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id),
    day: integer('day').notNull(),
    scope: text('scope').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.athleteId, t.day, t.scope] }) }),
);
