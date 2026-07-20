// daysUntilRevert (SPEC-038) — PURA. O relógio do congelamento (SPEC-023) que a faixa mostra.
import { describe, expect, it } from 'vitest';
import { daysUntilRevert } from './vacancy.js';

const REVERT = 30; // o valor injetado pela borda (VACANCY.revertAfterDays)

describe('daysUntilRevert', () => {
  it('não congelado ⇒ null (não se aplica, nunca zero)', () => {
    expect(daysUntilRevert(null, 100, REVERT)).toBeNull();
  });

  it('conta do dia do congelamento até o limiar', () => {
    expect(daysUntilRevert(100, 100, REVERT)).toBe(30); // congelou hoje
    expect(daysUntilRevert(100, 110, REVERT)).toBe(20); // 10 dias depois
    expect(daysUntilRevert(100, 129, REVERT)).toBe(1); // véspera da reversão
  });

  it('no dia da reversão e além ⇒ 0, nunca negativo', () => {
    expect(daysUntilRevert(100, 130, REVERT)).toBe(0);
    expect(daysUntilRevert(100, 200, REVERT)).toBe(0);
  });
});
