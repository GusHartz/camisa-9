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
  MatchResult,
  Seed,
  SeasonResult,
  WorldClub,
  WorldSeasonResult,
  WorldState,
} from '../types.js';
import { createRng, deriveSeed } from './prng.js';
import { matchInjuries } from './match-events.js';
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

/** Anexa `events` a UMA partida (ausente se nenhum) — RNG derivado com discriminador `'events'`. */
function enrichMatch(
  m: MatchResult,
  leagueId: string,
  seasonId: string,
  clubById: ReadonlyMap<string, WorldClub>,
  seed: Seed,
): MatchResult {
  const rng = createRng(
    deriveSeed(seed, leagueId, seasonId, m.round, m.homeId, m.awayId, 'events'),
  );
  const home = clubById.get(m.homeId);
  const away = clubById.get(m.awayId);
  const events = matchInjuries(m.homeId, home?.roster ?? [], m.awayId, away?.roster ?? [], rng);
  return events.length > 0 ? { ...m, events } : m;
}
