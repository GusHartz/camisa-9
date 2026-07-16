import { describe, expect, it } from 'vitest';
import { ARCHETYPES, WORLD } from '../constants.js';
import type { WorldClub } from '../types.js';
import { clubStrength, positionCounts } from '../engine/roster.js';
import { seedWorld } from './world-seed.js';

function allClubs(seed: string): WorldClub[] {
  return seedWorld(seed).tiers.flatMap((t) => t.leagues.flatMap((l) => l.clubs));
}

describe('seedWorld — determinismo', () => {
  it('mesma seed → mundo idêntico (deep equal)', () => {
    expect(seedWorld('mundo-det')).toEqual(seedWorld('mundo-det'));
  });

  it('seeds diferentes → mundos diferentes', () => {
    expect(seedWorld('mundo-a')).not.toEqual(seedWorld('mundo-b'));
  });

  it('archetype e weights variam por seed (ajuste #2: são realmente sorteados)', () => {
    const a = allClubs('arq-a').map((c) => `${c.archetype}:${c.weights.join(',')}`);
    const b = allClubs('arq-b').map((c) => `${c.archetype}:${c.weights.join(',')}`);
    expect(a).not.toEqual(b);
  });
});

describe('seedWorld — estrutura da pirâmide (ajuste #1: tier → [leagues])', () => {
  const world = seedWorld('estrutura');

  it('tem WORLD.tiers andares, numerados 1..N', () => {
    expect(world.tiers).toHaveLength(WORLD.tiers);
    expect(world.tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4]);
  });

  it('cada andar é uma LISTA de ligas (v1: leaguesPerTier)', () => {
    for (const tier of world.tiers) {
      expect(tier.leagues).toHaveLength(WORLD.leaguesPerTier);
    }
  });

  it('cada liga tem WORLD.clubsPerLeague clubes', () => {
    for (const tier of world.tiers) {
      for (const league of tier.leagues) {
        expect(league.clubs).toHaveLength(WORLD.clubsPerLeague);
      }
    }
  });
});

describe('seedWorld — invariantes de clube e elenco', () => {
  const clubs = allClubs('invariantes');

  it('todo clube tem elenco de WORLD.rosterSize (ajuste #4 no nascimento)', () => {
    for (const club of clubs) {
      expect(club.roster).toHaveLength(WORLD.rosterSize);
    }
  });

  it('força do clube = clubStrength(elenco) (derivada, nunca escrita à mão)', () => {
    for (const club of clubs) {
      expect(club.strength).toBe(clubStrength(club.roster));
    }
  });

  it('archetype válido e weights com WORLD.weightCount entradas', () => {
    for (const club of clubs) {
      expect(ARCHETYPES).toContain(club.archetype);
      expect(club.weights).toHaveLength(WORLD.weightCount);
    }
  });

  it('formação do elenco casa com WORLD.squadShape', () => {
    for (const club of clubs) {
      expect(positionCounts(club.roster)).toEqual(WORLD.squadShape);
    }
  });

  it('idades sorteadas em [seedAgeMin, seedAgeMax]', () => {
    for (const club of clubs) {
      for (const a of club.roster) {
        expect(a.age).toBeGreaterThanOrEqual(WORLD.seedAgeMin);
        expect(a.age).toBeLessThanOrEqual(WORLD.seedAgeMax);
      }
    }
  });
});

describe('seedWorld — habilidade por andar (faixas sobrepostas)', () => {
  const world = seedWorld('faixas');

  it('habilidade de cada atleta cai na faixa do seu andar', () => {
    for (const tier of world.tiers) {
      const range = WORLD.abilityByTier[tier.tier - 1];
      expect(range).toBeDefined();
      if (range === undefined) continue;
      for (const league of tier.leagues) {
        for (const club of league.clubs) {
          for (const a of club.roster) {
            expect(a.ability).toBeGreaterThanOrEqual(range.min);
            expect(a.ability).toBeLessThanOrEqual(range.max);
          }
        }
      }
    }
  });
});

describe('seedWorld — unicidade de identificadores', () => {
  const world = seedWorld('ids');
  const clubs = world.tiers.flatMap((t) => t.leagues.flatMap((l) => l.clubs));

  it('ids de clube são globalmente únicos', () => {
    const ids = clubs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ids de atleta são globalmente únicos', () => {
    const ids = clubs.flatMap((c) => c.roster.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(
      WORLD.tiers * WORLD.leaguesPerTier * WORLD.clubsPerLeague * WORLD.rosterSize,
    );
  });

  it('nomes de clube são únicos (bijeção por índice global)', () => {
    const names = clubs.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
