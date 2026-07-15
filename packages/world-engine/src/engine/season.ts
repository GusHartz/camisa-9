// Season runner PURO (SPEC-002): (liga + seed) → temporada completa.
// Cada partida usa uma sub-seed derivada de (seed, LIGA, temporada, rodada, mandante,
// visitante) — a liga entra na chave para que duas ligas com o mesmo seed/temporada/ids
// NÃO gerem mundos idênticos. Resultado independe da ordem de iteração → replay estável.

import type { LeagueState, MatchResult, RoundResult, SeasonResult, Seed } from '../types.js';
import { createRng, deriveSeed } from './prng.js';
import { generateFixtures } from './fixtures.js';
import { resolveMatch } from './match.js';
import { computeStandings } from './standings.js';

export function simulateSeason(league: LeagueState, seed: Seed): SeasonResult {
  const strengthById = new Map(league.clubs.map((c) => [c.id, c.strength]));
  const byRound = new Map<number, MatchResult[]>();
  for (const fx of generateFixtures(league.clubs)) {
    const home = strengthById.get(fx.homeId);
    const away = strengthById.get(fx.awayId);
    if (home === undefined || away === undefined) {
      throw new Error(`força de clube ausente na fixture da rodada ${fx.round}`);
    }
    const rng = createRng(
      deriveSeed(seed, league.leagueId, league.seasonId, fx.round, fx.homeId, fx.awayId),
    );
    const { homeGoals, awayGoals } = resolveMatch(home, away, rng);
    const list = byRound.get(fx.round) ?? [];
    list.push({ round: fx.round, homeId: fx.homeId, awayId: fx.awayId, homeGoals, awayGoals });
    byRound.set(fx.round, list);
  }
  const rounds = buildRounds(byRound);
  const table = computeStandings(
    league.clubs.map((c) => c.id),
    rounds.flatMap((r) => r.matches),
  );
  return { leagueId: league.leagueId, seasonId: league.seasonId, rounds, table };
}

/** Ordena rodadas e, dentro da rodada, partidas por mandante (determinístico). */
function buildRounds(byRound: Map<number, MatchResult[]>): RoundResult[] {
  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((round) => {
      const matches = (byRound.get(round) ?? [])
        .slice()
        .sort((x, y) => (x.homeId < y.homeId ? -1 : x.homeId > y.homeId ? 1 : 0));
      return { round, matches };
    });
}
