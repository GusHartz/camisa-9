import { describe, expect, it } from 'vitest';
import { WORLD } from '../constants.js';
import { seedWorld } from '../data/world-seed.js';
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
