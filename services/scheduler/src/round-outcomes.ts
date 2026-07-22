// Colhe, da rodada PUBLICADA, o que cada humano ganhou nela: o resultado (win/draw/loss → prêmio)
// E as lesões de partida (SPEC-031). Mapas por `athleteId` (id do mundo — a chave da ocupação).
// Puro-ish: só LÊ (readWorld/readRound); o scheduler injeta o resultado nos passes por-humano.
import type {
  InjuryEvent,
  MatchResult as MatchRecord,
  RoundResult,
  WorldState,
} from '@camisa-9/world-engine';
import {
  readRound,
  readWorld,
  type Db as WorldDb,
  type OccupationView,
} from '@camisa-9/world-store';
import type { MatchResult } from '@camisa-9/player';

export interface RoundOutcomes {
  readonly prizes: Map<string, MatchResult>; // athleteId → win/draw/loss
  readonly injuries: Map<string, string>; // athleteId → gravidade (evento de lesão da partida)
}

export const EMPTY_OUTCOMES: RoundOutcomes = { prizes: new Map(), injuries: new Map() };

/** Prêmios (win/draw/loss) E lesões de cada humano, da rodada publicada. Acha o jogo do clube dele,
 *  lê cada liga UMA vez (cache). Mapas por `athleteId` (id do mundo — a chave da ocupação). */
export async function roundOutcomes(
  worldDb: WorldDb,
  seed: string,
  seasonId: string,
  round: number,
  occupations: readonly OccupationView[],
): Promise<RoundOutcomes> {
  const prizes = new Map<string, MatchResult>();
  const injuries = new Map<string, string>();
  const world = await readWorld(worldDb, seed);
  if (!world) return { prizes, injuries };
  const clubLeague = buildClubLeagueMap(world);
  const roundByLeague = new Map<string, RoundResult | null>();
  for (const occ of occupations) {
    const leagueId = clubLeague.get(occ.clubId);
    if (leagueId === undefined) continue;
    if (!roundByLeague.has(leagueId)) {
      roundByLeague.set(leagueId, await readRound(worldDb, leagueId, seasonId, round));
    }
    const match = matchOf(roundByLeague.get(leagueId), occ.clubId);
    if (!match) continue;
    prizes.set(occ.athleteId, outcomeOf(match, occ.clubId));
    const sev = injuryFor(match, occ.athleteId);
    if (sev !== undefined) injuries.set(occ.athleteId, sev);
  }
  return { prizes, injuries };
}

/** clubId → leagueId (a liga do clube), de `readWorld`. Puro. */
function buildClubLeagueMap(world: WorldState): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of world.tiers) {
    for (const l of t.leagues) {
      for (const c of l.clubs) map.set(c.id, l.leagueId);
    }
  }
  return map;
}

/** O jogo do clube na rodada (ou undefined se não jogou / rodada ausente). */
function matchOf(round: RoundResult | null | undefined, clubId: string): MatchRecord | undefined {
  return round?.matches.find((m) => m.homeId === clubId || m.awayId === clubId);
}

/** win/draw/loss do clube na partida. Puro. */
function outcomeOf(m: MatchRecord, clubId: string): MatchResult {
  const mine = m.homeId === clubId ? m.homeGoals : m.awayGoals;
  const theirs = m.homeId === clubId ? m.awayGoals : m.homeGoals;
  if (mine > theirs) return 'win';
  if (mine < theirs) return 'loss';
  return 'draw';
}

/** A gravidade do evento de LESÃO do atleta na partida (SPEC-031), ou undefined. */
function injuryFor(m: MatchRecord, athleteId: string): string | undefined {
  return m.events?.find((e): e is InjuryEvent => e.kind === 'injury' && e.athleteId === athleteId)
    ?.severity;
}

/** A partida PUBLICADA de ONTEM de um humano (SPEC-050) — o insumo do resolver de escolhas. */
export interface YesterdayMatch {
  readonly match: MatchRecord;
  readonly leagueId: string;
  readonly seasonId: string;
  readonly round: number;
}

/** As partidas publicadas de ONTEM, por `athleteId` (id do mundo) — o `RoundOutcomes` descarta o
 *  `MatchRecord`, e o resolver de escolhas (SPEC-050) precisa dele INTEIRO (eventos → ctx → oferta
 *  recomputada). Lê cada liga UMA vez; humano sem jogo na rodada fica fora do mapa (o resolver pula). */
export async function yesterdayMatches(
  worldDb: WorldDb,
  seed: string,
  seasonId: string,
  round: number,
  occupations: readonly OccupationView[],
): Promise<ReadonlyMap<string, YesterdayMatch>> {
  const map = new Map<string, YesterdayMatch>();
  const world = await readWorld(worldDb, seed);
  if (!world) return map;
  const clubLeague = buildClubLeagueMap(world);
  const roundByLeague = new Map<string, RoundResult | null>();
  for (const occ of occupations) {
    const leagueId = clubLeague.get(occ.clubId);
    if (leagueId === undefined) continue;
    if (!roundByLeague.has(leagueId)) {
      roundByLeague.set(leagueId, await readRound(worldDb, leagueId, seasonId, round));
    }
    const match = matchOf(roundByLeague.get(leagueId), occ.clubId);
    if (!match) continue;
    map.set(occ.athleteId, { match, leagueId, seasonId, round });
  }
  return map;
}
