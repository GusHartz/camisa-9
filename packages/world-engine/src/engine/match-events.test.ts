// Eventos de partida (SPEC-031) — testes puros: determinismo, taxa RARA, atleta do roster, gravidade
// ponderada, minuto no range, roster vazio. Tudo via o PRNG (determinístico).
import { describe, expect, it } from 'vitest';
import { createRng } from './prng.js';
import { MATCH_EVENTS, matchInjuries } from './match-events.js';
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
