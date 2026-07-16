import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, WORLD } from '../constants.js';
import type { WorldClub, WorldState } from '../types.js';
import { seedWorld } from '../data/world-seed.js';
import { simulateWorldSeason } from './world-season.js';
import { advanceWorld } from './world-turnover.js';
import { clubStrength, positionCounts } from './roster.js';
import { worldHash } from './world-hash.js';

const golden = JSON.parse(
  readFileSync(new URL('../__fixtures__/world.golden.json', import.meta.url), 'utf8'),
) as { seed: string; seasons: number; hashes: readonly string[] };

const CLUBS = WORLD.clubsPerLeague;
const TOTAL_CLUBS = WORLD.tiers * WORLD.leaguesPerTier * CLUBS;
const TOTAL_ATHLETES = TOTAL_CLUBS * WORLD.rosterSize;

function allClubs(world: WorldState): WorldClub[] {
  return world.tiers.flatMap((t) => t.leagues.flatMap((l) => l.clubs));
}

function tierClubs(world: WorldState, tier: number): WorldClub[] {
  const t = world.tiers.find((x) => x.tier === tier);
  expect(t).toBeDefined();
  return t ? t.leagues.flatMap((l) => l.clubs) : [];
}

/** Todas as invariantes que precisam valer após QUALQUER viragem. */
function assertInvariants(world: WorldState): void {
  expect(world.tiers).toHaveLength(WORLD.tiers);
  const clubs = allClubs(world);
  expect(clubs).toHaveLength(TOTAL_CLUBS);

  for (const tier of world.tiers) {
    for (const league of tier.leagues) {
      expect(league.clubs).toHaveLength(CLUBS);
    }
  }

  for (const club of clubs) {
    // Ajuste #4: elenco sempre em rosterSize, com a formação canônica.
    expect(club.roster).toHaveLength(WORLD.rosterSize);
    expect(positionCounts(club.roster)).toEqual(WORLD.squadShape);
    // Força derivada, arquétipo/pesos preservados.
    expect(club.strength).toBe(clubStrength(club.roster));
    expect(ARCHETYPES).toContain(club.archetype);
    expect(club.weights).toHaveLength(WORLD.weightCount);
    // Idades: jovens em youthAge, ninguém em idade de aposentadoria.
    for (const a of club.roster) {
      expect(a.age).toBeGreaterThanOrEqual(WORLD.youthAge);
      expect(a.age).toBeLessThan(WORLD.retirementAge);
    }
  }

  // Conjunto de clubes (identidades) é conservado; atletas somam o total, ids únicos.
  const clubIds = clubs.map((c) => c.id);
  expect(new Set(clubIds).size).toBe(TOTAL_CLUBS);
  const athleteIds = clubs.flatMap((c) => c.roster.map((a) => a.id));
  expect(athleteIds).toHaveLength(TOTAL_ATHLETES);
  expect(new Set(athleteIds).size).toBe(TOTAL_ATHLETES);
}

describe('advanceWorld — uma viragem', () => {
  const world0 = seedWorld('viragem');
  const results0 = simulateWorldSeason(world0, 'viragem');
  const world1 = advanceWorld(world0, results0, 'viragem');

  it('preserva as invariantes estruturais e de elenco', () => {
    assertInvariants(world1);
  });

  it('incrementa a temporada', () => {
    expect(world1.seasonId).toBe('2027');
    expect(world0.seasonId).toBe('2026'); // não muta a entrada
  });

  it('conserva o conjunto global de clubes (só redistribui entre andares)', () => {
    const before = new Set(allClubs(world0).map((c) => c.id));
    const after = new Set(allClubs(world1).map((c) => c.id));
    expect(after).toEqual(before);
  });

  it('rebaixa os 3 últimos do tier 1 e promove os 3 primeiros do tier 2', () => {
    const tier1Table = results0.leagues.find((l) => l.tier === 1)?.result.table ?? [];
    const tier2Table = results0.leagues.find((l) => l.tier === 2)?.result.table ?? [];
    const relegated = tier1Table.slice(-WORLD.promoteRelegate[0]).map((r) => r.clubId);
    const promoted = tier2Table.slice(0, WORLD.promoteRelegate[0]).map((r) => r.clubId);

    const tier1After = new Set(tierClubs(world1, 1).map((c) => c.id));
    const tier2After = new Set(tierClubs(world1, 2).map((c) => c.id));
    for (const id of relegated) expect(tier2After.has(id)).toBe(true);
    for (const id of promoted) expect(tier1After.has(id)).toBe(true);
  });

  it('há aposentadorias e reposições (o elenco realmente gira)', () => {
    const athletes0 = new Set(allClubs(world0).flatMap((c) => c.roster.map((a) => a.id)));
    const athletes1 = allClubs(world1).flatMap((c) => c.roster.map((a) => a.id));
    const fresh = athletes1.filter((id) => !athletes0.has(id));
    expect(fresh.length).toBeGreaterThan(0); // entraram jovens
  });
});

describe('advanceWorld — determinismo', () => {
  it('mesmos inputs → mesmo estado (deep equal)', () => {
    const w0 = seedWorld('det');
    const r0 = simulateWorldSeason(w0, 'det');
    expect(advanceWorld(w0, r0, 'det')).toEqual(advanceWorld(w0, r0, 'det'));
  });
});

// Ajuste #5 promovido a critério de aceite: 10 viragens encadeadas.
describe('advanceWorld — 10 viragens encadeadas (critério de aceite)', () => {
  const SEED = golden.seed;

  function runChain(): string[] {
    let world = seedWorld(SEED);
    const hashes = [worldHash(world)];
    for (let s = 0; s < 10; s += 1) {
      const results = simulateWorldSeason(world, SEED);
      world = advanceWorld(world, results, SEED);
      assertInvariants(world); // invariantes a CADA viragem
      hashes.push(worldHash(world));
    }
    return hashes;
  }

  it('mantém invariantes por 10 temporadas e é reproduzível', () => {
    expect(runChain()).toEqual(runChain()); // idêntico viragem a viragem
  });

  it('bate byte-a-byte com o golden commitado (âncora cross-ambiente)', () => {
    expect(runChain()).toEqual([...golden.hashes]);
  });

  it('a temporada avança 10 vezes a partir de 2026', () => {
    let world = seedWorld(SEED);
    for (let s = 0; s < 10; s += 1) {
      world = advanceWorld(world, simulateWorldSeason(world, SEED), SEED);
    }
    expect(world.seasonId).toBe('2036');
  });
});
