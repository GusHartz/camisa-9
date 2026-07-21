import { describe, expect, it } from 'vitest';
import { SHIRT, shirtNumber } from './shirt-number.js';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const;

describe('shirtNumber (SPEC-040) — número derivado da posição', () => {
  it('determinístico: mesmo (posição, id) → mesmo número', () => {
    for (const p of POSITIONS) {
      expect(shirtNumber(p, 'atleta-1')).toBe(shirtNumber(p, 'atleta-1'));
    }
  });

  it('position-tied: todo número ∈ pool da posição, e ∈ [1,99]', () => {
    for (const p of POSITIONS) {
      for (let i = 0; i < 200; i++) {
        const n = shirtNumber(p, `id-${i}`);
        expect(SHIRT.pools[p]).toContain(n);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(99);
      }
    }
  });

  it('variedade: ids distintos numa posição NÃO dão um número constante (não é canônico único)', () => {
    for (const p of POSITIONS) {
      const seen = new Set<number>();
      for (let i = 0; i < 300; i++) seen.add(shirtNumber(p, `v-${i}`));
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  it('cobre boa parte do pool dado ids suficientes (distribuição, não colapsa)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(shirtNumber('FWD', `dist-${i}`));
    expect(seen.size).toBeGreaterThanOrEqual(3); // FWD tem 5 números
  });

  it('posição desconhecida → fallback (fecha o caso impossível)', () => {
    expect(shirtNumber('XX', 'qualquer')).toBe(SHIRT.fallback);
    expect(shirtNumber('', 'qualquer')).toBe(SHIRT.fallback);
    expect(shirtNumber('gk', 'qualquer')).toBe(SHIRT.fallback); // case-sensitive: 'gk' != 'GK'
  });
});
