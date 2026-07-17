// Registro durável da viragem (SPEC-021 — Fatia 3). O rollover SOBRESCREVE o snapshot
// (overwrite in-place), então o `TurnoverReport` (promovidos/rebaixados/aposentados/nascidos/
// transferidos) é a ÚNICA memória do que mudou naquela virada — a auditoria que o overwrite
// senão apagaria. `report` é o `TurnoverReport` inteiro (jsonb, insumo do painel 1.5 / 0.3).
import type { TurnoverReport } from '@camisa-9/world-engine';
import { jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const turnoverReport = pgTable(
  'turnover_report',
  {
    worldSeed: text('world_seed').notNull(),
    fromSeasonId: text('from_season_id').notNull(),
    toSeasonId: text('to_season_id').notNull(),
    report: jsonb('report').$type<TurnoverReport>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.worldSeed, t.fromSeasonId] }) }),
);
