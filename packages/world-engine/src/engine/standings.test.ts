import { describe, expect, it } from 'vitest';
import type { MatchResult } from '../types.js';
import { computeStandings } from './standings.js';

const m = (homeId: string, awayId: string, homeGoals: number, awayGoals: number): MatchResult => ({
  round: 1,
  homeId,
  awayId,
  homeGoals,
  awayGoals,
});

describe('computeStandings', () => {
  it('pontua vitória=3, empate=1, derrota=0', () => {
    const table = computeStandings(['a', 'b', 'c'], [m('a', 'b', 2, 0), m('b', 'c', 1, 1)]);
    const by = new Map(table.map((r) => [r.clubId, r]));
    expect(by.get('a')?.points).toBe(3);
    expect(by.get('a')?.won).toBe(1);
    expect(by.get('b')?.points).toBe(1);
    expect(by.get('b')?.drawn).toBe(1);
    expect(by.get('c')?.points).toBe(1);
  });

  it('clubes sem partidas aparecem zerados', () => {
    const table = computeStandings(['a', 'b'], []);
    expect(table).toHaveLength(2);
    for (const r of table) {
      expect(r.played).toBe(0);
      expect(r.points).toBe(0);
      expect(r.goalDiff).toBe(0);
    }
  });

  it('desempata por saldo → gols pró → id (ordem total estável)', () => {
    // a e b: 3 pts cada. a saldo +3, b saldo +1 → a na frente.
    const table = computeStandings(['a', 'b', 'c', 'd'], [m('a', 'c', 3, 0), m('b', 'd', 1, 0)]);
    expect(table[0]?.clubId).toBe('a');
    expect(table[1]?.clubId).toBe('b');
  });

  it('empate total de critérios → ordena por id (determinístico)', () => {
    // z e a: mesmos pts/saldo/gols → 'a' antes de 'z'.
    const table = computeStandings(['z', 'a'], [m('z', 'a', 1, 1)]);
    expect(table.map((r) => r.clubId)).toEqual(['a', 'z']);
  });

  it('é idempotente/determinística (duas chamadas → mesma tabela)', () => {
    const matches = [m('a', 'b', 2, 1), m('b', 'c', 0, 0), m('c', 'a', 1, 3)];
    expect(computeStandings(['a', 'b', 'c'], matches)).toEqual(
      computeStandings(['a', 'b', 'c'], matches),
    );
  });
});
