// Ciclo de vida do elenco na viragem (SPEC-009): envelhecer → aposentar ≥35 →
// repor base por POSIÇÃO (ajuste #3: repõe a posição que saiu, não sorteio puro).
// Puro e determinístico; a única fonte de aleatoriedade é o `rng` recebido.

import { POSITIONS, WORLD } from '../constants.js';
import type { Athlete } from '../types.js';
import { drawInt } from './draw.js';
import type { RngState } from './prng.js';
import { positionCounts, tierAbilityRange } from './roster.js';
import { athleteName } from '../data/names.js';

/** Envelhece todos em 1 temporada e remove quem atingiu a idade de aposentadoria. */
export function ageAndRetire(roster: readonly Athlete[]): Athlete[] {
  return roster
    .map((a) => ({ ...a, age: a.age + 1 }))
    .filter((a) => a.age < WORLD.retirementAge);
}

/**
 * Repõe a carência posicional com jovens (idade `youthAge`), restaurando a formação
 * `squadShape` — logo o elenco volta a `rosterSize` (ajuste #4). Habilidade sorteada
 * na faixa do andar ATUAL do clube.
 */
export function refillYouth(
  survivors: readonly Athlete[],
  tier: number,
  clubId: string,
  seasonId: string,
  rng: RngState,
): Athlete[] {
  const range = tierAbilityRange(tier);
  const counts = positionCounts(survivors);
  const additions: Athlete[] = [];
  let n = 0;
  for (const position of POSITIONS) {
    const deficit = WORLD.squadShape[position] - counts[position];
    for (let k = 0; k < deficit; k += 1) {
      const id = `${clubId}-y${seasonId}-${n}`;
      additions.push({
        id,
        name: athleteName(id),
        age: WORLD.youthAge,
        ability: drawInt(rng, range.min, range.max),
        position,
      });
      n += 1;
    }
  }
  return [...survivors, ...additions];
}
