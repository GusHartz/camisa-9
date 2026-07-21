// O lado MUNDO do agregador (SPEC-038): transforma as leituras estreitas do world-store nas fatias
// do contrato. Puro — recebe valores já lidos. O kit e o fixture são DERIVADOS (fns puras), sem
// tocar o snapshot nem os goldens. `generateFixtures` é reuso puro do engine (só consome `c.id`).
import {
  generateFixtures,
  matchRating,
  type GoalEvent,
  type MatchOutcome,
  type MatchResult,
  type Position,
  type RatingFocos,
  type RoundResult,
} from '@camisa-9/world-engine';
import { kitFromClubId } from '@camisa-9/player';
import type { ClubBrief, OccupationView, QueueEntry } from '@camisa-9/world-store';
import type { BandClub, BandGoal, BandMatch, BandMate, BandQueue } from './types.js';

/** O contexto do HUMANO para orientar a partida (SPEC-046): quem sou eu no mundo + os focos vivos +
 *  as partes da seed p/ a nota + o mapa de nomes do MEU elenco (p/ nomear autor/assistente). `null`
 *  pré-jogo / sem vaga. */
export interface BandMatchCtx {
  readonly meWorldId: string;
  readonly position: Position;
  readonly focos: RatingFocos;
  readonly seed: string;
  readonly leagueId: string;
  readonly seasonId: string;
  readonly nameByWorldId: ReadonlyMap<string, string>;
}

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
 *  orientado por mando (`isHome`), + a timeline (SPEC-043) com autor/assistência e a minha nota
 *  (SPEC-046). ⚠️ `homeGoals`/`awayGoals` — nunca `goalsFor`/`goalsAgainst`. */
export function buildTodayMatch(
  clubId: string,
  fixture: { readonly opponentClubId: string; readonly isHome: boolean },
  roundResult: RoundResult | null,
  opponentName: string,
  ctx: BandMatchCtx | null,
): BandMatch {
  const match = roundResult?.matches.find((m) => m.homeId === clubId || m.awayId === clubId);
  const played = match !== undefined;
  const goalsFor = match ? (fixture.isHome ? match.homeGoals : match.awayGoals) : null;
  const goalsAgainst = match ? (fixture.isHome ? match.awayGoals : match.homeGoals) : null;
  const goalEvents = match ? (match.events ?? []).filter(isGoal) : [];
  // Timeline (SPEC-043) sob o MESMO gate do placar (rodada MOSTRADA liquidada, SPEC-038), omitida
  // pré-jogo. Autor/assistência/nota (SPEC-046) orientados ao humano.
  const goals: readonly BandGoal[] | undefined = match
    ? goalEvents.map((e) => buildGoal(e, clubId, ctx))
    : undefined;
  const myRating = match && ctx ? ratingFor(match, fixture.isHome, goalEvents, ctx) : null;
  return {
    opponentClubId: fixture.opponentClubId,
    opponentName,
    isHome: fixture.isHome,
    played,
    goalsFor,
    goalsAgainst,
    ...(goals !== undefined ? { goals } : {}),
    myRating,
  };
}

function isGoal(e: { readonly kind: string }): e is GoalEvent {
  return e.kind === 'goal';
}

/** Um gol → `BandGoal`, orientado ao humano. Os NOMES só p/ gols do MEU clube (tenho o elenco). */
function buildGoal(e: GoalEvent, clubId: string, ctx: BandMatchCtx | null): BandGoal {
  const isMine = e.clubId === clubId;
  const nameOf = (id: string | undefined): string | null =>
    isMine && id !== undefined ? (ctx?.nameByWorldId.get(id) ?? null) : null;
  return {
    minute: e.minute,
    isMine,
    byMe: ctx !== null && e.athleteId === ctx.meWorldId,
    scorer: nameOf(e.athleteId),
    assistByMe: ctx !== null && e.assistId === ctx.meWorldId,
    assist: nameOf(e.assistId),
  };
}

/** A minha nota (SPEC-046) = `matchRating(...)/10`. Conta os meus gols/assistências dos eventos.
 *  ⚠️ DÉBITO (mesma classe do snapshot de mood da SPEC-029): a nota é recomputada dos focos VIVOS
 *  (`ctx.focos`) a cada leitura, então uma partida já encerrada pode mudar a nota se o jogador
 *  distribuir um ponto durante a janela ~24h em que o jogo fica visível. É determinística DADOS os
 *  focos; snapshotar os focos por rodada = card de auditoria futuro (como o de mood). */
function ratingFor(
  match: MatchResult,
  isHome: boolean,
  goalEvents: readonly GoalEvent[],
  ctx: BandMatchCtx,
): number {
  const goalsFor = isHome ? match.homeGoals : match.awayGoals;
  const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
  const tenths = matchRating({
    seed: ctx.seed,
    leagueId: ctx.leagueId,
    seasonId: ctx.seasonId,
    round: match.round,
    homeId: match.homeId,
    awayId: match.awayId,
    athleteId: ctx.meWorldId,
    position: ctx.position,
    goalsScored: goalEvents.filter((e) => e.athleteId === ctx.meWorldId).length,
    assists: goalEvents.filter((e) => e.assistId === ctx.meWorldId).length,
    goalsAgainst,
    result: outcomeOf(goalsFor, goalsAgainst),
    focos: ctx.focos,
  });
  return tenths / 10;
}

function outcomeOf(goalsFor: number, goalsAgainst: number): MatchOutcome {
  if (goalsFor > goalsAgainst) return 'win';
  if (goalsFor < goalsAgainst) return 'loss';
  return 'draw';
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
