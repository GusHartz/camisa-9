import { describe, expect, it } from 'vitest';
import type { RoundResult } from '../types.js';
import { RoundStore, type PublishedRound } from './store.js';

const round: RoundResult = { round: 1, matches: [] };
const rec = (roundNo: number): PublishedRound => ({
  leagueId: 'L',
  seasonId: 'S',
  round: roundNo,
  result: { ...round, round: roundNo },
});

describe('RoundStore — contrato transacional', () => {
  it('begin/stage/commit torna a rodada visível', () => {
    const s = new RoundStore();
    s.begin();
    s.stage(rec(1));
    expect(s.has('L', 'S', 1)).toBe(false); // ainda não commitado
    s.commit();
    expect(s.has('L', 'S', 1)).toBe(true);
    expect(s.get('L', 'S', 1)?.round).toBe(1);
    expect(s.size()).toBe(1);
  });

  it('a LEITURA nunca enxerga o staging (isolamento)', () => {
    const s = new RoundStore();
    s.begin();
    s.stage(rec(7));
    expect(s.get('L', 'S', 7)).toBeUndefined();
    expect(s.size()).toBe(0);
  });

  it('rollback descarta tudo que foi staged (all-or-nothing)', () => {
    const s = new RoundStore();
    s.begin();
    s.stage(rec(1));
    s.stage(rec(2));
    s.rollback();
    expect(s.has('L', 'S', 1)).toBe(false);
    expect(s.has('L', 'S', 2)).toBe(false);
    expect(s.size()).toBe(0);
  });

  it('commit é um swap atômico sobre o estado anterior', () => {
    const s = new RoundStore();
    s.begin();
    s.stage(rec(1));
    s.commit();
    s.begin();
    s.stage(rec(2));
    s.commit();
    expect(s.size()).toBe(2);
    expect(s.has('L', 'S', 1)).toBe(true);
    expect(s.has('L', 'S', 2)).toBe(true);
  });

  it('rejeita transação dupla e mutação fora de transação', () => {
    const s = new RoundStore();
    s.begin();
    expect(() => s.begin()).toThrow();
    s.rollback();
    expect(() => s.stage(rec(1))).toThrow();
    expect(() => s.commit()).toThrow();
  });
});
