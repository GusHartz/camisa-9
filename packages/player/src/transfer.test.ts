import { describe, expect, it } from 'vitest';
import { WORLD } from '@camisa-9/world-engine';
import { TRANSFER, isTransferTarget, transferValue } from './transfer.js';

describe('transfer — heurística (pura)', () => {
  it('bandMaxByTier CRUZA com WORLD.abilityByTier (o redeclare standalone bate com o engine)', () => {
    expect(TRANSFER.bandMaxByTier).toEqual(WORLD.abilityByTier.map((b) => b.max));
  });

  it('forte para o tier É alvo; fraco NÃO', () => {
    // tier 4 (várzea, topo da banda 66): overall 60 é forte (>= 66-6=60); 50 não
    expect(isTransferTarget(60, 4)).toBe(true);
    expect(isTransferTarget(50, 4)).toBe(false);
    // tier 1 (topo, banda 90): só um craque (>= 84) é assediado
    expect(isTransferTarget(85, 1)).toBe(true);
    expect(isTransferTarget(70, 1)).toBe(false);
  });

  it('explore (testar o mercado) baixa o threshold', () => {
    expect(isTransferTarget(52, 4)).toBe(false); // sem explore (precisa 60)
    expect(isTransferTarget(52, 4, true)).toBe(true); // com explore (66-6-8 = 52)
  });

  it('tier fora de 1..4 nunca é alvo', () => {
    expect(isTransferTarget(99, 0)).toBe(false);
    expect(isTransferTarget(99, 5)).toBe(false);
  });

  it('transferValue sobe com overall, cai depois do pico de idade, nunca negativo', () => {
    expect(transferValue(60, 25)).toBeGreaterThan(transferValue(40, 25));
    expect(transferValue(60, 35)).toBeLessThan(transferValue(60, 25)); // idade decai
    expect(Number.isInteger(transferValue(60, 25))).toBe(true);
    expect(transferValue(20, 60)).toBeGreaterThanOrEqual(0); // clamp em 0
  });
});
