// A conversão data → dayIndex (SPEC-039, critério 3). PURA — roda sempre, sem banco.
//
// Por que sondar tanto: um erro de 1 aqui desloca o calendário INTEIRO do mundo (a rodada 1 cai no
// dia errado e o catch-up replaya o buraco). E a tentação na implementação era reimplementar a
// aritmética de fuso — por isso o teste compara contra o PRÓPRIO `resolveSlot` do engine.
import { describe, expect, it } from 'vitest';
import { resolveSlot } from '@camisa-9/world-engine';
import { dayIndexFromDate, OpsDateError } from './ops-date.js';

/** 15h de Brasília = 18:00 UTC (offset fixo −3 do projeto). */
const at15hBrt = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d, 18, 0, 0, 0);

describe('dayIndexFromDate — a data que o operador digita', () => {
  it('bate com o resolveSlot do engine (a única fonte da aritmética de fuso)', () => {
    for (const [y, m, d] of [
      [2026, 8, 1],
      [2026, 1, 1],
      [2030, 12, 31],
      [2026, 2, 28],
    ] as const) {
      const esperado = resolveSlot(at15hBrt(y, m, d)).dayIndex;
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      expect(dayIndexFromDate(iso), iso).toBe(esperado);
    }
  });

  it('dias consecutivos são dayIndex consecutivos — inclusive na virada de mês e de ano', () => {
    expect(dayIndexFromDate('2026-09-01') - dayIndexFromDate('2026-08-31')).toBe(1);
    expect(dayIndexFromDate('2027-01-01') - dayIndexFromDate('2026-12-31')).toBe(1);
    expect(dayIndexFromDate('2028-02-29') - dayIndexFromDate('2028-02-28')).toBe(1); // bissexto
    expect(dayIndexFromDate('2028-03-01') - dayIndexFromDate('2028-02-29')).toBe(1);
  });

  it('é determinística e ignora espaço em volta', () => {
    expect(dayIndexFromDate('  2026-08-01  ')).toBe(dayIndexFromDate('2026-08-01'));
  });

  it('recusa formato errado — nunca grava NaN no banco', () => {
    for (const ruim of ['', '   ', '01/08/2026', '2026-8-1', '2026-08', 'amanhã', '20260801']) {
      expect(() => dayIndexFromDate(ruim), ruim).toThrow(OpsDateError);
    }
  });

  it('recusa data INEXISTENTE em vez de normalizar em silêncio', () => {
    // `Date.UTC` viraria 2026-02-30 em 2026-03-02 sem reclamar — e o mundo seria ancorado num dia
    // que o operador nunca pediu.
    for (const ruim of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2027-02-29']) {
      expect(() => dayIndexFromDate(ruim), ruim).toThrow(OpsDateError);
    }
  });
});
