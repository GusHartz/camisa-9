// Força do clube derivada do elenco (SPEC-009). Pura, determinística, sem I/O:
// média INTEIRA das N melhores habilidades. Sem transcendentais — só sort + soma.

import { WORLD } from '../constants.js';
import type { Athlete, Position } from '../types.js';

/** Força agregada = média inteira das `strengthTopN` melhores habilidades do elenco. */
export function clubStrength(roster: readonly Athlete[]): number {
  const top = roster
    .map((a) => a.ability)
    .sort((x, y) => y - x)
    .slice(0, WORLD.strengthTopN);
  if (top.length === 0) return 0;
  const sum = top.reduce((acc, v) => acc + v, 0);
  return Math.floor(sum / top.length);
}

/** Contagem de atletas por posição — base da carência posicional na reposição (#3). */
export function positionCounts(roster: readonly Athlete[]): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const a of roster) counts[a.position] += 1;
  return counts;
}

/** Faixa de habilidade do andar (índice 0 = tier 1). Faixas sobrepostas entre tiers. */
export function tierAbilityRange(tier: number): { readonly min: number; readonly max: number } {
  const range = WORLD.abilityByTier[tier - 1];
  if (range === undefined) {
    throw new RangeError(`tierAbilityRange: tier ${tier} fora de faixa.`);
  }
  return range;
}
