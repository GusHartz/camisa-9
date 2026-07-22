// A campanha de uma temporada (SPEC-053) — a memória durável do que o humano FEZ nos 38 jogos.
// Existe porque a viragem SOBRESCREVE o snapshot do mundo in-place (SPEC-021): clube, liga e tier
// da temporada que acabou deixam de existir no instante em que ela acaba, e o `turnover_report`
// guarda só o diff de NPC. Por isso as colunas de mundo aqui são SNAPSHOT, não referência.
//
// PK natural `(athlete_id, season_id)` = uma linha por temporada, idempotência por construção
// (molde do `match_choice`, SPEC-050). O acúmulo é diário e reivindicado pelo `daily_ledger`
// (escopo 'season'), então rodar o mesmo dia 2× não soma gol nenhum.
//
// ⚠️ NOTAS EM DÉCIMOS INTEIROS. `matchRating` devolve 30..100 (décimos); somar inteiro elimina
// drift de ponto flutuante ao longo de 38 rodadas. Dividir por 10 é APRESENTAÇÃO, nunca storage.
//
// As colunas de FECHO (`outcome`, `tier_after`, `end_overall`, `closed_at`) ficam NULL enquanto a
// temporada corre — `closed_at IS NULL` É o gate de idempotência do passe de fecho.
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { account, playerSchema } from './account.js';
import { athlete } from './athlete.js';

export const seasonSummary = playerSchema.table(
  'season_summary',
  {
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athlete.id),
    /** A carreira é da CONTA, não do atleta: o regen (SPEC-022) desativa o atleta e cria outro, e
     *  ler por `athlete_id` esconderia o card justamente de quem acabou de encerrar uma carreira. */
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id),
    seasonId: text('season_id').notNull(),

    // --- Snapshot do mundo (a viragem apaga o original) ---
    clubId: text('club_id').notNull(),
    clubName: text('club_name').notNull(),
    leagueId: text('league_id').notNull(),
    tier: integer('tier').notNull(),
    /** Snapshotada porque o fecho não pode depender da ocupação viva: no regen ou na vaga
     *  revertida ela já não existe, e `abilityFromFocos` exige a posição. */
    position: text('position').notNull(),

    // --- Acúmulo diário (notas em DÉCIMOS) ---
    matches: integer('matches').notNull().default(0),
    goals: integer('goals').notNull().default(0),
    assists: integer('assists').notNull().default(0),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingBest: integer('rating_best'),
    /** A rodada da melhor nota — o "MELHOR FASE" do card. */
    ratingBestRound: integer('rating_best_round'),
    /** A nota da PRIMEIRA e da ÚLTIMA rodada jogada: os dois extremos da linha de evolução. */
    ratingFirst: integer('rating_first'),
    ratingLast: integer('rating_last'),
    firstRound: integer('first_round'),
    lastRound: integer('last_round'),

    // --- Evolução: a linha do card. É o OVERALL, não a nota — `matchRating` quase não responde
    // ao treino (Técnico/Tático nem entram na fórmula; Mental só estreita a variância), então
    // "nota início → nota fim" mediria ruído. O overall é o número que o treino move.
    // `start_overall` é gravado na estreia; `end_overall` é REESCRITO a cada dia de jogo — nunca
    // no fecho, onde o atleta pode já não ter ocupação de onde tirar a posição.
    startOverall: integer('start_overall').notNull(),
    endOverall: integer('end_overall').notNull(),

    // --- Fecho na viragem (NULL enquanto a temporada corre) ---
    outcome: text('outcome'),
    tierAfter: integer('tier_after'),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ name: 'season_summary_pk', columns: [t.athleteId, t.seasonId] }),
    // A lista de trabalho do passe de fecho: as temporadas ABERTAS. Parcial porque o volume
    // fechado cresce sem limite e nunca é varrido por temporada.
    openIdx: index('season_summary_open_idx')
      .on(t.seasonId)
      .where(sql`${t.closedAt} is null`),
    outcomeValid: check(
      'season_summary_outcome_valid',
      sql`${t.outcome} is null or ${t.outcome} in ('champion', 'promoted', 'stayed', 'relegated')`,
    ),
    countsRange: check(
      'season_summary_counts_range',
      sql`${t.matches} >= 0 and ${t.goals} >= 0 and ${t.assists} >= 0 and ${t.ratingSum} >= 0`,
    ),
  }),
);
