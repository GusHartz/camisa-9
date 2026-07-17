// Decisões de carreira (SPEC-025, card 2.4) — o dia gerado + a resolução (o "log no perfil"). Uma
// linha por decisão gerada; `status` pending → answered (o jogador) / resolved (o agente às 18h). O
// `outcome` (jsonb) é o DADO declarado da opção escolhida (seam, aplicado pela 2.3/1.4). Único
// `(athlete_id, day, template_id)` = idempotência da geração do dia. `template_id` é ref ao catálogo
// da lib pura (dado tunável, validado na borda). No schema `player`.
import { integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { DecisionOutcome } from '@camisa-9/player';
import { playerSchema } from './account.js';
import { athlete } from './athlete.js';

export const decision = playerSchema.table(
  'decision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id),
    day: integer('day').notNull(),
    // Ordem de geração no dia (rank do hash determinístico) — a leitura ordena por ela para o log e
    // o read-back reproduzirem a ordem apresentada (SPEC-025, revisão).
    ord: integer('ord').notNull(),
    templateId: text('template_id').notNull(),
    type: text('type').notNull(),
    // pending (gerada, aguardando) → answered (jogador escolheu) / resolved (agente às 18h).
    status: text('status').notNull().default('pending'),
    chosenOption: text('chosen_option'),
    outcome: jsonb('outcome').$type<DecisionOutcome>(),
    // player | agent — quem resolveu (null enquanto pending).
    resolvedBy: text('resolved_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ onedPerDay: unique('decision_one_per_day').on(t.athleteId, t.day, t.templateId) }),
);
