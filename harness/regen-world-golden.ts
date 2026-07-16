// Regenera o golden do mundo (`world.golden.json`) após uma mudança INTENCIONAL
// de tunável que altera o stream do PRNG. Introduzido na SPEC-012 (elenco 20→16 +
// transfersPerLeague 12→10). Reproduz EXATAMENTE o `runChain()` de
// `world-turnover.test.ts` (semeia + 10 viragens, coletando `worldHash`).
//
// Borda IMPURA (usa `fs`) — vive em `harness/`, nunca em `packages/*/src`, onde o
// guardrail de determinismo proíbe I/O. NÃO usa relógio/entropia: a saída é
// determinística; só o founder decide regerar (o `note` do golden é o contrato).
//
// Uso: npm run build && tsx harness/regen-world-golden.ts
import { writeFileSync } from 'node:fs';
import { seedWorld, simulateWorldSeason, advanceWorld, worldHash } from '@camisa-9/world-engine';

const SEED = 'decada';
const TURNOVERS = 10;

function runChain(): string[] {
  let world = seedWorld(SEED);
  const hashes = [worldHash(world)];
  for (let s = 0; s < TURNOVERS; s += 1) {
    const results = simulateWorldSeason(world, SEED);
    world = advanceWorld(world, results, SEED);
    hashes.push(worldHash(world));
  }
  return hashes;
}

const hashes = runChain();
const golden = {
  seed: SEED,
  seasons: TURNOVERS + 1,
  note:
    'SPEC-012 — âncora cross-ambiente (elenco 16 + transfersPerLeague 10). ' +
    'hashes[0] = mundo semeado; hashes[i] = após i viragens. ' +
    'Regerar só com mudança INTENCIONAL do stream do PRNG (rompe replay) — via harness/regen-world-golden.ts.',
  hashes,
};

const target = new URL(
  '../packages/world-engine/src/__fixtures__/world.golden.json',
  import.meta.url,
);
writeFileSync(target, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
console.log(`world.golden.json regenerado (${hashes.length} hashes):`);
for (const h of hashes) console.log(`  ${h}`);
