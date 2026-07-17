// Economia (SPEC-024) — testes puros: salário/prêmio inteiros, validação da compra (existe / 1× /
// moradia em ordem / saldo), lifestyle tier pela escada, agregado dos trade-offs (só dado), marco.
import { describe, expect, it } from 'vitest';
import {
  ECONOMY,
  MOTHERS_HOUSE_ID,
  aggregateTradeoffs,
  canAfford,
  hasMothersHouse,
  lifestyleTier,
  matchPrize,
  roundEarnings,
  salaryPerRound,
  validatePurchase,
} from './economy.js';

describe('economy — salário e prêmios (puro)', () => {
  it('salaryPerRound cresce com o overall (inteiro)', () => {
    expect(salaryPerRound(34)).toBe(ECONOMY.salaryBase + 34 * ECONOMY.salaryPerOverall);
    expect(salaryPerRound(99)).toBeGreaterThan(salaryPerRound(34));
    expect(Number.isInteger(salaryPerRound(50))).toBe(true);
    expect(salaryPerRound(-5)).toBe(ECONOMY.salaryBase); // satura overall negativo
  });

  it('matchPrize: vitória > empate > derrota >= 0', () => {
    expect(matchPrize('win')).toBeGreaterThan(matchPrize('draw'));
    expect(matchPrize('draw')).toBeGreaterThan(matchPrize('loss'));
    expect(matchPrize('loss')).toBeGreaterThanOrEqual(0);
  });

  it('roundEarnings = salário (+ prêmio se houver resultado)', () => {
    expect(roundEarnings(40)).toBe(salaryPerRound(40));
    expect(roundEarnings(40, 'win')).toBe(salaryPerRound(40) + matchPrize('win'));
  });
});

describe('economy — compras e validação (puro)', () => {
  it('validatePurchase: item válido com saldo → ok', () => {
    expect(validatePurchase(1000, [], 'videogame')).toEqual({ ok: true });
  });

  it('validatePurchase: item inexistente → erro', () => {
    expect(validatePurchase(9999, [], 'jato-particular')).toEqual({
      ok: false,
      reason: 'item inválido',
    });
  });

  it('validatePurchase: item já possuído (1×) → erro específico', () => {
    expect(validatePurchase(9999, ['videogame'], 'videogame')).toEqual({
      ok: false,
      reason: 'item já adquirido',
    });
  });

  it('validatePurchase: saldo insuficiente → erro', () => {
    expect(validatePurchase(100, [], 'carro')).toEqual({ ok: false, reason: 'saldo insuficiente' });
  });

  it('validatePurchase: saldo EXATO (custo == saldo) → ok', () => {
    expect(validatePurchase(500, [], 'videogame')).toEqual({ ok: true });
  });

  it('validatePurchase: moradia fora de ordem (casa sem quitinete) → erro', () => {
    expect(validatePurchase(999999, [], 'casa')).toEqual({
      ok: false,
      reason: 'moradia fora de ordem',
    });
    // com o degrau anterior, passa
    expect(validatePurchase(999999, ['quitinete'], 'casa')).toEqual({ ok: true });
  });

  it('canAfford reflete o custo', () => {
    expect(canAfford(500, 'videogame')).toBe(true);
    expect(canAfford(499, 'videogame')).toBe(false);
  });
});

describe('economy — moradia, marco e trade-offs (puro)', () => {
  it('lifestyleTier = o maior degrau possuído (pensão 0 default)', () => {
    expect(lifestyleTier([])).toBe(0);
    expect(lifestyleTier(['quitinete'])).toBe(1);
    expect(lifestyleTier(['quitinete', 'casa'])).toBe(2);
    expect(lifestyleTier(['quitinete', 'casa', 'cobertura', 'carro'])).toBe(3); // itens não contam
  });

  it('hasMothersHouse liga com o marco', () => {
    expect(hasMothersHouse(['carro'])).toBe(false);
    expect(hasMothersHouse([MOTHERS_HOUSE_ID])).toBe(true);
  });

  it('aggregateTradeoffs soma os trade-offs DECLARADOS (só dado)', () => {
    const agg = aggregateTradeoffs(['carro', 'academia']);
    // carro { moral:10, fama:8, risco:2 } + academia { fisico:6, quimica:-5 }
    expect(agg).toEqual({ moral: 10, fama: 8, risco: 2, fisico: 6, quimica: -5 });
    expect(aggregateTradeoffs([])).toEqual({});
    expect(aggregateTradeoffs(['inexistente'])).toEqual({}); // ignora id desconhecido
  });

  it('aggregateTradeoffs SOMA chaves repetidas entre itens (ex.: moral)', () => {
    // videogame { moral:8, fisico:-3 } + carro { moral:10, fama:8, risco:2 } → moral 18
    expect(aggregateTradeoffs(['videogame', 'carro'])).toEqual({
      moral: 18,
      fisico: -3,
      fama: 8,
      risco: 2,
    });
  });
});
