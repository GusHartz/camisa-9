// Roll das opções arriscadas (SPEC-050) — testes puros: determinismo, monotonia, clamp, sub-seeds.
import { describe, expect, it } from 'vitest';
import { CHOICE_ROLL, resolveChoiceRoll, rollChance, type RollInput } from './match-choice-roll.js';

function roll(over: Partial<RollInput>): { success: boolean; chance: number } {
  return resolveChoiceRoll({
    seed: 'seed-050',
    leagueId: 'L1',
    seasonId: 'S1',
    round: 1,
    homeId: 'H',
    awayId: 'A',
    athleteId: 'me',
    templateId: 'chance-clara',
    optionId: 'arriscar',
    attr: 50,
    moral: 50,
    ...over,
  });
}

describe('resolveChoiceRoll (SPEC-050, puro)', () => {
  it('determinístico: mesma entrada → mesmo {success, chance}', () => {
    expect(roll({})).toEqual(roll({}));
    expect(roll({ attr: 90, moral: 80 })).toEqual(roll({ attr: 90, moral: 80 }));
  });

  it('chance: base 50 no neutro; monotônica em attr e moral; peso 60/40 (attr pesa mais)', () => {
    expect(rollChance(50, 50)).toBe(CHOICE_ROLL.base);
    expect(rollChance(90, 50)).toBeGreaterThan(rollChance(30, 50));
    expect(rollChance(50, 90)).toBeGreaterThan(rollChance(50, 10));
    expect(rollChance(90, 50) - 50).toBeGreaterThan(rollChance(50, 90) - 50);
  });

  it('clamp [15,85]: nunca sem esperança, nunca certo', () => {
    expect(rollChance(0, 0)).toBe(CHOICE_ROLL.min);
    expect(rollChance(99, 100)).toBe(CHOICE_ROLL.max);
  });

  it('no MESMO sorteio, subir attr/moral nunca vira sucesso→falha (só melhora)', () => {
    for (let i = 0; i < 200; i++) {
      const lo = roll({ athleteId: `m${i}`, attr: 30, moral: 40 });
      const hi = roll({ athleteId: `m${i}`, attr: 80, moral: 90 });
      if (lo.success) expect(hi.success).toBe(true);
    }
  });

  it('sub-seed por (template, opção): rolls independentes entre opções', () => {
    let differ = 0;
    for (let i = 0; i < 200; i++) {
      const a = roll({ athleteId: `a${i}` });
      const b = roll({ athleteId: `a${i}`, templateId: 'provocacao', optionId: 'revidar' });
      if (a.success !== b.success) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  });

  it('a taxa de sucesso acompanha a chance (amostra determinística de 300 atletas)', () => {
    let wins = 0;
    for (let i = 0; i < 300; i++) if (roll({ athleteId: `s${i}` }).success) wins++;
    expect(wins).toBeGreaterThan(300 * 0.35); // chance 50 ± folga (determinístico, sem flake)
    expect(wins).toBeLessThan(300 * 0.65);
    let hiWins = 0;
    for (let i = 0; i < 300; i++)
      if (roll({ athleteId: `s${i}`, attr: 99, moral: 100 }).success) hiWins++;
    expect(hiWins).toBeGreaterThan(wins); // attr/moral altos → mais sucesso na MESMA amostra
  });
});
