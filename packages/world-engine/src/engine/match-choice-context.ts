// A derivação events→ctx (SPEC-050) — a FONTE ÚNICA da participação do humano na partida, extraída
// do agregador da faixa (SPEC-048) para servir a api E o scheduler (o resolver do timeout). Pura,
// zero I/O, zero RNG. Vive em arquivo próprio (OP-16 — o match-choices.ts está no limite). Inclui a
// self-exclusion da lesão ("um COMPANHEIRO caiu" ≠ a SUA lesão — o bug pego na revisão da 048).
import type { GoalEvent, InjuryEvent, MatchResult } from '../types.js';
import type { MatchChoiceContext } from './match-choices.js';

/** Deriva o `MatchChoiceContext` do humano a partir da partida PUBLICADA. `meWorldId` é o id do
 *  MUNDO (`occupation.athleteId`) — nunca o id do player-store (os eventos falam ids do mundo). */
export function choiceContextFrom(
  match: MatchResult,
  clubId: string,
  meWorldId: string,
): MatchChoiceContext {
  const events = match.events ?? [];
  const goals = events.filter((e): e is GoalEvent => e.kind === 'goal');
  const injuries = events.filter((e): e is InjuryEvent => e.kind === 'injury');
  const isHome = match.homeId === clubId;
  const goalsFor = isHome ? match.homeGoals : match.awayGoals;
  const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
  return {
    goalMinutes: goals.filter((e) => e.athleteId === meWorldId).map((e) => e.minute),
    concededMinutes: goals.filter((e) => e.clubId !== clubId).map((e) => e.minute),
    clubInjuredMinute:
      injuries.find((i) => i.clubId === clubId && i.athleteId !== meWorldId)?.minute ?? null,
    result: goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw',
  };
}
