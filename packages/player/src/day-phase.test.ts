// A regra da fase do dia (SPEC-038) — PURA. As fronteiras 11/12 e 20/21 são as duas únicas
// transições; sem sondá-las, os limiares poderiam ser qualquer coisa com a suíte verde.
import { describe, expect, it } from 'vitest';
import { dayPhase, type DayPhase } from './day-phase.js';

describe('dayPhase — três faixas horárias contíguas', () => {
  it('a tabela das 24 horas', () => {
    const esperado: Record<number, DayPhase> = {};
    for (let h = 0; h < 12; h++) esperado[h] = 'ct';
    for (let h = 12; h < 21; h++) esperado[h] = 'casa';
    for (let h = 21; h < 24; h++) esperado[h] = 'vespera';
    for (let h = 0; h < 24; h++) expect(dayPhase(h), `hora ${h}`).toBe(esperado[h]);
  });

  it('as fronteiras exatas — 11/12 e 20/21', () => {
    expect(dayPhase(11)).toBe('ct');
    expect(dayPhase(12)).toBe('casa'); // a manhã acaba ao meio-dia
    expect(dayPhase(20)).toBe('casa');
    expect(dayPhase(21)).toBe('vespera'); // a véspera começa às 21h
  });

  it('as 15h — o jogo — caem DENTRO de casa (não é um 4º estado)', () => {
    expect(dayPhase(15)).toBe('casa');
  });
});
