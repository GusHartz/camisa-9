// buildTodayMatch — a timeline de gols (SPEC-043), PURO (sem DB). Prova: pré-jogo OMITE `goals`; um
// jogo com gols vira timeline orientada `isMine` (meus gols == goalsFor); 0-0 jogado → `goals === []`;
// as lesões NÃO entram na timeline de gols (só `kind==='goal'`).
import { describe, expect, it } from 'vitest';
import type { MatchEvent, RoundResult } from '@camisa-9/world-engine';
import { buildTodayMatch, type BandMatchCtx } from '../src/band/from-world.js';

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
  const minuteMine = (g: {
    minute: number;
    isMine: boolean;
  }): { minute: number; isMine: boolean } => ({
    minute: g.minute,
    isMine: g.isMine,
  });

  it('pré-jogo (sem rodada) → `goals` OMITIDO (ausente = não se aplica); myRating null', () => {
    const m = buildTodayMatch('A', FIX, null, 'Rival', null);
    expect(m.played).toBe(false);
    expect('goals' in m).toBe(false);
    expect(m.myRating).toBeNull();
  });

  it('jogado com gols → timeline orientada `isMine` (meus gols == goalsFor)', () => {
    const events: MatchEvent[] = [
      { kind: 'goal', clubId: 'A', minute: 23 },
      { kind: 'goal', clubId: 'B', minute: 40 },
      { kind: 'goal', clubId: 'A', minute: 71 },
    ];
    const m = buildTodayMatch('A', FIX, round(events), 'Rival', null);
    expect(m.played).toBe(true);
    expect(m.goals!.map(minuteMine)).toEqual([
      { minute: 23, isMine: true },
      { minute: 40, isMine: false },
      { minute: 71, isMine: true },
    ]);
    expect(m.goals!.filter((g) => g.isMine).length).toBe(m.goalsFor); // 2 == goalsFor
  });

  it('0-0 jogado (sem events) → `goals === []` (presente, vazio — um fato real)', () => {
    const m = buildTodayMatch('A', FIX, round(undefined, 0, 0), 'Rival', null);
    expect(m.played).toBe(true);
    expect(m.goals).toEqual([]);
  });

  it('a timeline de gols IGNORA as lesões (só kind=goal)', () => {
    const events: MatchEvent[] = [
      { kind: 'injury', clubId: 'A', athleteId: 'A-1', severity: 'leve', minute: 30 },
      { kind: 'goal', clubId: 'A', minute: 50 },
    ];
    const m = buildTodayMatch('A', FIX, round(events, 1, 0), 'Rival', null);
    expect(m.goals!.map(minuteMine)).toEqual([{ minute: 50, isMine: true }]);
  });

  it('SEM ctx (null) num jogo JOGADO: sem autor/assistência nomeados, byMe/assistByMe false, myRating null', () => {
    const events: MatchEvent[] = [{ kind: 'goal', clubId: 'A', minute: 12, athleteId: 'A-9' }];
    const m = buildTodayMatch('A', FIX, round(events, 1, 0), 'Rival', null);
    expect(m.goals![0]).toMatchObject({
      byMe: false,
      scorer: null,
      assistByMe: false,
      assist: null,
    });
    expect(m.myRating).toBeNull(); // played, mas sem ctx → sem nota
  });
});

describe('buildTodayMatch — artilheiro/assistência/nota (SPEC-046, puro)', () => {
  const CTX: BandMatchCtx = {
    meWorldId: 'A-me',
    position: 'FWD',
    focos: { fisico: 50, tecnico: 70, tatico: 60, mental: 50 },
    seed: 'seed-046',
    leagueId: 'L1',
    seasonId: 'S1',
    nameByWorldId: new Map([
      ['A-me', 'Eu'],
      ['A-9', 'Colega'],
    ]),
  };

  it('meu gol com assistência do colega: byMe + nomes; myRating no range', () => {
    const events: MatchEvent[] = [
      { kind: 'goal', clubId: 'A', minute: 30, athleteId: 'A-me', assistId: 'A-9' },
      { kind: 'goal', clubId: 'B', minute: 55 }, // gol do adversário: sem nome, não é meu
    ];
    const m = buildTodayMatch('A', FIX, round(events, 1, 1), 'Rival', CTX);
    expect(m.goals![0]).toMatchObject({
      byMe: true,
      scorer: 'Eu',
      assistByMe: false,
      assist: 'Colega',
    });
    // gol do adversário: sem autor/assistência nomeados
    expect(m.goals![1]).toMatchObject({ isMine: false, byMe: false, scorer: null, assist: null });
    expect(m.myRating).not.toBeNull();
    expect(m.myRating!).toBeGreaterThanOrEqual(3);
    expect(m.myRating!).toBeLessThanOrEqual(10);
    expect(m.myRating).toBe(buildTodayMatch('A', FIX, round(events, 1, 1), 'Rival', CTX).myRating); // determinística
  });

  it('minha assistência (não marquei): assistByMe true, byMe false', () => {
    const events: MatchEvent[] = [
      { kind: 'goal', clubId: 'A', minute: 20, athleteId: 'A-9', assistId: 'A-me' },
    ];
    const g = buildTodayMatch('A', FIX, round(events, 1, 0), 'Rival', CTX).goals![0]!;
    expect(g).toMatchObject({ byMe: false, assistByMe: true, scorer: 'Colega', assist: 'Eu' });
  });

  it('nota DEFENSIVA (GK/DEF): clean sheet tira nota melhor que sofrer 3 (via a faixa)', () => {
    const defCtx: BandMatchCtx = {
      ...CTX,
      position: 'DEF',
      meWorldId: 'A-def',
      focos: { fisico: 80, tecnico: 40, tatico: 50, mental: 50 },
      nameByWorldId: new Map([['A-def', 'Zaga']]),
    };
    // clean sheet: meu clube (A) vence 1-0
    const clean = buildTodayMatch(
      'A',
      FIX,
      round([{ kind: 'goal', clubId: 'A', minute: 10 }], 1, 0),
      'Rival',
      defCtx,
    ).myRating!;
    // sofre 3: 1-3
    const events3: MatchEvent[] = [
      { kind: 'goal', clubId: 'A', minute: 10 },
      { kind: 'goal', clubId: 'B', minute: 20 },
      { kind: 'goal', clubId: 'B', minute: 30 },
      { kind: 'goal', clubId: 'B', minute: 40 },
    ];
    const leaky = buildTodayMatch('A', FIX, round(events3, 1, 3), 'Rival', defCtx).myRating!;
    expect(clean).toBeGreaterThan(leaky); // mesma seed → variância igual; difere o defensivo + resultado
  });
});
