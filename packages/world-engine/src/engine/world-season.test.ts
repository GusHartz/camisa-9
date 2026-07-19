import { describe, expect, it } from 'vitest';
import { WORLD } from '../constants.js';
import { seedWorld } from '../data/world-seed.js';
import { simulateSeason } from './season.js';
import { simulateWorldSeason } from './world-season.js';

const CLUBS = WORLD.clubsPerLeague;
const ROUNDS = 2 * (CLUBS - 1); // turno-returno
const MATCHES = ROUNDS * (CLUBS / 2);

describe('simulateWorldSeason — roda o mundo inteiro', () => {
  const world = seedWorld('temporada');
  const season = simulateWorldSeason(world, 'seed-jogo');

  it('produz uma temporada por liga de cada andar', () => {
    expect(season.leagues).toHaveLength(WORLD.tiers * WORLD.leaguesPerTier);
    expect(season.leagues.map((l) => l.tier).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('cada liga: turno-returno completo e tabela cheia', () => {
    for (const { result } of season.leagues) {
      expect(result.rounds).toHaveLength(ROUNDS);
      expect(result.rounds.flatMap((r) => r.matches)).toHaveLength(MATCHES);
      expect(result.table).toHaveLength(CLUBS);
      expect(result.table.reduce((s, row) => s + row.played, 0)).toBe(MATCHES * 2);
    }
  });

  it('preserva o seasonId do mundo', () => {
    expect(season.seasonId).toBe(world.seasonId);
  });
});

describe('simulateWorldSeason — determinismo', () => {
  it('mesmo mundo + mesma seed → resultado idêntico', () => {
    const world = seedWorld('det');
    expect(simulateWorldSeason(world, 'x')).toEqual(simulateWorldSeason(world, 'x'));
  });

  it('seeds de jogo diferentes → temporadas diferentes', () => {
    const world = seedWorld('det');
    expect(simulateWorldSeason(world, 'x')).not.toEqual(simulateWorldSeason(world, 'y'));
  });

  it('ligas distintas (leagueId por andar) geram tabelas distintas sob a mesma seed', () => {
    const season = simulateWorldSeason(seedWorld('cross'), 'mesma-seed');
    const tables = season.leagues.map((l) => JSON.stringify(l.result.rounds));
    expect(new Set(tables).size).toBe(tables.length);
  });
});

describe('simulateWorldSeason — eventos de partida rica (SPEC-031)', () => {
  const world = seedWorld('eventos');
  const season = simulateWorldSeason(world, 'seed-eventos');
  const allEvents = season.leagues
    .flatMap((l) => l.result.rounds)
    .flatMap((r) => r.matches)
    .flatMap((m) => m.events ?? []);

  it('emite eventos de LESÃO ao longo da temporada (raros, mas ocorrem)', () => {
    expect(allEvents.length).toBeGreaterThan(0);
    expect(allEvents.every((e) => e.kind === 'injury')).toBe(true);
  });

  it('cada lesão nomeia um atleta do ELENCO do clube certo', () => {
    const rosterOf = new Map<string, Set<string>>();
    for (const tier of world.tiers) {
      for (const lg of tier.leagues) {
        for (const c of lg.clubs) rosterOf.set(c.id, new Set(c.roster.map((a) => a.id)));
      }
    }
    for (const e of allEvents) {
      expect(rosterOf.get(e.clubId)?.has(e.athleteId)).toBe(true);
    }
  });

  it('determinístico COM eventos: mesma seed → temporada idêntica (eventos inclusos)', () => {
    expect(simulateWorldSeason(world, 'seed-eventos')).toEqual(season);
  });

  it('SCORE-NEUTRAL: os eventos NÃO alteram placar/tabela (o stream de eventos é separado)', () => {
    // Para cada liga: a temporada enriquecida, SEM os events, tem placar/tabela IDÊNTICOS ao
    // `simulateSeason` puro (que nunca vê elencos/eventos). Prova a tese central da SPEC-031.
    for (const tier of world.tiers) {
      for (const lg of tier.leagues) {
        const projected = {
          leagueId: lg.leagueId,
          seasonId: world.seasonId,
          clubs: lg.clubs.map((c) => ({ id: c.id, name: c.name, strength: c.strength })),
        };
        const pure = simulateSeason(projected, 'seed-eventos'); // SEM eventos (força-só)
        const enriched = season.leagues.find((l) => l.result.leagueId === lg.leagueId)!.result;
        const stripped = {
          ...enriched,
          rounds: enriched.rounds.map((r) => ({
            round: r.round,
            matches: r.matches.map((m) => ({
              round: m.round,
              homeId: m.homeId,
              awayId: m.awayId,
              homeGoals: m.homeGoals,
              awayGoals: m.awayGoals,
            })),
          })),
        };
        expect(stripped).toEqual(pure); // placar E tabela byte-idênticos ao puro
      }
    }
  });
});
