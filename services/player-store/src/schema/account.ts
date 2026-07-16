// Conta de login (SPEC-016). Vive num schema Postgres DEDICADO (`player`) — isola a
// identidade do jogador do world-store (que usa `public`, e já tem uma tabela `athlete`).
// Coleta mínima (charter): só e-mail + hash + created_at. NENHUM outro PII.
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Schema Postgres dedicado ao jogador (isolamento de credencial + bounded-context). */
export const playerSchema = pgSchema('player');

export const account = playerSchema.table('account', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
