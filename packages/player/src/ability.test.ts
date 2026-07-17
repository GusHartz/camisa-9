// Projeção focos→`ability` (SPEC-020) — testes PUROS: o overall trunca (floor), a projeção é
// idêntica ao overall em v1 (pesos neutros para TODA posição), e o recém-criado cai no PISO
// exato da divisão de entrada (tier-4) do engine. Sem banco, sempre rodam.
import { describe, expect, it } from 'vitest';
import { WORLD } from '@camisa-9/world-engine';
import { POSITIONS } from './constants.js';
import { abilityFromFocos, overall } from './ability.js';
import type { Attributes } from './types.js';

function attrs(fisico = 34, tecnico = 34, tatico = 34, mental = 34): Attributes {
  return { fisico, tecnico, tatico, mental };
}

describe('overall', () => {
  it('recém-criado (soma 136) → 34; craque (99×4) → 99', () => {
    expect(overall(attrs())).toBe(34);
    expect(overall(attrs(99, 99, 99, 99))).toBe(99);
  });

  it('TRUNCA (floor), nunca arredonda', () => {
    expect(overall(attrs(35, 35, 34, 34))).toBe(34); // soma 138 → 34,5 → 34
    expect(overall(attrs(36, 35, 34, 34))).toBe(34); // soma 139 → 34,75 → 34
  });
});

describe('abilityFromFocos', () => {
  it('em v1 é IDÊNTICO ao overall para TODA posição (pesos neutros)', () => {
    const samples = [attrs(), attrs(99, 99, 99, 99), attrs(50, 40, 30, 20), attrs(70, 70, 70, 28)];
    for (const pos of POSITIONS) {
      for (const a of samples) {
        expect(abilityFromFocos(a, pos)).toBe(overall(a));
      }
    }
  });

  it('a posição NÃO altera o resultado em v1 (seam de ponderação desligado)', () => {
    const a = attrs(80, 60, 40, 20);
    const results = POSITIONS.map((p) => abilityFromFocos(a, p));
    expect(new Set(results).size).toBe(1);
  });

  it('recém-criado cai no PISO exato da divisão de entrada (tier-4 = 34..66)', () => {
    const varzea = WORLD.abilityByTier[3]!;
    const a = abilityFromFocos(attrs(), 'FWD');
    expect(a).toBe(varzea.min); // 34
    expect(a).toBeGreaterThanOrEqual(varzea.min);
    expect(a).toBeLessThanOrEqual(varzea.max);
  });
});
