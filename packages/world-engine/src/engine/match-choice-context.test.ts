// Derivação events→ctx (SPEC-050) — a fonte única api/scheduler: byMe, sofridos, self-exclusion da
// lesão, result orientado ao mando.
import { describe, expect, it } from 'vitest';
import { choiceContextFrom } from './match-choice-context.js';
import type { MatchResult } from '../types.js';

const MATCH: MatchResult = {
  round: 3,
  homeId: 'MEU',
  awayId: 'ELES',
  homeGoals: 2,
  awayGoals: 1,
  events: [
    { kind: 'goal', clubId: 'MEU', minute: 23, athleteId: 'eu', assistId: 'colega' },
    { kind: 'goal', clubId: 'ELES', minute: 40, athleteId: 'rival' },
    { kind: 'goal', clubId: 'MEU', minute: 71, athleteId: 'colega' },
    { kind: 'injury', clubId: 'MEU', athleteId: 'colega', severity: 'leve', minute: 55 },
    { kind: 'injury', clubId: 'ELES', athleteId: 'rival2', severity: 'media', minute: 60 },
  ],
};

describe('choiceContextFrom (SPEC-050, puro)', () => {
  it('mandante: byMe/sofridos/lesão-de-colega/result', () => {
    expect(choiceContextFrom(MATCH, 'MEU', 'eu')).toEqual({
      goalMinutes: [23],
      concededMinutes: [40],
      clubInjuredMinute: 55,
      result: 'win',
    });
  });

  it('self-exclusion: a MINHA lesão não vira "um companheiro caiu" (bug da revisão 048)', () => {
    const ctx = choiceContextFrom(MATCH, 'MEU', 'colega');
    expect(ctx.clubInjuredMinute).toBeNull(); // a única lesão do MEU clube é a dele mesmo
    expect(ctx.goalMinutes).toEqual([71]);
  });

  it('visitante: result orientado + os gols do outro lado são os sofridos', () => {
    const ctx = choiceContextFrom(MATCH, 'ELES', 'rival');
    expect(ctx.result).toBe('loss');
    expect(ctx.concededMinutes).toEqual([23, 71]);
    expect(ctx.goalMinutes).toEqual([40]);
    expect(ctx.clubInjuredMinute).toBe(60); // rival2 ≠ rival
  });

  it('sem eventos: listas vazias, lesão null, result do placar', () => {
    const m: MatchResult = { round: 1, homeId: 'X', awayId: 'Y', homeGoals: 0, awayGoals: 0 };
    expect(choiceContextFrom(m, 'X', 'eu')).toEqual({
      goalMinutes: [],
      concededMinutes: [],
      clubInjuredMinute: null,
      result: 'draw',
    });
  });
});
