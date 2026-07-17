// Lesões — o arco (SPEC-026) — testes puros: dias de recuperação por gravidade, as fases do arco
// (recuperando → recuperado), a disponibilidade derivada (o seam), a guarda de gravidade, o comeback.
import { describe, expect, it } from 'vitest';
import {
  INJURY,
  injuryEndDay,
  injuryPhase,
  isAvailable,
  isSeverity,
  recoveryDaysFor,
  type Injury,
} from './injury.js';

describe('injury — o arco (puro)', () => {
  it('recoveryDaysFor cresce com a gravidade', () => {
    expect(recoveryDaysFor('leve')).toBeLessThan(recoveryDaysFor('media'));
    expect(recoveryDaysFor('media')).toBeLessThan(recoveryDaysFor('grave'));
  });

  it('injuryPhase: recuperando até o prazo, recuperado a partir dele', () => {
    const inj: Injury = { severity: 'media', startedDay: 100, recoveryDays: 10 };
    expect(injuryEndDay(inj)).toBe(110);
    expect(injuryPhase(inj, 105)).toBe('recuperando');
    expect(injuryPhase(inj, 109)).toBe('recuperando');
    expect(injuryPhase(inj, 110)).toBe('recuperado');
    expect(injuryPhase(inj, 200)).toBe('recuperado');
  });

  it('isAvailable: sem lesão true; recuperando false; recuperado true (o seam)', () => {
    const inj: Injury = { severity: 'grave', startedDay: 0, recoveryDays: 30 };
    expect(isAvailable(null, 100)).toBe(true);
    expect(isAvailable(inj, 10)).toBe(false);
    expect(isAvailable(inj, 30)).toBe(true);
  });

  it('isSeverity valida a gravidade (guarda da borda)', () => {
    expect(isSeverity('leve')).toBe(true);
    expect(isSeverity('grave')).toBe(true);
    expect(isSeverity('mortal')).toBe(false);
  });

  it('o comeback é um outcome declarado (a volta por cima, nunca punição cega)', () => {
    expect(Object.keys(INJURY.comeback).length).toBeGreaterThan(0);
  });
});
