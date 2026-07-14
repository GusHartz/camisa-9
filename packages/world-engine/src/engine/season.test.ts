import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LeagueState, SeasonResult } from '../types.js';
import { DEMO_LEAGUE } from '../data/league-seed.js';
import { simulateSeason } from './season.js';
import { createRng, deriveSeed } from './prng.js';
import { resolveMatch } from './match.js';

const golden = JSON.parse(
  readFileSync(new URL('../__fixtures__/season.golden.json', import.meta.url), 'utf8'),
) as { seed: string; leagueId: string; seasonId: string; result: SeasonResult };

const strengthById = new Map(DEMO_LEAGUE.clubs.map((c) => [c.id, c.strength]));

describe('simulateSeason — determinismo e golden', () => {
  it('bate byte-a-byte com o golden commitado (âncora cross-ambiente)', () => {
    const result = simulateSeason(DEMO_LEAGUE, golden.seed);
    expect(result).toEqual(golden.result);
  });

  it('mesma liga + mesma seed → temporada idêntica', () => {
    const a = simulateSeason(DEMO_LEAGUE, 'det-seed');
    const b = simulateSeason(DEMO_LEAGUE, 'det-seed');
    expect(a).toEqual(b);
  });

  it('seeds diferentes → temporadas diferentes', () => {
    const a = simulateSeason(DEMO_LEAGUE, 'seed-a');
    const b = simulateSeason(DEMO_LEAGUE, 'seed-b');
    expect(a).not.toEqual(b);
  });

  it('produz 18 rodadas, 90 partidas e tabela completa de 10 clubes', () => {
    const r = simulateSeason(DEMO_LEAGUE, 'shape');
    expect(r.rounds).toHaveLength(18);
    expect(r.rounds.flatMap((x) => x.matches)).toHaveLength(90);
    expect(r.table).toHaveLength(10);
    expect(r.table.reduce((s, row) => s + row.played, 0)).toBe(180); // 90 jogos × 2 lados
  });
});

describe('simulateSeason — replay/auditoria (independente da ordem)', () => {
  it('qualquer partida é reconstruível a partir de (seed, liga, temporada, rodada, ids)', () => {
    const result = simulateSeason(DEMO_LEAGUE, golden.seed);
    for (const round of result.rounds) {
      for (const match of round.matches) {
        const home = strengthById.get(match.homeId) ?? 0;
        const away = strengthById.get(match.awayId) ?? 0;
        const rng = createRng(
          deriveSeed(
            golden.seed,
            DEMO_LEAGUE.leagueId,
            DEMO_LEAGUE.seasonId,
            match.round,
            match.homeId,
            match.awayId,
          ),
        );
        const replayed = resolveMatch(home, away, rng);
        expect(replayed.homeGoals).toBe(match.homeGoals);
        expect(replayed.awayGoals).toBe(match.awayGoals);
      }
    }
  });

  it('duas ligas com o MESMO seed/temporada/ids, mas leagueId distinto, geram mundos DIFERENTES', () => {
    const norte: LeagueState = { ...DEMO_LEAGUE, leagueId: 'liga-norte' };
    const sul: LeagueState = { ...DEMO_LEAGUE, leagueId: 'liga-sul' };
    const a = simulateSeason(norte, 'MESMO-SEED');
    const b = simulateSeason(sul, 'MESMO-SEED');
    expect(a.rounds).not.toEqual(b.rounds); // a chave de replay é única por liga
  });
});

// O teto de 100 ms é o ORÇAMENTO ratificado na SPEC-002 (Cenário 7: N≈256 ligas,
// tick 3×/semana < 5 min → folga ~10×), não um tripwire fino de regressão — a folga
// medida é enorme (~1 ms). O lock de regressão byte-a-byte é o teste do golden acima;
// o `console.log` abaixo é a evidência de custo (medição), o assert é o teto go/no-go.
describe('simulateSeason — custo e escala (SPEC-002)', () => {
  it('1 temporada < 100 ms', () => {
    const start = performance.now();
    simulateSeason(DEMO_LEAGUE, 'bench-1');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('K = 64 ligas: custo médio por temporada < 100 ms', () => {
    const K = 64;
    const start = performance.now();
    for (let i = 0; i < K; i++) {
      simulateSeason(DEMO_LEAGUE, `scale-${i}`);
    }
    const perSeason = (performance.now() - start) / K;
    console.log(`[bench] ${K} temporadas, ${perSeason.toFixed(3)} ms/temporada`);
    expect(perSeason).toBeLessThan(100);
  });
});

describe('simulateSeason — credibilidade estatística (20 temporadas)', () => {
  it('favorito vence ~45–70%, empates 15–35%, e o favorito ganha mais que o azarão', () => {
    let favWins = 0;
    let dogWins = 0;
    let draws = 0;
    let total = 0;
    for (let s = 0; s < 20; s++) {
      const result = simulateSeason(DEMO_LEAGUE, `cred-${s}`);
      for (const match of result.rounds.flatMap((r) => r.matches)) {
        total++;
        const homeStr = strengthById.get(match.homeId) ?? 0;
        const awayStr = strengthById.get(match.awayId) ?? 0;
        if (match.homeGoals === match.awayGoals) {
          draws++;
          continue;
        }
        const homeWon = match.homeGoals > match.awayGoals;
        const favoriteIsHome = homeStr >= awayStr;
        if (homeWon === favoriteIsHome) favWins++;
        else dogWins++;
      }
    }
    const favRate = favWins / total;
    const drawRate = draws / total;
    console.log(
      `[cred] fav=${(favRate * 100).toFixed(1)}% dog=${((dogWins / total) * 100).toFixed(1)}% draw=${(drawRate * 100).toFixed(1)}%`,
    );
    expect(favRate).toBeGreaterThanOrEqual(0.45);
    expect(favRate).toBeLessThanOrEqual(0.7);
    expect(drawRate).toBeGreaterThanOrEqual(0.15);
    expect(drawRate).toBeLessThanOrEqual(0.35);
    expect(favWins).toBeGreaterThan(dogWins);
  });

  it('o clube mais forte termina a maioria das temporadas no G-4', () => {
    let topFour = 0;
    for (let s = 0; s < 20; s++) {
      const result = simulateSeason(DEMO_LEAGUE, `title-${s}`);
      const pos = result.table.findIndex((row) => row.clubId === 'c01');
      if (pos >= 0 && pos < 4) topFour++;
    }
    expect(topFour).toBeGreaterThanOrEqual(14); // ≥70% das temporadas
  });
});

// Guard extra: uma liga menor (par) também roda sem erro de força ausente.
const SMALL_LEAGUE: LeagueState = {
  leagueId: 'liga-mini',
  seasonId: '2026',
  clubs: [
    { id: 'x1', name: 'X1', strength: 70 },
    { id: 'x2', name: 'X2', strength: 60 },
    { id: 'x3', name: 'X3', strength: 65 },
    { id: 'x4', name: 'X4', strength: 55 },
  ],
};

describe('simulateSeason — liga menor', () => {
  it('4 clubes → 6 rodadas, 12 partidas', () => {
    const r = simulateSeason(SMALL_LEAGUE, 'mini');
    expect(r.rounds).toHaveLength(6);
    expect(r.rounds.flatMap((x) => x.matches)).toHaveLength(12);
  });
});
