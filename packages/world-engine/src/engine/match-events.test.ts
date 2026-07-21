// Eventos de partida (SPEC-031) — testes puros: determinismo, taxa RARA, atleta do roster, gravidade
// ponderada, minuto no range, roster vazio. Tudo via o PRNG (determinístico).
import { describe, expect, it } from 'vitest';
import { createRng } from './prng.js';
import { MATCH_EVENTS, matchGoals, matchInjuries } from './match-events.js';
import type { Athlete } from '../types.js';

function roster(clubId: string, n: number): Athlete[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${clubId}-a${i}`,
    name: `A${i}`,
    age: 25,
    ability: 50,
    position: 'MID' as const,
  }));
}

describe('match-events — a lesão de partida (SPEC-031, puro)', () => {
  const home = roster('H', 16);
  const away = roster('A', 16);

  it('determinístico: mesmo seed → mesmos eventos', () => {
    const a = matchInjuries('H', home, 'A', away, createRng('s1'));
    const b = matchInjuries('H', home, 'A', away, createRng('s1'));
    expect(a).toEqual(b);
  });

  it('RARO: a taxa de lesão por lado fica perto de injuryThreshold/injuryDenom', () => {
    let sides = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      sides += matchInjuries('H', home, 'A', away, createRng(`seed-${i}`)).length;
    }
    const rate = sides / (N * 2); // 2 lados por partida
    expect(rate).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.1); // ~4% (injuryThreshold/injuryDenom), tolerância larga
  });

  it('quando lesiona: atleta do roster certo, gravidade válida, minuto ∈ [1, matchMinutes]', () => {
    let ev = matchInjuries('H', home, 'A', away, createRng('inj-0'))[0];
    for (let i = 1; i < 500 && !ev; i++) {
      ev = matchInjuries('H', home, 'A', away, createRng(`inj-${i}`))[0];
    }
    expect(ev).toBeDefined();
    expect(ev!.kind).toBe('injury');
    const ids = (ev!.clubId === 'H' ? home : away).map((a) => a.id);
    expect(ids).toContain(ev!.athleteId);
    expect(['leve', 'media', 'grave']).toContain(ev!.severity);
    expect(ev!.minute).toBeGreaterThanOrEqual(1);
    expect(ev!.minute).toBeLessThanOrEqual(MATCH_EVENTS.matchMinutes);
  });

  it('gravidade ponderada: leve > media > grave', () => {
    const counts = { leve: 0, media: 0, grave: 0 };
    for (let i = 0; i < 5000; i++) {
      for (const e of matchInjuries('H', home, 'X', [], createRng(`g-${i}`))) counts[e.severity]++;
    }
    expect(counts.leve).toBeGreaterThan(counts.media);
    expect(counts.media).toBeGreaterThan(counts.grave);
  });

  it('roster vazio → sem lesão (sem crash)', () => {
    expect(matchInjuries('H', [], 'A', [], createRng('s'))).toEqual([]);
  });
});

describe('match-events — a timeline de gols (SPEC-043, puro)', () => {
  it('SOMA EXATA: produz exatamente homeGoals + awayGoals, rotulados por lado', () => {
    const g = matchGoals('H', 3, [], 'A', 1, [], createRng('m1'));
    expect(g).toHaveLength(4);
    expect(g.filter((e) => e.clubId === 'H')).toHaveLength(3);
    expect(g.filter((e) => e.clubId === 'A')).toHaveLength(1);
    expect(g.every((e) => e.kind === 'goal')).toBe(true);
  });

  it('minutos ∈ [1, matchMinutes]', () => {
    for (const e of matchGoals('H', 6, [], 'A', 5, [], createRng('m2'))) {
      expect(e.minute).toBeGreaterThanOrEqual(1);
      expect(e.minute).toBeLessThanOrEqual(MATCH_EVENTS.matchMinutes);
    }
  });

  it('0-0 → timeline vazia', () => {
    expect(matchGoals('H', 0, [], 'A', 0, [], createRng('m3'))).toEqual([]);
  });

  it('determinístico: mesmo seed → mesma timeline', () => {
    const a = matchGoals('H', 4, [], 'A', 2, [], createRng('m4'));
    const b = matchGoals('H', 4, [], 'A', 2, [], createRng('m4'));
    expect(a).toEqual(b);
  });

  it('colisão de minuto PERMITIDA: um placar alto (11+11) não quebra (sorteio com reposição)', () => {
    const g = matchGoals('H', 11, [], 'A', 11, [], createRng('m5'));
    expect(g).toHaveLength(22); // exatamente o placar, mesmo com minutos repetidos
  });
});

describe('match-events — artilheiro + assistência + ponderação (SPEC-046, puro)', () => {
  const H = roster('H', 16);
  const A = roster('A', 16);
  const fwd = (id: string, finishing?: number): Athlete => ({
    id,
    name: id,
    age: 25,
    ability: 50,
    position: 'FWD',
    ...(finishing !== undefined ? { finishing } : {}),
  });

  it('todo gol nomeia um artilheiro do elenco do lado certo', () => {
    const g = matchGoals('H', 5, H, 'A', 4, A, createRng('s046-1'));
    const hIds = new Set(H.map((a) => a.id));
    const aIds = new Set(A.map((a) => a.id));
    for (const e of g) {
      expect(e.athleteId).toBeDefined();
      expect((e.clubId === 'H' ? hIds : aIds).has(e.athleteId!)).toBe(true);
    }
  });

  it('a assistência (quando presente) é do mesmo elenco e ≠ o artilheiro (~70% dos gols)', () => {
    let withAssist = 0;
    let total = 0;
    for (let i = 0; i < 300; i++) {
      for (const e of matchGoals('H', 3, H, 'A', 2, A, createRng(`s046-2-${i}`))) {
        total++;
        const ids = new Set((e.clubId === 'H' ? H : A).map((a) => a.id));
        if (e.assistId !== undefined) {
          withAssist++;
          expect(ids.has(e.assistId)).toBe(true);
          expect(e.assistId).not.toBe(e.athleteId);
        }
      }
    }
    const pct = (withAssist / total) * 100;
    expect(pct).toBeGreaterThan(55); // ~assistChancePct=70, folga ampla
    expect(pct).toBeLessThan(85);
  });

  it('PONDERAÇÃO por finishing: um craque (finishing 99) marca muito mais que os medianos', () => {
    const rest = Array.from({ length: 15 }, (_, i) => fwd(`H-r${i}`, 10));
    const club = [fwd('H-star', 99), ...rest];
    let star = 0;
    let others = 0;
    for (let i = 0; i < 500; i++) {
      for (const e of matchGoals('H', 2, club, 'A', 0, [], createRng(`s046-3-${i}`))) {
        if (e.athleteId === 'H-star') star++;
        else others++;
      }
    }
    expect(star).toBeGreaterThan((others / rest.length) * 4); // muito acima de um mediano
  });

  it('PONDERAÇÃO por posição: FWD marca mais que DEF (mesma habilidade, sem override)', () => {
    const club: Athlete[] = [
      { id: 'H-fwd', name: 'F', age: 25, ability: 50, position: 'FWD' },
      { id: 'H-def', name: 'D', age: 25, ability: 50, position: 'DEF' },
    ];
    let f = 0;
    let d = 0;
    for (let i = 0; i < 500; i++) {
      for (const e of matchGoals('H', 1, club, 'A', 0, [], createRng(`s046-4-${i}`))) {
        if (e.athleteId === 'H-fwd') f++;
        else d++;
      }
    }
    expect(f).toBeGreaterThan(d);
  });

  it('elenco vazio → gol sem artilheiro (athleteId ausente, sem crash)', () => {
    const g = matchGoals('H', 2, [], 'A', 0, [], createRng('s046-5'));
    expect(g).toHaveLength(2);
    for (const e of g) expect(e.athleteId).toBeUndefined();
  });

  it('PONDERAÇÃO de assistência por playmaking: um garçom (playmaking 99) assiste muito mais', () => {
    const garcom: Athlete = {
      id: 'H-garcom',
      name: 'G',
      age: 25,
      ability: 50,
      position: 'MID',
      playmaking: 99,
    };
    const rest = Array.from({ length: 15 }, (_, i) => ({
      id: `H-p${i}`,
      name: `P${i}`,
      age: 25,
      ability: 50,
      position: 'MID' as const,
      playmaking: 10,
    }));
    const club = [garcom, ...rest];
    let garcomA = 0;
    let othersA = 0;
    for (let i = 0; i < 500; i++) {
      for (const e of matchGoals('H', 3, club, 'A', 0, [], createRng(`s046-7-${i}`))) {
        if (e.assistId === 'H-garcom') garcomA++;
        else if (e.assistId !== undefined) othersA++;
      }
    }
    expect(garcomA).toBeGreaterThan((othersA / rest.length) * 4); // muito acima de um mediano
  });

  it('ASSIST_WEIGHTS: MID assiste mais que FWD (o não-artilheiro assiste; MID marca menos)', () => {
    // 2 jogadores: o FWD marca mais (finishing) → o MID assiste mais (é o não-artilheiro mais vezes).
    const club: Athlete[] = [
      { id: 'H-mid', name: 'M', age: 25, ability: 50, position: 'MID' },
      { id: 'H-fwd', name: 'F', age: 25, ability: 50, position: 'FWD' },
    ];
    let mid = 0;
    let fwd = 0;
    for (let i = 0; i < 800; i++) {
      for (const e of matchGoals('H', 1, club, 'A', 0, [], createRng(`s046-8-${i}`))) {
        if (e.assistId === 'H-mid') mid++;
        else if (e.assistId === 'H-fwd') fwd++;
      }
    }
    expect(mid).toBeGreaterThan(fwd);
  });

  it('lesão em roster MISTO (1 humano durável + NPCs sem durability): vítima MENOS que uniforme', () => {
    const tough: Athlete = {
      id: 'H-tough',
      name: 'T',
      age: 25,
      ability: 50,
      position: 'MID',
      durability: 99,
    };
    const npcs = Array.from({ length: 15 }, (_, i) => ({
      id: `H-npc${i}`,
      name: `N${i}`,
      age: 25,
      ability: 50,
      position: 'MID' as const,
    }));
    const club = [tough, ...npcs]; // misto: só o humano tem durability (a forma de produção)
    let toughHurt = 0;
    let total = 0;
    for (let i = 0; i < 8000; i++) {
      for (const e of matchInjuries('H', club, 'A', [], createRng(`s046-9-${i}`))) {
        total++;
        if (e.athleteId === 'H-tough') toughHurt++;
      }
    }
    expect(toughHurt / total).toBeLessThan(1 / club.length); // vulnerabilidade 1 vs NPCs (default 50)
  });

  it('menos lesão com Físico alto: durability 99 é vítima MUITO menos que durability 1', () => {
    const tough: Athlete = {
      id: 'H-tough',
      name: 'T',
      age: 25,
      ability: 50,
      position: 'MID',
      durability: 99,
    };
    const frail: Athlete = {
      id: 'H-frail',
      name: 'F',
      age: 25,
      ability: 50,
      position: 'MID',
      durability: 1,
    };
    const club = [tough, frail];
    let toughHurt = 0;
    let frailHurt = 0;
    for (let i = 0; i < 4000; i++) {
      for (const e of matchInjuries('H', club, 'A', [], createRng(`s046-6-${i}`))) {
        if (e.athleteId === 'H-tough') toughHurt++;
        else frailHurt++;
      }
    }
    expect(frailHurt).toBeGreaterThan(toughHurt * 3); // vulnerabilidade 99 vs 1
  });
});
