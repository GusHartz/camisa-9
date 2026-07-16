// Time do quinteto (SPEC-018, card R14) — a identidade do GRUPO, no schema `player`. STANDALONE:
// só referencia `account` (o capitão). Colocar o time no mundo é o card 21 (sem FK ao world-store
// aqui). O `code` é o convite distribuível (UNIQUE); `locked` = tranca manual / expira nas 16.
import { boolean, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Kit } from '@camisa-9/player';
import { account, playerSchema } from './account.js';

export const team = playerSchema.table('team', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kit: jsonb('kit').$type<Kit>().notNull(),
  code: text('code').notNull().unique(),
  captainAccountId: uuid('captain_account_id')
    .notNull()
    .references(() => account.id),
  locked: boolean('locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
