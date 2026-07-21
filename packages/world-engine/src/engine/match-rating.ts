// Nota do jogador na PARTIDA (SPEC-046) — pura/determinística, sob o guardrail. A nota (em DÉCIMOS,
// 30..100 = 3,0..10,0) reflete os ATRIBUTOS vivos: gols (o Técnico já te pôs na chance de marcar) +
// assistências (o Tático) + resultado + defesa (o Físico, em clean sheet) + uma variância que ENCOLHE
// com o Mental (consistência). RNG próprio (stream 'rating', disjunto do placar/eventos) → nunca roda
// na simulação, então é trivialmente score-neutral. Inteiro em décimos (sem float na lib). Zero I/O.
import { createRng, deriveSeed, nextInt, type RngState } from './prng.js';
import type { Position, Seed } from '../types.js';

export type MatchOutcome = 'win' | 'draw' | 'loss';

/** Os 4 focos vivos do atleta (0..99). Técnico/Tático já entram via os EVENTOS (gols/assistências);
 *  aqui o Físico (defesa) e o Mental (consistência) modelam a nota diretamente. */
export interface RatingFocos {
  readonly fisico: number;
  readonly tecnico: number;
  readonly tatico: number;
  readonly mental: number;
}

export interface RatingInput {
  readonly seed: Seed;
  readonly leagueId: string;
  readonly seasonId: string;
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
  readonly athleteId: string;
  readonly position: Position;
  /** Gols/assistências DO atleta na partida (contados dos eventos). */
  readonly goalsScored: number;
  readonly assists: number;
  /** Gols sofridos pelo clube do atleta (para o termo defensivo). */
  readonly goalsAgainst: number;
  readonly result: MatchOutcome;
  readonly focos: RatingFocos;
}

/** Tunáveis da nota (décimos) — a calibração vive aqui. */
export const RATING = {
  base: 60, // 6,0 — o jogo médio
  perGoal: 9, // +0,9 por gol seu
  perAssist: 6, // +0,6 por assistência sua
  win: 5,
  loss: -5,
  cleanSheetBase: 5, // GK/DEF em clean sheet: base + Físico/fisicoDivisor
  fisicoDivisor: 20,
  concededPenalty: -8,
  concededHeavy: 3, // GK/DEF que sofre >= isto é penalizado
  varianceBase: 12, // meia-amplitude MÁX (±1,2); encolhe com o Mental
  mentalDivisor: 12, // half = varianceBase − floor(mental / mentalDivisor)
  min: 30, // piso DEFENSIVO: o pior caso realista (GK, derrota, sofreu ≥3, variância mín) fica ~35 → o
  max: 100, // clamp inferior raramente morde; o superior (atuação enorme) sim.
} as const;

/** A nota (em DÉCIMOS, 30..100) da atuação do atleta. Determinística por
 *  `(seed, liga, temporada, rodada, casa, fora, atleta, 'rating')` — stream próprio, disjunto. */
export function matchRating(input: RatingInput): number {
  const rng = createRng(
    deriveSeed(
      input.seed,
      input.leagueId,
      input.seasonId,
      input.round,
      input.homeId,
      input.awayId,
      input.athleteId,
      'rating',
    ),
  );
  let n = RATING.base;
  n += input.goalsScored * RATING.perGoal;
  n += input.assists * RATING.perAssist;
  n += resultTerm(input.result);
  n += defensiveTerm(input.position, input.goalsAgainst, input.focos.fisico);
  n += varianceTerm(input.focos.mental, rng);
  return clamp(n);
}

function resultTerm(result: MatchOutcome): number {
  if (result === 'win') return RATING.win;
  if (result === 'loss') return RATING.loss;
  return 0;
}

/** GK/DEF: clean sheet rende (mais com Físico); sofrer muito penaliza. Demais posições: 0. */
function defensiveTerm(position: Position, goalsAgainst: number, fisico: number): number {
  if (position !== 'GK' && position !== 'DEF') return 0;
  if (goalsAgainst === 0) return RATING.cleanSheetBase + Math.floor(fisico / RATING.fisicoDivisor);
  if (goalsAgainst >= RATING.concededHeavy) return RATING.concededPenalty;
  return 0;
}

/** O "dia bom/ruim": variância determinística que ENCOLHE com o Mental (consistência = previsível). */
function varianceTerm(mental: number, rng: RngState): number {
  const half = RATING.varianceBase - Math.floor(mental / RATING.mentalDivisor);
  return nextInt(rng, 2 * half + 1) - half;
}

function clamp(n: number): number {
  return n < RATING.min ? RATING.min : n > RATING.max ? RATING.max : n;
}
