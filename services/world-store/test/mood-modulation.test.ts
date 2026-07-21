// Modulação da partida (SPEC-029) — testes PUROS (sem DB): o `applyMoodToWorld` sobrescreve a
// ability + recomputa a força, é no-op no mapa vazio, e a modulação REALMENTE muda a simulação (a
// força entra no resultado). Usa `seedWorld` (engine puro) — não precisa de `DATABASE_URL`.
import { describe, expect, it } from 'vitest';
import {
  clubStrength,
  seedWorld,
  simulateWorldSeason,
  type WorldState,
} from '@camisa-9/world-engine';
import { applyHumanTraits, applyMoodToWorld } from '../src/index.js';

const SEED = 'mod-spec-029';

function firstClub(world: WorldState) {
  return world.tiers[0]!.leagues[0]!.clubs[0]!;
}

function findClub(world: WorldState, clubId: string) {
  for (const t of world.tiers) {
    for (const l of t.leagues) {
      for (const c of l.clubs) if (c.id === clubId) return c;
    }
  }
  return undefined;
}

describe('applyMoodToWorld — modulação da partida (SPEC-029, puro)', () => {
  it('mapa vazio → no-op (deep-equal ao original)', () => {
    const w = seedWorld(SEED);
    expect(applyMoodToWorld(w, new Map())).toEqual(w);
  });

  it('sobrescreve a ability do atleta e RECOMPUTA a força do clube; clube irmão intocado', () => {
    const w = seedWorld(SEED);
    const club = firstClub(w);
    const target = club.roster[0]!;
    const sibling = w.tiers[0]!.leagues[0]!.clubs[1]!;
    const w2 = applyMoodToWorld(w, new Map([[target.id, 100]]));
    const club2 = findClub(w2, club.id)!;
    expect(club2.roster.find((a) => a.id === target.id)!.ability).toBe(100);
    expect(club2.strength).toBe(clubStrength(club2.roster)); // força recomputada do novo elenco
    expect(findClub(w2, sibling.id)).toEqual(sibling); // sem atleta no mapa → idêntico
  });

  it('a modulação MUDA a simulação (a força modulada entra no resultado)', () => {
    const w = seedWorld(SEED);
    const club = firstClub(w);
    const map = new Map(club.roster.map((a) => [a.id, 100] as const)); // elenco inteiro a 100
    const w2 = applyMoodToWorld(w, map);
    expect(simulateWorldSeason(w2, SEED)).not.toEqual(simulateWorldSeason(w, SEED));
  });

  it('override IGUAL à ability atual → clube inalterado (skip no-op)', () => {
    const w = seedWorld(SEED);
    const club = firstClub(w);
    const target = club.roster[0]!;
    // mapeia a MESMA ability que o atleta já tem → nada muda (nem a força)
    const w2 = applyMoodToWorld(w, new Map([[target.id, target.ability]]));
    expect(findClub(w2, club.id)).toEqual(club); // deep-equal (força não recomputada à toa)
  });
});

describe('applyHumanTraits — afinidades de papel (SPEC-046, puro)', () => {
  it('mapa vazio → no-op (deep-equal)', () => {
    const w = seedWorld(SEED);
    expect(applyHumanTraits(w, new Map())).toEqual(w);
  });

  it('injeta finishing/playmaking/durability no atleta SEM recomputar a força', () => {
    const w = seedWorld(SEED);
    const club = firstClub(w);
    const target = club.roster[0]!;
    const w2 = applyHumanTraits(
      w,
      new Map([[target.id, { finishing: 80, playmaking: 60, durability: 90 }]]),
    );
    const club2 = findClub(w2, club.id)!;
    const a = club2.roster.find((x) => x.id === target.id)!;
    expect(a.finishing).toBe(80);
    expect(a.playmaking).toBe(60);
    expect(a.durability).toBe(90);
    expect(club2.strength).toBe(club.strength); // afinidades NÃO mexem na força (só o sorteio)
    expect(club2.roster.find((x) => x.id !== target.id)!.finishing).toBeUndefined(); // NPC intocado
  });
});
