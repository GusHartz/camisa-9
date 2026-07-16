// Ledger de rodadas publicadas (SPEC-014 — Fatia 2). É a materialização durável do
// contrato que a SPEC-002 provava só em memória (RoundStore/RoundPublisher): a
// publicação de uma rodada é all-or-nothing. A PK composta (league_id, season_id,
// round) É a chave UNIQUE de idempotência — re-publicar rodada commitada é no-op
// seguro a retry pós-crash. `result` guarda o RoundResult inteiro (jsonb byte-exato).
import type { RoundResult } from '@camisa-9/world-engine';
import { integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const publishedRound = pgTable(
  'published_round',
  {
    leagueId: text('league_id').notNull(),
    seasonId: text('season_id').notNull(),
    round: integer('round').notNull(),
    result: jsonb('result').$type<RoundResult>().notNull(),
    // Metadado de auditoria (insumo da 0.3). Impuro é permitido em services/*; a
    // reconciliação compara SÓ `result`, nunca este carimbo.
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.leagueId, t.seasonId, t.round] }) }),
);
