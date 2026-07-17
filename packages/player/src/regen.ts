// Legado do Regen (SPEC-022, card Regen). Quando a carreira encerra e o atleta renasce, o herdeiro
// nasce jovem (atributos frescos via `allocateAttributes`) MAS com um banco de pontos livres de
// largada proporcional aos pontos ganhos na carreira anterior — o FOMO. PURA (guardrail: só
// `Math.floor`). A métrica de origem é `pointsEarnedTotal` (soma − 136 + freePoints).
import { REGEN } from './constants.js';

/** Banco de pontos livres de largada do renascido = uma fração (floor) dos pontos da carreira
 *  anterior. Satura negativos em 0 (defensivo). */
export function regenLegacyPoints(oldPointsEarned: number): number {
  return Math.floor((Math.max(0, oldPointsEarned) * REGEN.legacyPct) / 100);
}
