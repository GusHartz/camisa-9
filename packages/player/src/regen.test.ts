// Legado do Regen (SPEC-022) — testes PUROS: o banco de pontos de largada é uma fração (floor)
// dos pontos da carreira anterior, com saneamento defensivo. Sem banco, sempre roda.
import { describe, expect, it } from 'vitest';
import { REGEN } from './constants.js';
import { regenLegacyPoints } from './regen.js';

describe('regenLegacyPoints', () => {
  it('é uma fração (legacyPct%) dos pontos da carreira anterior', () => {
    expect(regenLegacyPoints(100)).toBe(Math.floor((100 * REGEN.legacyPct) / 100)); // 25% → 25
    expect(regenLegacyPoints(0)).toBe(0);
  });

  it('TRUNCA (floor), nunca arredonda', () => {
    expect(regenLegacyPoints(9)).toBe(2); // 25% de 9 = 2,25 → 2
    expect(regenLegacyPoints(10)).toBe(2); // 25% de 10 = 2,5 → 2
  });

  it('satura pontos negativos em 0 (defensivo)', () => {
    expect(regenLegacyPoints(-50)).toBe(0);
  });
});
