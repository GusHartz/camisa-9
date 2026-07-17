// Compras do atleta (SPEC-024, card 2.8) — a POSSE (um conjunto, 1× por item). O `item_id` é ref
// LÓGICA ao catálogo da lib pura (`PURCHASES`), sem FK (dado tunável, validado na borda como a
// `position`). PK `(athlete_id, item_id)` = idempotência da posse. No schema `player`.
import { primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { playerSchema } from './account.js';
import { athlete } from './athlete.js';

export const purchase = playerSchema.table(
  'purchase',
  {
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id),
    itemId: text('item_id').notNull(),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.athleteId, t.itemId] }) }),
);
