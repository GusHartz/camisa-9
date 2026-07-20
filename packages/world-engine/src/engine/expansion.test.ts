// Pirâmide Elástica (R13, SPEC-036): a expansão na virada + a promoção multi-grupo.
// Prova (a) o no-op golden-safe quando expand=false, (b) a topologia crescendo pela regra 2×,
// (c) a conservação (grupos de 20, ids únicos) a cada expansão, (d) o determinismo, e (e) a
// promoção multi-grupo conservando o fluxo. O bloco do golden fica em expansion.golden.test.ts.
import { describe, expect, it } from 'vitest';
import { WORLD } from '../constants.js';
import type { WorldState } from '../types.js';
import { seedWorld } from '../data/world-seed.js';
import { simulateWorldSeason } from './world-season.js';
import { advanceWorld } from './world-turnover.js';
import { applyExpansion } from './expansion.js';
import { positionCounts } from './roster.js';
import { worldHash } from './world-hash.js';

const CLUBS = WORLD.clubsPerLeague;
const widths = (w: WorldState): number[] => w.tiers.map((t) => t.leagues.length);
const allClubs = (w: WorldState) => w.tiers.flatMap((t) => t.leagues.flatMap((l) => l.clubs));

function expandTurn(w: WorldState, seed: string): WorldState {
  return advanceWorld(w, simulateWorldSeason(w, seed), seed, new Set(), true);
}

function runExpansionChain(seed: string, turns: number): { hashes: string[]; world: WorldState } {
  let world = seedWorld(seed);
  const hashes = [worldHash(world)];
  for (let s = 0; s < turns; s += 1) {
    world = expandTurn(world, seed);
    hashes.push(worldHash(world));
  }
  return { hashes, world };
}

describe('applyExpansion — no-op quando expand=false (golden-safe)', () => {
  it('retorna os MESMOS andares (referência) e não consome PRNG', () => {
    const w = seedWorld('exp');
    expect(applyExpansion(w.tiers, 'exp', false)).toBe(w.tiers);
  });

  it('advanceWorld(expand=false) é IDÊNTICO ao default de 3 args (o caso do golden)', () => {
    const w = seedWorld('exp');
    const r = simulateWorldSeason(w, 'exp');
    expect(advanceWorld(w, r, 'exp', new Set(), false)).toEqual(advanceWorld(w, r, 'exp'));
  });
});

describe('applyExpansion — a topologia cresce (alarga a base → novo andar)', () => {
  it('a largura evolui pela regra 2× do founder', () => {
    let w = seedWorld('topo');
    expect(widths(w)).toEqual([1, 1, 1, 1]);
    w = expandTurn(w, 'topo');
    expect(widths(w)).toEqual([1, 1, 1, 2]); // alarga a entrada (1 < 2×1)
    w = expandTurn(w, 'topo');
    expect(widths(w)).toEqual([1, 1, 1, 2, 1]); // saturou (2 = 2×1) → novo andar
    w = expandTurn(w, 'topo');
    expect(widths(w)).toEqual([1, 1, 1, 2, 2]); // alarga (1 < 2×2)
    w = expandTurn(w, 'topo');
    expect(widths(w)).toEqual([1, 1, 1, 2, 3]);
    w = expandTurn(w, 'topo');
    expect(widths(w)).toEqual([1, 1, 1, 2, 4]); // teto 4 = 2×2
    w = expandTurn(w, 'topo');
    expect(widths(w)).toEqual([1, 1, 1, 2, 4, 1]); // saturou → novo andar
  });

  it('conserva 20 clubes por grupo + a formação, e ids únicos, a cada expansão', () => {
    const { world } = runExpansionChain('cons', 6);
    for (const t of world.tiers) {
      for (const lg of t.leagues) {
        expect(lg.clubs).toHaveLength(CLUBS);
        for (const c of lg.clubs) {
          expect(c.roster).toHaveLength(WORLD.rosterSize);
          expect(positionCounts(c.roster)).toEqual(WORLD.squadShape);
          expect(c.strength).toBeGreaterThan(0);
        }
      }
    }
    const clubs = allClubs(world);
    const totalGroups = world.tiers.reduce((n, t) => n + t.leagues.length, 0);
    expect(clubs).toHaveLength(totalGroups * CLUBS);
    const clubIds = clubs.map((c) => c.id);
    expect(new Set(clubIds).size).toBe(clubIds.length); // ids de clube únicos (sem colisão)
    const athIds = clubs.flatMap((c) => c.roster.map((a) => a.id));
    expect(new Set(athIds).size).toBe(athIds.length); // ids de atleta únicos
  });

  it('o andar NOVO herda a banda de várzea (habilidade compatível com a entrada)', () => {
    let w = seedWorld('varzea');
    w = expandTurn(w, 'varzea'); // 1,1,1,2
    w = expandTurn(w, 'varzea'); // 1,1,1,2,1 — nasceu o tier 5
    const tier5 = w.tiers.find((t) => t.tier === 5)!;
    const varzea = WORLD.abilityByTier[WORLD.abilityByTier.length - 1]!;
    for (const c of tier5.leagues[0]!.clubs) {
      for (const a of c.roster) {
        expect(a.ability).toBeGreaterThanOrEqual(varzea.min);
        expect(a.ability).toBeLessThanOrEqual(varzea.max);
      }
    }
  });

  it('é determinístico (mesmo seed → mesma cadeia de hashes)', () => {
    expect(runExpansionChain('det', 6).hashes).toEqual(runExpansionChain('det', 6).hashes);
  });
});

describe('promoção multi-grupo — conserva o fluxo (R13)', () => {
  it('após uma virada com grupos paralelos, cada grupo segue com 20 clubes', () => {
    let w = seedWorld('multi');
    w = expandTurn(w, 'multi'); // 1,1,1,2 (agora há grupos paralelos)
    expect(widths(w)).toEqual([1, 1, 1, 2]);
    const before = new Set(allClubs(w).map((c) => c.id));
    w = advanceWorld(w, simulateWorldSeason(w, 'multi'), 'multi'); // vira SEM expandir → multi-promo
    for (const t of w.tiers) for (const lg of t.leagues) expect(lg.clubs).toHaveLength(CLUBS);
    const after = new Set(allClubs(w).map((c) => c.id));
    expect(after).toEqual(before); // conjunto de clubes conservado (só redistribui)
  });

  it('promove entre grupos: um campeão de grupo da entrada sobe de andar', () => {
    let w = seedWorld('sobe');
    w = expandTurn(w, 'sobe'); // 1,1,1,2
    const results = simulateWorldSeason(w, 'sobe');
    const entryTier = w.tiers[w.tiers.length - 1]!;
    // campeão do 1º grupo da entrada (melhor da tabela do grupo)
    const g1Id = entryTier.leagues[0]!.leagueId;
    const g1Table = results.leagues.find((l) => l.result.leagueId === g1Id)!.result.table;
    const champion = g1Table[0]!.clubId;
    const after = advanceWorld(w, results, 'sobe'); // multi-promo, sem expandir
    const tierAboveEntry = after.tiers.find((t) => t.tier === entryTier.tier - 1)!;
    const aboveIds = new Set(tierAboveEntry.leagues.flatMap((l) => l.clubs.map((c) => c.id)));
    expect(aboveIds.has(champion)).toBe(true); // o campeão subiu
  });
});
