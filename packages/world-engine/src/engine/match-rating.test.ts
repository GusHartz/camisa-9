// Nota da partida (SPEC-046) — testes puros: determinismo, range/clamp, gols/assistências/resultado
// sobem, defensivo (clean sheet × Físico), e Mental = menor variância (consistência).
import { describe, expect, it } from 'vitest';
import { matchRating, RATING, type MatchOutcome, type RatingInput } from './match-rating.js';

const BASE: RatingInput = {
  seed: 'r-seed',
  leagueId: 'L1',
  seasonId: 'S1',
  round: 1,
  homeId: 'H',
  awayId: 'A',
  athleteId: 'me',
  position: 'MID',
  goalsScored: 0,
  assists: 0,
  goalsAgainst: 1,
  result: 'draw',
  focos: { fisico: 50, tecnico: 50, tatico: 50, mental: 50 },
};

/** Média da nota sobre muitas seeds (varia o atleta → varia o stream de variância). */
function avg(inp: RatingInput, n = 200): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += matchRating({ ...inp, athleteId: `a${i}` });
  return s / n;
}

describe('matchRating (SPEC-046, puro)', () => {
  it('determinística: mesma entrada → mesma nota', () => {
    expect(matchRating(BASE)).toBe(matchRating(BASE));
  });

  it('range: sempre em [30, 100] (décimos = 3,0..10,0)', () => {
    for (const g of [0, 1, 3])
      for (const r of ['win', 'draw', 'loss'] as MatchOutcome[])
        for (let a = 0; a < 50; a++) {
          const n = matchRating({ ...BASE, goalsScored: g, result: r, athleteId: `z${a}` });
          expect(n).toBeGreaterThanOrEqual(RATING.min);
          expect(n).toBeLessThanOrEqual(RATING.max);
        }
  });

  it('clamp SUPERIOR: uma atuação enorme satura em RATING.max (pré-clamp >100 p/ toda variância)', () => {
    // 60 + 5×9 + 3×6 + 5(win) = 128; +variância ∈ [−12,12] → ≥116 > 100 sempre → satura.
    const n = matchRating({
      ...BASE,
      position: 'FWD',
      result: 'win',
      goalsScored: 5,
      assists: 3,
      focos: { ...BASE.focos, mental: 0 },
    });
    expect(n).toBe(RATING.max);
  });

  it('gol e assistência SOBEM a nota (média sobre seeds)', () => {
    expect(avg({ ...BASE, goalsScored: 2 })).toBeGreaterThan(avg(BASE) + RATING.perGoal);
    expect(avg({ ...BASE, assists: 2 })).toBeGreaterThan(avg(BASE) + RATING.perAssist);
  });

  it('vitória > derrota (média sobre seeds)', () => {
    expect(avg({ ...BASE, result: 'win' })).toBeGreaterThan(avg({ ...BASE, result: 'loss' }));
  });

  it('defensivo: zagueiro em clean sheet supera o que sofreu 3 (mesma seed)', () => {
    const clean = matchRating({ ...BASE, position: 'DEF', goalsAgainst: 0 });
    const leaky = matchRating({ ...BASE, position: 'DEF', goalsAgainst: 3 });
    expect(clean).toBeGreaterThan(leaky);
  });

  it('Físico eleva a nota defensiva no clean sheet (mesma seed)', () => {
    const strong = matchRating({
      ...BASE,
      position: 'DEF',
      goalsAgainst: 0,
      focos: { ...BASE.focos, fisico: 99 },
    });
    const weak = matchRating({
      ...BASE,
      position: 'DEF',
      goalsAgainst: 0,
      focos: { ...BASE.focos, fisico: 0 },
    });
    expect(strong).toBeGreaterThan(weak);
  });

  it('Mental alto = MENOR variância (consistência)', () => {
    const spread = (mental: number): number => {
      let min = 999;
      let max = -999;
      for (let i = 0; i < 300; i++) {
        const n = matchRating({ ...BASE, athleteId: `a${i}`, focos: { ...BASE.focos, mental } });
        if (n < min) min = n;
        if (n > max) max = n;
      }
      return max - min;
    };
    expect(spread(99)).toBeLessThan(spread(0));
  });
});
