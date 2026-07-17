// Motor de decisões (SPEC-025) — testes puros: geração determinística + gatilhada por estado, 3-5/dia
// (≥3 até para o novato), o gatilho de moral inerte (seam da 2.3), a opção conservadora e a validação.
import { describe, expect, it } from 'vitest';
import {
  DECISIONS,
  DECISIONS_PER_DAY,
  conservativeOption,
  generateDailyDecisions,
  optionById,
  templateById,
  type DecisionContext,
} from './decisions.js';

const RICH: DecisionContext = { overall: 60, balance: 2000, lifestyleTier: 2 };
const ROOKIE: DecisionContext = { overall: 34, balance: 0, lifestyleTier: 0 };

describe('decisions — geração (pura)', () => {
  it('determinística: mesmo (seed,dia,atleta,contexto) → mesmo conjunto', () => {
    const a = generateDailyDecisions('s1', 100, 'atleta-1', RICH);
    const b = generateDailyDecisions('s1', 100, 'atleta-1', RICH);
    expect(a).toEqual(b);
  });

  it('gera 3-5/dia (rico) e ≥3 até para o novato (4 cotidianos sempre-on)', () => {
    const rich = generateDailyDecisions('s1', 100, 'a', RICH);
    expect(rich.length).toBeGreaterThanOrEqual(DECISIONS_PER_DAY.min);
    expect(rich.length).toBeLessThanOrEqual(DECISIONS_PER_DAY.max);
    const rookie = generateDailyDecisions('s1', 100, 'a', ROOKIE);
    expect(rookie.length).toBeGreaterThanOrEqual(3);
  });

  it('boundary N: o RICO chega a 5; o NOVATO fica em 3-4 (limitado pelos candidatos)', () => {
    let maxRich = 0;
    let maxRookie = 0;
    for (let day = 0; day < 40; day++) {
      maxRich = Math.max(maxRich, generateDailyDecisions('s', day, 'a', RICH).length);
      maxRookie = Math.max(maxRookie, generateDailyDecisions('s', day, 'a', ROOKIE).length);
    }
    expect(maxRich).toBe(DECISIONS_PER_DAY.max); // 5
    expect(maxRookie).toBeGreaterThanOrEqual(3);
    expect(maxRookie).toBeLessThanOrEqual(4); // só 4 cotidianos sempre-on
  });

  it('gatilho por estado: a proposta de 2× salário SÓ com overall alto', () => {
    for (let day = 0; day < 20; day++) {
      const ids = generateDailyDecisions('s', day, 'a', ROOKIE).map((d) => d.templateId);
      expect(ids).not.toContain('proposta-salario'); // overall 34 < 55 → nunca candidata
    }
    const t = templateById('proposta-salario')!;
    expect(t.trigger({ overall: 55, balance: 0, lifestyleTier: 0 })).toBe(true);
    expect(t.trigger({ overall: 54, balance: 0, lifestyleTier: 0 })).toBe(false);
  });

  it('crise-moral (seam da 2.3) é INERTE sem moral, ativa com moral < 30', () => {
    const t = templateById('crise-moral')!;
    expect(t.trigger({ overall: 99, balance: 9999, lifestyleTier: 3 })).toBe(false); // sem moral
    expect(t.trigger({ overall: 34, balance: 0, lifestyleTier: 0, moral: 20 })).toBe(true);
    for (let day = 0; day < 20; day++) {
      const ids = generateDailyDecisions('s', day, 'a', RICH).map((d) => d.templateId);
      expect(ids).not.toContain('crise-moral'); // o contexto não tem moral → nunca aparece
    }
  });

  it('seam da IDADE: veterano gatilha com age ≥ 34 (inerte sem age)', () => {
    const t = templateById('veterano')!;
    expect(t.trigger({ overall: 34, balance: 0, lifestyleTier: 0 })).toBe(false); // sem age
    expect(t.trigger({ overall: 34, balance: 0, lifestyleTier: 0, age: 34 })).toBe(true);
    let found = false;
    for (let day = 0; day < 30 && !found; day++) {
      found = generateDailyDecisions('s', day, 'a', { ...ROOKIE, age: 35 }).some(
        (d) => d.templateId === 'veterano',
      );
    }
    expect(found).toBe(true); // o seam de idade fica vivo na geração
  });

  it('variabilidade: dias diferentes NÃO dão sempre o mesmo conjunto (não é seleção constante)', () => {
    const sets = new Set<string>();
    for (let day = 0; day < 15; day++) {
      const key = generateDailyDecisions('s1', day, 'a', RICH)
        .map((d) => d.templateId)
        .sort()
        .join(',');
      sets.add(key);
    }
    expect(sets.size).toBeGreaterThan(1);
  });
});

describe('decisions — catálogo (pura)', () => {
  it('todo template tem uma opção conservadora MARCADA (o fallback nunca fica órfão)', () => {
    for (const t of DECISIONS) {
      expect(t.options.some((o) => o.conservative)).toBe(true);
    }
  });
});

describe('decisions — opções (pura)', () => {
  it('conservativeOption devolve a opção marcada (status-quo)', () => {
    expect(conservativeOption('treino-extra')?.id).toBe('descanso');
    expect(conservativeOption('proposta-salario')?.id).toBe('ficar');
  });

  it('optionById valida a opção do template', () => {
    expect(optionById('treino-extra', 'extra')?.label).toBeTruthy();
    expect(optionById('treino-extra', 'inexistente')).toBeUndefined();
    expect(optionById('template-x', 'extra')).toBeUndefined();
  });
});
