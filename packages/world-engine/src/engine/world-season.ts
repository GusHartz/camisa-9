// Roda uma temporada do MUNDO inteiro (SPEC-009): cada liga de cada andar joga sua
// própria temporada. Reusa `simulateSeason` (SPEC-002) projetando WorldClub → Club —
// o runner de partida só lê {id, strength}, então o motor de partida fica intocado
// (golden da SPEC-002 preservado). Puro, determinístico, sem I/O.

import type {
  Club,
  LeagueSeasonResult,
  LeagueState,
  Seed,
  WorldClub,
  WorldSeasonResult,
  WorldState,
} from '../types.js';
import { simulateSeason } from './season.js';

/** Projeta o clube rico do mundo no clube mínimo que o motor de partida consome. */
function toMatchClub(club: WorldClub): Club {
  return { id: club.id, name: club.name, strength: club.strength };
}

/** Simula a temporada de todas as ligas de todos os andares. */
export function simulateWorldSeason(world: WorldState, seed: Seed): WorldSeasonResult {
  const leagues: LeagueSeasonResult[] = [];
  for (const tier of world.tiers) {
    for (const league of tier.leagues) {
      const state: LeagueState = {
        leagueId: league.leagueId,
        seasonId: world.seasonId,
        clubs: league.clubs.map(toMatchClub),
      };
      leagues.push({ tier: tier.tier, result: simulateSeason(state, seed) });
    }
  }
  return { seasonId: world.seasonId, leagues };
}
