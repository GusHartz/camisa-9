import { describe, expect, it } from 'vitest';
import { WORLD } from '@camisa-9/world-engine';
import { allocateAttributes } from './attributes.js';
import { CREATION_TOTAL } from './constants.js';
import type { Focus } from './types.js';

function attrs(
  fisico: number,
  tecnico: number,
  tatico: number,
  mental: number,
): Record<Focus, number> {
  return { fisico, tecnico, tatico, mental };
}
function overall(a: Record<Focus, number>): number {
  return (a.fisico + a.tecnico + a.tatico + a.mental) / 4;
}

describe('allocateAttributes — criação (piso 20 · pool 56 · teto 50)', () => {
  const VALID = [attrs(34, 34, 34, 34), attrs(50, 46, 20, 20), attrs(20, 20, 46, 50)];

  it('aceita builds válidos (soma 136, cada foco em [20,50])', () => {
    for (const v of VALID) expect(allocateAttributes(v).ok).toBe(true);
  });

  it('overall é SEMPRE 34 (pool fixo → justiça na largada)', () => {
    for (const v of VALID) expect(overall(v)).toBe(34);
  });

  it('CREATION_TOTAL é 136', () => {
    expect(CREATION_TOTAL).toBe(136);
  });

  it('rejeita soma ≠ 136', () => {
    expect(allocateAttributes(attrs(50, 50, 50, 50)).ok).toBe(false); // soma 200
  });

  it('rejeita foco acima do teto 50 (mesmo com soma 136)', () => {
    expect(allocateAttributes(attrs(51, 35, 30, 20)).ok).toBe(false);
  });

  it('rejeita foco abaixo do piso 20', () => {
    expect(allocateAttributes(attrs(19, 39, 38, 40)).ok).toBe(false);
  });

  it('rejeita valor não-inteiro', () => {
    expect(allocateAttributes(attrs(34.5, 33.5, 34, 34)).ok).toBe(false);
  });

  it('calibração: overall (34) fica no FUNDO da banda várzea do engine (34..66)', () => {
    const varzea = WORLD.abilityByTier[3]!; // tier 4 (várzea)
    const o = overall(attrs(34, 34, 34, 34));
    expect(o).toBeGreaterThanOrEqual(varzea.min);
    expect(o).toBeLessThanOrEqual(varzea.max);
    expect(o).toBe(varzea.min);
  });
});
