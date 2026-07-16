import { describe, expect, it } from 'vitest';
import { WORLD } from '../constants.js';
import type { Athlete, Position } from '../types.js';
import { clubStrength, positionCounts } from './roster.js';

function athlete(ability: number, position: Position = 'MID'): Athlete {
  return { id: `a-${ability}-${position}`, name: 'NPC', age: 25, ability, position };
}

describe('clubStrength — média inteira das N melhores', () => {
  it('usa só as strengthTopN melhores habilidades', () => {
    // 11 valores altos (90) + 9 baixos (10): média deve ser 90, ignorando os baixos.
    const high = Array.from({ length: WORLD.strengthTopN }, () => athlete(90));
    const low = Array.from({ length: WORLD.rosterSize - WORLD.strengthTopN }, () => athlete(10));
    expect(clubStrength([...low, ...high])).toBe(90);
  });

  it('é a média inteira (trunca para baixo)', () => {
    // Top-11 = [100,100,...] com uma soma que não divide exato → floor.
    const abilities = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 95]; // 11 valores
    const roster = abilities.map((v) => athlete(v));
    // soma = 1095 / 11 = 99.5 → 99
    expect(clubStrength(roster)).toBe(99);
  });

  it('independe da ordem de entrada', () => {
    const a = [athlete(80), athlete(60), athlete(70)];
    const b = [athlete(70), athlete(80), athlete(60)];
    expect(clubStrength(a)).toBe(clubStrength(b));
  });

  it('elenco vazio → 0 (guarda)', () => {
    expect(clubStrength([])).toBe(0);
  });
});

describe('positionCounts — carência posicional (base do ajuste #3)', () => {
  it('conta por posição', () => {
    const roster = [athlete(70, 'GK'), athlete(70, 'DEF'), athlete(70, 'DEF'), athlete(70, 'FWD')];
    expect(positionCounts(roster)).toEqual({ GK: 1, DEF: 2, MID: 0, FWD: 1 });
  });
});
