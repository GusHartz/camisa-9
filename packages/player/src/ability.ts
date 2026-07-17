// Projeção focos→`ability` (SPEC-020, card 21). O humano fala em 4 focos; o world-engine
// entende 1 escalar `ability`. Esta é a tradução 4→1 — PURA (guardrail: só `Math.floor`).
// Os 4 focos crus seguem preservados no player-store (o futuro engine de lances os lê).
import { ABILITY, FOCI } from './constants.js';
import type { Attributes, Position } from './types.js';

/**
 * O overall do atleta: média INTEIRA (floor) dos 4 focos. Recém-criado (soma 136) → 34.
 * É a MESMA fórmula que o store reporta como `overall` (fonte-da-verdade única da lib pura).
 */
export function overall(attributes: Attributes): number {
  const total = FOCI.reduce((sum, f) => sum + attributes[f], 0);
  return Math.floor(total / FOCI.length);
}

/**
 * Projeta os 4 focos no `ability` escalar (0..99) que o mundo entende. v1 = média ponderada
 * com pesos NEUTROS por posição (`ABILITY.positionWeights`, todos 1) ⇒ idêntica ao `overall`
 * plano. Os pesos são o gancho de especialização futura, sem churn de callers.
 */
export function abilityFromFocos(attributes: Attributes, position: Position): number {
  const weights = ABILITY.positionWeights[position];
  const weighted = FOCI.reduce((sum, f) => sum + attributes[f] * weights[f], 0);
  const totalWeight = FOCI.reduce((sum, f) => sum + weights[f], 0);
  return Math.floor(weighted / totalWeight);
}
