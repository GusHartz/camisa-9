import { describe, expect, it } from 'vitest';
import type { Club } from '../types.js';
import { DEMO_LEAGUE } from '../data/league-seed.js';
import { generateFixtures } from './fixtures.js';

const club = (id: string): Club => ({ id, name: id, strength: 70 });

describe('generateFixtures', () => {
  it('10 clubes → 18 rodadas, 5 partidas/rodada, 90 partidas (turno-returno)', () => {
    const fx = generateFixtures(DEMO_LEAGUE.clubs);
    expect(fx).toHaveLength(90);
    const rounds = new Set(fx.map((f) => f.round));
    expect(rounds.size).toBe(18);
    for (let r = 1; r <= 18; r++) {
      expect(fx.filter((f) => f.round === r)).toHaveLength(5);
    }
  });

  it('cada par joga exatamente 2×, uma vez em cada mando', () => {
    const fx = generateFixtures(DEMO_LEAGUE.clubs);
    const ordered = new Map<string, number>();
    for (const f of fx) {
      const k = `${f.homeId}>${f.awayId}`;
      ordered.set(k, (ordered.get(k) ?? 0) + 1);
    }
    // 90 confrontos ordenados distintos, cada um exatamente 1×.
    expect(ordered.size).toBe(90);
    for (const count of ordered.values()) {
      expect(count).toBe(1);
    }
    // e o espelho (returno) sempre existe.
    for (const k of ordered.keys()) {
      const [home, away] = k.split('>');
      expect(ordered.has(`${away}>${home}`)).toBe(true);
    }
  });

  it('nenhum clube joga duas vezes na mesma rodada', () => {
    const fx = generateFixtures(DEMO_LEAGUE.clubs);
    for (let r = 1; r <= 18; r++) {
      const ids = fx.filter((f) => f.round === r).flatMap((f) => [f.homeId, f.awayId]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('é determinística (mesma entrada → mesma tabela)', () => {
    expect(generateFixtures(DEMO_LEAGUE.clubs)).toEqual(generateFixtures(DEMO_LEAGUE.clubs));
  });

  it('rejeita contagem ímpar ou < 2', () => {
    expect(() => generateFixtures([club('a'), club('b'), club('c')])).toThrow(RangeError);
    expect(() => generateFixtures([club('a')])).toThrow(RangeError);
  });
});
