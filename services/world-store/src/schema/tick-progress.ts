// Cursor de progresso do tick diário (SPEC-032 — a infra de cron/deploy). Guarda, por mundo,
// o ÚLTIMO dayIndex cuja RODADA DO MUNDO está LIQUIDADA (published / season_rolled /
// before_season). É o que torna o catch-up resumível: o próximo tick replaya de
// `last_day_index + 1` até o dia vencido (dueDayIndex). Rastreia a rodada do MUNDO (não o
// humano) — a escolha que mantém o mundo VIVO (um humano quebrado não trava o batimento).
// Avança monotonicamente (nunca retrocede); não avança além de um dia deferido (retenta).
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { world } from './world.js';

export const tickProgress = pgTable('tick_progress', {
  worldSeed: text('world_seed')
    .primaryKey()
    .references(() => world.seed),
  lastDayIndex: integer('last_day_index').notNull(),
});
