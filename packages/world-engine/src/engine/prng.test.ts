import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRng, nextUint32, nextFloat, nextInt, deriveSeed } from './prng.js';

const kat = JSON.parse(
  readFileSync(new URL('../__fixtures__/prng.golden.json', import.meta.url), 'utf8'),
) as { seed: string; values: number[] };

describe('prng', () => {
  it('bate com o vetor known-answer commitado (determinismo cross-ambiente)', () => {
    const rng = createRng(kat.seed);
    const got = kat.values.map(() => nextUint32(rng));
    expect(got).toEqual(kat.values);
  });

  it('mesma seed → mesma sequência', () => {
    const a = createRng('s');
    const b = createRng('s');
    const seqA = Array.from({ length: 8 }, () => nextUint32(a));
    const seqB = Array.from({ length: 8 }, () => nextUint32(b));
    expect(seqA).toEqual(seqB);
  });

  it('sementes diferentes → sequências diferentes', () => {
    const a = createRng('x');
    const b = createRng('y');
    expect(nextUint32(a)).not.toBe(nextUint32(b));
  });

  it('nextUint32 fica no intervalo uint32', () => {
    const rng = createRng('range');
    for (let i = 0; i < 200; i++) {
      const v = nextUint32(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('nextFloat em [0,1) e nextInt em [0,n)', () => {
    const rng = createRng('u');
    for (let i = 0; i < 200; i++) {
      const f = nextFloat(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = nextInt(rng, 6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
  });

  it('deriveSeed compõe sub-seeds estáveis, distintas e sem colisão de delimitador', () => {
    expect(deriveSeed('base', 2, 'c01', 'c02')).toBe('4:base|1:2|3:c01|3:c02');
    expect(deriveSeed('base', 1)).not.toBe(deriveSeed('base', 2));
    // Codificação injetiva: dois jogos distintos cujos ids contêm '|' NÃO podem
    // derivar a mesma sub-seed (senão compartilhariam o mesmo stream de RNG).
    expect(deriveSeed('S', '2026', 5, 'a', 'b|c')).not.toBe(deriveSeed('S', '2026', 5, 'a|b', 'c'));
  });
});
