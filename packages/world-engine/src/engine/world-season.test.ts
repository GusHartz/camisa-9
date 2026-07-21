import { describe, expect, it } from 'vitest';
import { WORLD } from '../constants.js';
import type { Athlete, GoalEvent, InjuryEvent } from '../types.js';
import { seedWorld } from '../data/world-seed.js';
import { matchInjuries, MATCH_EVENTS } from './match-events.js';
import { createRng, deriveSeed } from './prng.js';
import { simulateSeason } from './season.js';
import { simulateWorldSeason } from './world-season.js';

const CLUBS = WORLD.clubsPerLeague;
const ROUNDS = 2 * (CLUBS - 1); // turno-returno
const MATCHES = ROUNDS * (CLUBS / 2);

describe('simulateWorldSeason — roda o mundo inteiro', () => {
  const world = seedWorld('temporada');
  const season = simulateWorldSeason(world, 'seed-jogo');

  it('produz uma temporada por liga de cada andar', () => {
    expect(season.leagues).toHaveLength(WORLD.tiers * WORLD.leaguesPerTier);
    expect(season.leagues.map((l) => l.tier).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('cada liga: turno-returno completo e tabela cheia', () => {
    for (const { result } of season.leagues) {
      expect(result.rounds).toHaveLength(ROUNDS);
      expect(result.rounds.flatMap((r) => r.matches)).toHaveLength(MATCHES);
      expect(result.table).toHaveLength(CLUBS);
      expect(result.table.reduce((s, row) => s + row.played, 0)).toBe(MATCHES * 2);
    }
  });

  it('preserva o seasonId do mundo', () => {
    expect(season.seasonId).toBe(world.seasonId);
  });
});

describe('simulateWorldSeason — determinismo', () => {
  it('mesmo mundo + mesma seed → resultado idêntico', () => {
    const world = seedWorld('det');
    expect(simulateWorldSeason(world, 'x')).toEqual(simulateWorldSeason(world, 'x'));
  });

  it('seeds de jogo diferentes → temporadas diferentes', () => {
    const world = seedWorld('det');
    expect(simulateWorldSeason(world, 'x')).not.toEqual(simulateWorldSeason(world, 'y'));
  });

  it('ligas distintas (leagueId por andar) geram tabelas distintas sob a mesma seed', () => {
    const season = simulateWorldSeason(seedWorld('cross'), 'mesma-seed');
    const tables = season.leagues.map((l) => JSON.stringify(l.result.rounds));
    expect(new Set(tables).size).toBe(tables.length);
  });
});

describe('simulateWorldSeason — eventos de partida rica (lesões SPEC-031 + gols SPEC-043)', () => {
  const world = seedWorld('eventos');
  const SEED = 'seed-eventos';
  const season = simulateWorldSeason(world, SEED);
  const allMatches = season.leagues.flatMap((l) => l.result.rounds).flatMap((r) => r.matches);
  const allEvents = allMatches.flatMap((m) => m.events ?? []);
  const injuries = allEvents.filter((e): e is InjuryEvent => e.kind === 'injury');
  const goals = allEvents.filter((e): e is GoalEvent => e.kind === 'goal');

  const rosterOf = new Map<string, readonly Athlete[]>();
  for (const tier of world.tiers)
    for (const lg of tier.leagues) for (const c of lg.clubs) rosterOf.set(c.id, c.roster);

  it('emite eventos de LESÃO ao longo da temporada (raros, mas ocorrem)', () => {
    expect(injuries.length).toBeGreaterThan(0);
  });

  it('cada lesão nomeia um atleta do ELENCO do clube certo', () => {
    for (const e of injuries) {
      const ids = new Set((rosterOf.get(e.clubId) ?? []).map((a) => a.id));
      expect(ids.has(e.athleteId)).toBe(true);
    }
  });

  it('GOLS (SPEC-043): a timeline SOMA o placar exato por partida; minutos ∈ [1,90]', () => {
    expect(goals.length).toBeGreaterThan(0); // uma temporada inteira tem muitos gols
    for (const m of allMatches) {
      const g = (m.events ?? []).filter((e) => e.kind === 'goal');
      expect(g.filter((e) => e.clubId === m.homeId).length).toBe(m.homeGoals);
      expect(g.filter((e) => e.clubId === m.awayId).length).toBe(m.awayGoals);
      for (const e of g) {
        expect(e.minute).toBeGreaterThanOrEqual(1);
        expect(e.minute).toBeLessThanOrEqual(MATCH_EVENTS.matchMinutes);
      }
    }
  });

  it('ARTILHEIRO + ASSISTÊNCIA (SPEC-046): do elenco do lado certo; assistência ≠ o artilheiro', () => {
    for (const e of goals) {
      const ids = new Set((rosterOf.get(e.clubId) ?? []).map((a) => a.id));
      expect(e.athleteId).toBeDefined();
      expect(ids.has(e.athleteId!)).toBe(true);
      if (e.assistId !== undefined) {
        expect(ids.has(e.assistId)).toBe(true);
        expect(e.assistId).not.toBe(e.athleteId);
      }
    }
  });

  it('0-0 sem lesão → SEM chave `events` (ausência limpa)', () => {
    const clean = allMatches.find(
      (m) =>
        m.homeGoals === 0 &&
        m.awayGoals === 0 &&
        !(m.events ?? []).some((e) => e.kind === 'injury'),
    );
    if (clean) expect(clean.events).toBeUndefined(); // um 0-0 sem lesão não carrega events
  });

  it('a timeline é CRONOLÓGICA (minuto asc; desempate determinístico casa antes de fora)', () => {
    for (const m of allMatches) {
      const ev = m.events ?? [];
      for (let i = 1; i < ev.length; i++) {
        const prev = ev[i - 1]!;
        const cur = ev[i]!;
        expect(cur.minute).toBeGreaterThanOrEqual(prev.minute);
        if (cur.minute === prev.minute) {
          const sidePrev = prev.clubId === m.homeId ? 0 : 1;
          const sideCur = cur.clubId === m.homeId ? 0 : 1;
          expect(sideCur).toBeGreaterThanOrEqual(sidePrev);
        }
      }
    }
  });

  it('estabilidade das lesões: o stream `goals` é DISJUNTO do `events` — as lesões NÃO mudam', () => {
    const key = (e: InjuryEvent) => `${e.clubId}|${e.athleteId}|${e.severity}|${e.minute}`;
    for (const lg of season.leagues) {
      for (const round of lg.result.rounds) {
        for (const m of round.matches) {
          const ref = matchInjuries(
            m.homeId,
            rosterOf.get(m.homeId) ?? [],
            m.awayId,
            rosterOf.get(m.awayId) ?? [],
            createRng(
              deriveSeed(
                SEED,
                lg.result.leagueId,
                world.seasonId,
                m.round,
                m.homeId,
                m.awayId,
                'events',
              ),
            ),
          );
          const got = (m.events ?? []).filter((e): e is InjuryEvent => e.kind === 'injury');
          expect(got.map(key).sort()).toEqual(ref.map(key).sort());
        }
      }
    }
  });

  it('determinístico COM eventos: mesma seed → temporada idêntica (eventos inclusos)', () => {
    expect(simulateWorldSeason(world, 'seed-eventos')).toEqual(season);
  });

  it('SCORE-NEUTRAL: os eventos NÃO alteram placar/tabela (o stream de eventos é separado)', () => {
    // Para cada liga: a temporada enriquecida, SEM os events, tem placar/tabela IDÊNTICOS ao
    // `simulateSeason` puro (que nunca vê elencos/eventos). Prova a tese central da SPEC-031.
    for (const tier of world.tiers) {
      for (const lg of tier.leagues) {
        const projected = {
          leagueId: lg.leagueId,
          seasonId: world.seasonId,
          clubs: lg.clubs.map((c) => ({ id: c.id, name: c.name, strength: c.strength })),
        };
        const pure = simulateSeason(projected, 'seed-eventos'); // SEM eventos (força-só)
        const enriched = season.leagues.find((l) => l.result.leagueId === lg.leagueId)!.result;
        const stripped = {
          ...enriched,
          rounds: enriched.rounds.map((r) => ({
            round: r.round,
            matches: r.matches.map((m) => ({
              round: m.round,
              homeId: m.homeId,
              awayId: m.awayId,
              homeGoals: m.homeGoals,
              awayGoals: m.awayGoals,
            })),
          })),
        };
        expect(stripped).toEqual(pure); // placar E tabela byte-idênticos ao puro
      }
    }
  });
});
