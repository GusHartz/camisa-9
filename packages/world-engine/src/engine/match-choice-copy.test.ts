// Narrativa de desfecho (SPEC-051) — testes puros: cobertura total do catálogo, tom sem punição no
// fracasso, e a prova de que a prosa NÃO tocou a geração das escolhas (o catálogo é intocado).
import { describe, expect, it } from 'vitest';
import { MATCH_CHOICES, matchChoices, type MatchChoiceContext } from './match-choices.js';
import { choiceOutcomeText, outcomesOf } from './match-choice-copy.js';

const RICH: MatchChoiceContext = {
  goalMinutes: [23, 71],
  concededMinutes: [40],
  clubInjuredMinute: 55,
  result: 'win',
};

describe('narrativa de desfecho (SPEC-051, pura)', () => {
  it('COBERTURA: toda opção declara a prosa de TODO desfecho que ela pode produzir', () => {
    let checked = 0;
    for (const t of MATCH_CHOICES) {
      for (const o of t.options) {
        const outcomes = outcomesOf(t.id, o.id);
        expect(outcomes.length).toBeGreaterThan(0); // a opção existe no catálogo
        for (const r of outcomes) {
          const text = choiceOutcomeText(t.id, o.id, r);
          expect(text, `${t.id}/${o.id}/${r}`).toBeDefined();
          expect(text!.title.length).toBeGreaterThan(0);
          expect(text!.body.length).toBeGreaterThan(0);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(16); // 4 arriscadas × 2 desfechos + 8 determinísticas × 1
  });

  it('arriscada declara success E fail; determinística declara na (e só na)', () => {
    for (const t of MATCH_CHOICES) {
      for (const o of t.options) {
        if (o.risky) {
          expect(choiceOutcomeText(t.id, o.id, 'success')).toBeDefined();
          expect(choiceOutcomeText(t.id, o.id, 'fail')).toBeDefined();
          expect(choiceOutcomeText(t.id, o.id, 'na')).toBeUndefined();
        } else {
          expect(choiceOutcomeText(t.id, o.id, 'na')).toBeDefined();
          expect(choiceOutcomeText(t.id, o.id, 'success')).toBeUndefined();
          expect(choiceOutcomeText(t.id, o.id, 'fail')).toBeUndefined();
        }
      }
    }
  });

  it('TOM: o fracasso nunca pune (anti-culpa do charter) — sem "você errou"/"culpa"/"burrada"', () => {
    const punitivo = /voc[êe]\s+errou|culpa|burrad|vacil|idiot|imbecil|fracass/i;
    for (const t of MATCH_CHOICES) {
      for (const o of t.options) {
        const fail = choiceOutcomeText(t.id, o.id, 'fail');
        if (!fail) continue;
        expect(punitivo.test(`${fail.title} ${fail.body}`), `${t.id}/${o.id}`).toBe(false);
      }
    }
  });

  it('id inexistente → undefined (a borda omite os campos; o cliente degrada)', () => {
    expect(choiceOutcomeText('nao-existe', 'x', 'na')).toBeUndefined();
    expect(choiceOutcomeText('chance-clara', 'nao-existe', 'na')).toBeUndefined();
    expect(outcomesOf('nao-existe', 'x')).toEqual([]);
  });

  it('SELO: a prosa não toca a geração — as escolhas seguem byte-idênticas (fixture da SPEC-048)', () => {
    const strip = (athleteId: string): { templateId: string; minute: number; half: 1 | 2 }[] =>
      matchChoices('seed-048', 'L1', 'S1', 1, 'H', 'A', athleteId, RICH).map((c) => ({
        templateId: c.templateId,
        minute: c.minute,
        half: c.half,
      }));
    expect(strip('me')).toEqual([
      { templateId: 'provocacao', minute: 40, half: 1 },
      { templateId: 'lesao-colega', minute: 55, half: 2 },
      { templateId: 'comemoracao', minute: 71, half: 2 },
    ]);
    // e as OPÇÕES do catálogo continuam sem campo de prosa (o lookup é externo)
    for (const c of matchChoices('seed-048', 'L1', 'S1', 1, 'H', 'A', 'me', RICH)) {
      for (const o of c.options) expect('outcome' in o).toBe(false);
    }
  });
});
