// Âncora cross-ambiente do CRESCIMENTO (R13, SPEC-036): a cadeia de viragens COM expansão
// (expand=true forçado) bate byte-a-byte com o golden commitado. É o par do `world.golden.json`
// (all-NPC, expand=false) — este prova o caminho que RAMIFICA. Regenerar SÓ via
// harness/regen-world-expansion-golden.ts (decisão do founder; o `note` do golden é o contrato).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seedWorld } from '../data/world-seed.js';
import { simulateWorldSeason } from './world-season.js';
import { advanceWorld } from './world-turnover.js';
import { worldHash } from './world-hash.js';

const golden = JSON.parse(
  readFileSync(new URL('../__fixtures__/world-expansion.golden.json', import.meta.url), 'utf8'),
) as { seed: string; turns: number; hashes: readonly string[] };

function runExpansionChain(seed: string, turns: number): string[] {
  let world = seedWorld(seed);
  const hashes = [worldHash(world)];
  for (let s = 0; s < turns; s += 1) {
    const results = simulateWorldSeason(world, seed);
    world = advanceWorld(world, results, seed, new Set(), true); // expand=TRUE
    hashes.push(worldHash(world));
  }
  return hashes;
}

describe('world-expansion.golden — âncora do crescimento (R13)', () => {
  it('reproduz a cadeia (determinismo interno)', () => {
    expect(runExpansionChain(golden.seed, golden.turns)).toEqual(
      runExpansionChain(golden.seed, golden.turns),
    );
  });

  it('bate byte-a-byte com o golden commitado (âncora cross-ambiente)', () => {
    expect(runExpansionChain(golden.seed, golden.turns)).toEqual([...golden.hashes]);
  });
});
