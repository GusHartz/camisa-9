import { describe, expect, it } from 'vitest';
import { MATCH } from '../constants.js';
import { createRng } from './prng.js';
import { resolveMatch } from './match.js';

describe('resolveMatch', () => {
  it('é determinística: mesma força + mesma seed → mesmo placar', () => {
    const a = resolveMatch(80, 65, createRng('m1'));
    const b = resolveMatch(80, 65, createRng('m1'));
    expect(a).toEqual(b);
  });

  it('gols ficam em [0, maxChances] para ambos os lados', () => {
    for (let i = 0; i < 300; i++) {
      const s = resolveMatch(90 - i, 50 + (i % 40), createRng(`bounds-${i}`));
      for (const g of [s.homeGoals, s.awayGoals]) {
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(MATCH.maxChances);
      }
    }
  });

  it('vantagem de mando: entre times iguais, casa vence mais que fora', () => {
    let home = 0;
    let away = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const s = resolveMatch(70, 70, createRng(`ha-${i}`));
      if (s.homeGoals > s.awayGoals) home++;
      else if (s.awayGoals > s.homeGoals) away++;
    }
    expect(home).toBeGreaterThan(away);
  });

  it('força domina: um time muito superior vence a grande maioria', () => {
    let strong = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const s = resolveMatch(95, 45, createRng(`gap-${i}`));
      if (s.homeGoals > s.awayGoals) strong++;
    }
    expect(strong / N).toBeGreaterThan(0.75);
  });
});
