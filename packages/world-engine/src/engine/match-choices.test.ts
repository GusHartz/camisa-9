// Motor de escolhas na partida (SPEC-048) — testes puros: determinismo, 1-5 por partida, ≤1 intervenção
// por tempo, ancoragem na timeline, efeitos declarados, boundary (sem participação → só intervenções).
import { describe, expect, it } from 'vitest';
import {
  CHOICES_PER_MATCH,
  MATCH_CHOICES,
  choiceTemplateById,
  matchChoices,
  type MatchChoice,
  type MatchChoiceContext,
} from './match-choices.js';

const RICH: MatchChoiceContext = {
  goalMinutes: [23, 71],
  concededMinutes: [40],
  clubInjuredMinute: 55,
  result: 'win',
};
const EMPTY: MatchChoiceContext = {
  goalMinutes: [],
  concededMinutes: [],
  clubInjuredMinute: null,
  result: 'draw',
};

/** Fixa os ids da partida; varia o atleta (→ varia o stream). */
function mc(athleteId: string, ctx: MatchChoiceContext): MatchChoice[] {
  return matchChoices('seed-048', 'L1', 'S1', 1, 'H', 'A', athleteId, ctx);
}

describe('matchChoices (SPEC-048, puro)', () => {
  it('determinístico: mesma entrada → mesmas escolhas', () => {
    expect(mc('me', RICH)).toEqual(mc('me', RICH));
  });

  it('1-5 escolhas por partida; sempre ≥1', () => {
    for (let i = 0; i < 300; i++) {
      const cs = mc(`a${i}`, RICH);
      expect(cs.length).toBeGreaterThanOrEqual(CHOICES_PER_MATCH.min);
      expect(cs.length).toBeLessThanOrEqual(CHOICES_PER_MATCH.max);
    }
  });

  it('≤1 intervenção por tempo', () => {
    const interventionIds = new Set(MATCH_CHOICES.filter((t) => t.intervention).map((t) => t.id));
    for (let i = 0; i < 300; i++) {
      const cs = mc(`b${i}`, RICH);
      const byHalf = { 1: 0, 2: 0 };
      for (const c of cs) if (interventionIds.has(c.templateId)) byHalf[c.half]++;
      expect(byHalf[1]).toBeLessThanOrEqual(1);
      expect(byHalf[2]).toBeLessThanOrEqual(1);
    }
  });

  it('ancorado na timeline: comemoração num minuto de gol; intervenções no tempo certo', () => {
    let sawComemoracao = false;
    for (let i = 0; i < 300; i++) {
      for (const c of mc(`c${i}`, RICH)) {
        if (c.templateId === 'comemoracao') {
          sawComemoracao = true;
          expect(RICH.goalMinutes).toContain(c.minute); // no minuto de um gol DELE
        }
        if (c.templateId === 'pressao-tecnico') expect(c.half).toBe(1);
        if (c.templateId === 'ajuste-intervalo') {
          expect(c.half).toBe(2);
          expect(c.minute).toBe(46); // o intervalo
        }
        expect(c.half).toBe(c.minute <= 45 ? 1 : 2); // coerência minuto↔tempo
      }
    }
    expect(sawComemoracao).toBe(true); // ao longo de 300 seeds, a comemoração aparece
  });

  it('cronológico: minutos em ordem crescente', () => {
    for (let i = 0; i < 100; i++) {
      const cs = mc(`d${i}`, RICH);
      for (let j = 1; j < cs.length; j++)
        expect(cs[j]!.minute).toBeGreaterThanOrEqual(cs[j - 1]!.minute);
    }
  });

  it('salient primeiro: a comemoração (seu gol) aparece mais que um filler', () => {
    let com = 0;
    let filler = 0;
    for (let i = 0; i < 300; i++) {
      const ids = new Set(mc(`s${i}`, RICH).map((c) => c.templateId));
      if (ids.has('comemoracao')) com++;
      if (ids.has('chance-clara')) filler++;
    }
    expect(com).toBeGreaterThan(filler); // o momento SEU é rankeado antes do filler
  });

  it('choiceTemplateById: round-trip de cada escolha gerada; undefined p/ id inexistente', () => {
    for (const c of mc('me', RICH)) expect(choiceTemplateById(c.templateId)).toBeDefined();
    expect(choiceTemplateById('nao-existe')).toBeUndefined();
  });

  it('cada opção tem efeito declarado (Record<string, number|string>); cada template tem uma conservadora', () => {
    for (const t of MATCH_CHOICES) {
      expect(t.options.length).toBeGreaterThan(0);
      for (const o of t.options) {
        expect(typeof o.effect).toBe('object');
        for (const v of Object.values(o.effect)) expect(['number', 'string']).toContain(typeof v);
      }
      expect(t.options.some((o) => o.conservative)).toBe(true); // fallback existe
    }
    for (const c of mc('me', RICH)) for (const o of c.options) expect(o.effect).toBeDefined();
  });

  it('boundary — sem participação: só as intervenções/lull disparam (≥1), sem comemoração/provocação/lesão', () => {
    const eventTriggered = new Set(['comemoracao', 'provocacao', 'lesao-colega']);
    for (let i = 0; i < 200; i++) {
      const cs = mc(`e${i}`, EMPTY);
      expect(cs.length).toBeGreaterThanOrEqual(1);
      for (const c of cs) expect(eventTriggered.has(c.templateId)).toBe(false);
    }
  });
});
