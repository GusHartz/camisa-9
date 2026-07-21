// O lado MUNDO do agregador (SPEC-038): transforma as leituras estreitas do world-store nas fatias
// do contrato. Puro — recebe valores já lidos. O kit e o fixture são DERIVADOS (fns puras), sem
// tocar o snapshot nem os goldens. `generateFixtures` é reuso puro do engine (só consome `c.id`).
import { generateFixtures, type GoalEvent, type RoundResult } from '@camisa-9/world-engine';
import { kitFromClubId } from '@camisa-9/player';
import type { ClubBrief, OccupationView, QueueEntry } from '@camisa-9/world-store';
import type { BandClub, BandGoal, BandMatch, BandMate, BandQueue } from './types.js';

/** O elenco de 16 (11+5). `isMe` bate o id do MUNDO da minha ocupação; `avatarSeed` = o id do mundo. */
export function buildSquad(
  rows: readonly {
    athleteId: string;
    name: string;
    position: string;
    age: number;
    ability: number;
    isHuman: boolean;
  }[],
  meWorldId: string,
): BandMate[] {
  return rows.map((e) => ({
    athleteId: e.athleteId,
    name: e.name,
    position: e.position,
    age: e.age,
    ability: e.ability,
    isHuman: e.isHuman,
    isMe: e.athleteId === meWorldId,
    avatarSeed: e.athleteId,
  }));
}

/** O lugar na fila: índice 1-based no array de `readQueue` (já ordenado por `ord`). ⚠️ NUNCA usar
 *  `QueueEntry.position` — é a posição de FUTEBOL, não o lugar na fila. `null` se não está na fila. */
export function buildQueue(entries: readonly QueueEntry[], athleteId: string): BandQueue | null {
  const idx = entries.findIndex((e) => e.humanAthleteId === athleteId);
  return idx >= 0 ? { rank: idx + 1, total: entries.length } : null;
}

/** O adversário da rodada, PURO: computa o fixture (turno-returno determinístico) e acha o meu jogo.
 *  `null` se a liga é degenerada (ímpar/<2) ou o clube não joga essa rodada. */
export function findTodayFixture(
  clubId: string,
  round: number,
  leagueClubIds: readonly string[],
): { readonly opponentClubId: string; readonly isHome: boolean } | null {
  if (leagueClubIds.length < 2 || leagueClubIds.length % 2 !== 0) return null;
  const clubs = leagueClubIds.map((id) => ({ id, name: id, strength: 0 }));
  const fixture = generateFixtures(clubs).find(
    (f) => f.round === round && (f.homeId === clubId || f.awayId === clubId),
  );
  if (!fixture) return null;
  const isHome = fixture.homeId === clubId;
  return { opponentClubId: isHome ? fixture.awayId : fixture.homeId, isHome };
}

/** O jogo do dia. PRÉ-JOGO: `played:false`, placar `null`. PÓS-JOGO: o placar da rodada publicada,
 *  orientado por mando (`isHome`). ⚠️ `homeGoals`/`awayGoals` — nunca `goalsFor`/`goalsAgainst`. */
export function buildTodayMatch(
  clubId: string,
  fixture: { readonly opponentClubId: string; readonly isHome: boolean },
  roundResult: RoundResult | null,
  opponentName: string,
): BandMatch {
  const match = roundResult?.matches.find((m) => m.homeId === clubId || m.awayId === clubId);
  const played = match !== undefined;
  const goalsFor = match ? (fixture.isHome ? match.homeGoals : match.awayGoals) : null;
  const goalsAgainst = match ? (fixture.isHome ? match.awayGoals : match.homeGoals) : null;
  // A timeline de gols (SPEC-043) ria o MESMO gate que o placar: presente quando o `match` existe
  // (rodada MOSTRADA liquidada, SPEC-038), omitida pré-jogo. `isMine` = o gol foi do clube do humano.
  const goals: readonly BandGoal[] | undefined = match
    ? (match.events ?? [])
        .filter((e): e is GoalEvent => e.kind === 'goal')
        .map((e) => ({ minute: e.minute, isMine: e.clubId === clubId }))
    : undefined;
  return {
    opponentClubId: fixture.opponentClubId,
    opponentName,
    isHome: fixture.isHome,
    played,
    goalsFor,
    goalsAgainst,
    ...(goals !== undefined ? { goals } : {}),
  };
}

/** O clube do humano. O kit é DERIVADO do `clubId` (o mundo NPC não grava kit); os relógios de
 *  vaga (`lastActiveDay`/`frozenSinceDay`) vêm crus do overlay. */
export function buildClub(input: {
  readonly occupation: OccupationView;
  readonly brief: ClubBrief;
  readonly round: number | null;
  readonly daysUntilRevert: number | null;
  readonly todayMatch: BandMatch | null;
}): BandClub {
  const { occupation, brief } = input;
  return {
    clubId: occupation.clubId,
    name: brief.name,
    leagueId: brief.leagueId,
    tier: brief.tier,
    position: occupation.position,
    seasonId: occupation.seasonId,
    kit: kitFromClubId(occupation.clubId),
    round: input.round,
    lastActiveDay: occupation.lastActiveDay,
    frozenSinceDay: occupation.frozenSinceDay,
    daysUntilRevert: input.daysUntilRevert,
    todayMatch: input.todayMatch,
  };
}
