// Escolhas de partida RESPONDIDAS (SPEC-050) — só a RESPOSTA persiste (a oferta é recomputável, fn
// pura do engine). PK natural `(athlete_id, season_id, round, template_id)` = idempotência por
// construção: o INSERT ... ON CONFLICT DO NOTHING é o árbitro das corridas (retry, double-click,
// responder×resolver do timeout). `effect` (jsonb) = o efeito APLICADO, snapshotado na resposta —
// auditável mesmo se o catálogo `MATCH_CHOICES` mudar (molde do `decision.outcome`). O tipo do
// efeito é ESTRUTURAL (Record) — o player-store permanece sem dependência do world-engine.
// `day` = o day-index da PARTIDA (tickDay na rota; day−1 no resolver). No schema `player`.
import { integer, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { playerSchema } from './account.js';
import { athlete } from './athlete.js';

export const matchChoice = playerSchema.table(
  'match_choice',
  {
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id),
    seasonId: text('season_id').notNull(),
    round: integer('round').notNull(),
    templateId: text('template_id').notNull(),
    chosenOption: text('chosen_option').notNull(),
    // 'success' | 'fail' (opção arriscada, resolvida por roll) | 'na' (determinística/conservadora).
    result: text('result').notNull(),
    effect: jsonb('effect').$type<Readonly<Record<string, number | string>>>().notNull(),
    // player | agent — quem resolveu (o agente é o timeout do tick de D+1).
    resolvedBy: text('resolved_by').notNull(),
    day: integer('day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      name: 'match_choice_pk',
      columns: [t.athleteId, t.seasonId, t.round, t.templateId],
    }),
  }),
);
