// Roda uma temporada do MUNDO inteiro (SPEC-009): cada liga de cada andar joga sua
// própria temporada. Reusa `simulateSeason` (SPEC-002) projetando WorldClub → Club —
// o runner de partida só lê {id, strength}, então o motor de partida fica intocado
// (golden da SPEC-002 preservado). Puro, determinístico, sem I/O.
//
// Partida rica (SPEC-031): DEPOIS do placar, anexa os EVENTOS (fatia 1: lesão) — que precisam do
// ELENCO (`WorldClub.roster`, que só existe AQUI). O RNG de eventos é um stream SEPARADO (sub-seed
// com discriminador `'events'`) → NÃO desloca o stream do placar → `resolveMatch`/`simulateSeason`
// e os 4 goldens ficam byte-idênticos. `simulateSeason` puro (sem elenco) NÃO emite eventos.

import type {
  Club,
  LeagueSeasonResult,
  LeagueState,
  MatchEvent,
  MatchResult,
  Seed,
  SeasonResult,
  WorldClub,
  WorldSeasonResult,
  WorldState,
} from '../types.js';
import { createRng, deriveSeed } from './prng.js';
import { matchGoals, matchInjuries } from './match-events.js';
import { simulateSeason } from './season.js';

/** Projeta o clube rico do mundo no clube mínimo que o motor de partida consome. */
function toMatchClub(club: WorldClub): Club {
  return { id: club.id, name: club.name, strength: club.strength };
}

/** Simula a temporada de todas as ligas de todos os andares (com os eventos de partida rica). */
export function simulateWorldSeason(world: WorldState, seed: Seed): WorldSeasonResult {
  const leagues: LeagueSeasonResult[] = [];
  for (const tier of world.tiers) {
    for (const league of tier.leagues) {
      const state: LeagueState = {
        leagueId: league.leagueId,
        seasonId: world.seasonId,
        clubs: league.clubs.map(toMatchClub),
      };
      const clubById = new Map(league.clubs.map((c) => [c.id, c]));
      const result = enrichEvents(simulateSeason(state, seed), clubById, seed);
      leagues.push({ tier: tier.tier, result });
    }
  }
  return { seasonId: world.seasonId, leagues };
}

/** Anexa os eventos (lesão) a cada partida da temporada — PÓS-placar, RNG próprio. Placar/tabela
 *  inalterados (o stream de eventos é separado; `simulateSeason` já rodou). */
function enrichEvents(
  result: SeasonResult,
  clubById: ReadonlyMap<string, WorldClub>,
  seed: Seed,
): SeasonResult {
  const rounds = result.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((m) =>
      enrichMatch(m, result.leagueId, result.seasonId, clubById, seed),
    ),
  }));
  return { ...result, rounds };
}

/** Anexa `events` a UMA partida (ausente se nenhum) — a timeline unificada de lesões (SPEC-031) + gols
 *  (SPEC-043). DOIS streams DISJUNTOS: `'events'` (lesão) e `'goals'` (gol). `deriveSeed` é injetivo
 *  por prefixo de comprimento, então nenhum desloca o stream do placar (6 partes) nem o do outro →
 *  `resolveMatch`/`simulateSeason` e os goldens ficam byte-idênticos. Os gols SOMAM o placar por
 *  construção (a contagem vem de `m.homeGoals`/`m.awayGoals`, já fixados). */
function enrichMatch(
  m: MatchResult,
  leagueId: string,
  seasonId: string,
  clubById: ReadonlyMap<string, WorldClub>,
  seed: Seed,
): MatchResult {
  const injuryRng = createRng(
    deriveSeed(seed, leagueId, seasonId, m.round, m.homeId, m.awayId, 'events'),
  );
  const goalRng = createRng(
    deriveSeed(seed, leagueId, seasonId, m.round, m.homeId, m.awayId, 'goals'),
  );
  const home = clubById.get(m.homeId);
  const away = clubById.get(m.awayId);
  const injuries = matchInjuries(
    m.homeId,
    home?.roster ?? [],
    m.awayId,
    away?.roster ?? [],
    injuryRng,
  );
  const goals = matchGoals(
    m.homeId,
    m.homeGoals,
    home?.roster ?? [],
    m.awayId,
    m.awayGoals,
    away?.roster ?? [],
    goalRng,
  );
  const events = mergeChronological(injuries, goals, m.homeId);
  return events.length > 0 ? { ...m, events } : m;
}

/** Funde lesões + gols numa timeline com ordem TOTAL determinística (NÃO depende da estabilidade do
 *  `Array.sort`): minuto asc → lado (casa antes de fora) → seq de geração estável. */
function mergeChronological(
  injuries: readonly MatchEvent[],
  goals: readonly MatchEvent[],
  homeId: string,
): MatchEvent[] {
  const tagged = [...injuries, ...goals].map((e, seq) => ({ e, seq }));
  tagged.sort((a, b) => {
    if (a.e.minute !== b.e.minute) return a.e.minute - b.e.minute;
    const sideA = a.e.clubId === homeId ? 0 : 1;
    const sideB = b.e.clubId === homeId ? 0 : 1;
    if (sideA !== sideB) return sideA - sideB;
    return a.seq - b.seq;
  });
  return tagged.map((t) => t.e);
}
