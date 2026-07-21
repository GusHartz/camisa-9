// buildTodayMatch — a timeline de gols (SPEC-043), PURO (sem DB). Prova: pré-jogo OMITE `goals`; um
// jogo com gols vira timeline orientada `isMine` (meus gols == goalsFor); 0-0 jogado → `goals === []`;
// as lesões NÃO entram na timeline de gols (só `kind==='goal'`).
import { describe, expect, it } from 'vitest';
import type { MatchEvent, RoundResult } from '@camisa-9/world-engine';
import { buildTodayMatch } from '../src/band/from-world.js';

const FIX = { opponentClubId: 'B', isHome: true } as const;

function round(events?: readonly MatchEvent[], home = 2, away = 1): RoundResult {
  return {
    round: 1,
    matches: [
      {
        round: 1,
        homeId: 'A',
        awayId: 'B',
        homeGoals: home,
        awayGoals: away,
        ...(events ? { events } : {}),
      },
    ],
  };
}

describe('buildTodayMatch — timeline de gols (SPEC-043, puro)', () => {
  it('pré-jogo (sem rodada) → `goals` OMITIDO (ausente = não se aplica)', () => {
    const m = buildTodayMatch('A', FIX, null, 'Rival');
    expect(m.played).toBe(false);
    expect('goals' in m).toBe(false);
  });

  it('jogado com gols → timeline orientada `isMine` (meus gols == goalsFor)', () => {
    const events: MatchEvent[] = [
      { kind: 'goal', clubId: 'A', minute: 23 },
      { kind: 'goal', clubId: 'B', minute: 40 },
      { kind: 'goal', clubId: 'A', minute: 71 },
    ];
    const m = buildTodayMatch('A', FIX, round(events), 'Rival');
    expect(m.played).toBe(true);
    expect(m.goals).toEqual([
      { minute: 23, isMine: true },
      { minute: 40, isMine: false },
      { minute: 71, isMine: true },
    ]);
    expect(m.goals!.filter((g) => g.isMine).length).toBe(m.goalsFor); // 2 == goalsFor
  });

  it('0-0 jogado (sem events) → `goals === []` (presente, vazio — um fato real)', () => {
    const m = buildTodayMatch('A', FIX, round(undefined, 0, 0), 'Rival');
    expect(m.played).toBe(true);
    expect(m.goals).toEqual([]);
  });

  it('a timeline de gols IGNORA as lesões (só kind=goal)', () => {
    const events: MatchEvent[] = [
      { kind: 'injury', clubId: 'A', athleteId: 'A-1', severity: 'leve', minute: 30 },
      { kind: 'goal', clubId: 'A', minute: 50 },
    ];
    const m = buildTodayMatch('A', FIX, round(events, 1, 0), 'Rival');
    expect(m.goals).toEqual([{ minute: 50, isMine: true }]);
  });
});
