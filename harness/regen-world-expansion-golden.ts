// Regenera o golden do CRESCIMENTO (`world-expansion.golden.json`) da Pirâmide Elástica (R13,
// SPEC-036). Diferente do `world.golden.json` (all-NPC, expand=false), este força `expand=TRUE`
// a cada virada (bypassa a borda de ocupação) → exercita a topologia crescendo + a promoção
// multi-grupo, determinística por seed. Reproduz EXATAMENTE o `runExpansionChain()` de
// `expansion.golden.test.ts`.
//
// Borda IMPURA (usa `fs`) — vive em `harness/`, nunca em `packages/*/src`. NÃO usa relógio/
// entropia: a saída é determinística; só o founder decide regerar (o `note` é o contrato).
//
// Uso: npm run build && tsx harness/regen-world-expansion-golden.ts
import { writeFileSync } from 'node:fs';
import { seedWorld, simulateWorldSeason, advanceWorld, worldHash } from '@camisa-9/world-engine';

const SEED = 'elastica';
const TURNS = 6;

function runChain(): string[] {
  let world = seedWorld(SEED);
  const hashes = [worldHash(world)];
  for (let s = 0; s < TURNS; s += 1) {
    const results = simulateWorldSeason(world, SEED);
    world = advanceWorld(world, results, SEED, new Set(), true); // expand=TRUE forçado
    hashes.push(worldHash(world));
  }
  return hashes;
}

const hashes = runChain();
const golden = {
  seed: SEED,
  turns: TURNS,
  note:
    'SPEC-036 — âncora do CRESCIMENTO (R13, Pirâmide Elástica). expand=TRUE forçado a cada virada ' +
    '(bypassa a borda de ocupação) → exercita a topologia crescendo + a promoção multi-grupo. ' +
    'hashes[0] = mundo semeado; hashes[i] = após i viragens COM expansão. ' +
    'Regerar só com mudança INTENCIONAL do stream/topologia — via harness/regen-world-expansion-golden.ts.',
  hashes,
};

const target = new URL(
  '../packages/world-engine/src/__fixtures__/world-expansion.golden.json',
  import.meta.url,
);
writeFileSync(target, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
console.log(`world-expansion.golden.json regenerado (${hashes.length} hashes):`);
for (const h of hashes) console.log(`  ${h}`);
