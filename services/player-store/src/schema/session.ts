// Sessão de login (SPEC-037) — a primeira superfície de entrada do projeto. Token OPACO de 256
// bits: só o `sha256hex` entra na coluna (`token_hash`), NUNCA o token em claro — um dump do banco
// vazado não vira sessão viva. Sem KDF: o segredo já tem entropia total de CSPRNG, e argon2 no
// caminho quente de todo request seria proibitivo. Dois relógios: `expires_at` = teto ABSOLUTO
// (30d, derivado de `created_at` em código — menos schema) e `last_seen_at` = a janela IDLE (7d,
// deslizante, com bump throttled a 12h p/ um poll de 60s não virar 1.440 UPDATEs/dia). Logout
// DELETA a linha (dispensa `revoked_at`; é a "rotação no logout" do sdd.md:80). No schema `player`.
import { index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { account, playerSchema } from './account.js';

export const session = playerSchema.table(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // O lookup do Bearer: a ÚNICA query do caminho quente de autenticação. UNIQUE é o índice E a
    // garantia de que dois tokens nunca colidem.
    tokenHashUq: uniqueIndex('session_token_hash_uq').on(t.tokenHash),
    // Cap de 10 sessões vivas por conta (as excedentes mais antigas caem na tx do `createSession`)
    // + revogação em massa futura (regen, ban, "sair de todos os dispositivos").
    accountIdx: index('session_account_idx').on(t.accountId, t.createdAt.desc()),
    // Purga das mortas (1× por tick, isolada) — sem isto a tabela vaza devagar.
    expiresIdx: index('session_expires_idx').on(t.expiresAt),
  }),
);
