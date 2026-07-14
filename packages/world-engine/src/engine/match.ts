// Resolução de placar SEM transcendentais (SPEC-002).
// Modelo "chances × conversão": cada time gera N chances (derivadas da força);
// cada chance converte por comparação inteira contra um limiar. Soma de Bernoullis
// → distribuição de gols crível, 100% determinística (só +,-,*,/ e comparação).

import { MATCH } from '../constants.js';
import { nextInt, type RngState } from './prng.js';

export interface Score {
  readonly homeGoals: number;
  readonly awayGoals: number;
}

export function resolveMatch(homeStrength: number, awayStrength: number, rng: RngState): Score {
  const homeGoals = scoreSide(homeStrength, awayStrength, MATCH.homeConversionBonus, rng);
  const awayGoals = scoreSide(awayStrength, homeStrength, 0, rng);
  return { homeGoals, awayGoals };
}

/**
 * Gols de um lado: nº de chances (pela força) × conversão por chance.
 * `homeBonus` é um bônus de conversão direto (em `conversionDenom`), só do mandante.
 */
function scoreSide(attack: number, defense: number, homeBonus: number, rng: RngState): number {
  const edge = attack - defense;
  const chances = clampInt(
    MATCH.baseChances + Math.floor(edge / MATCH.strengthPerChance),
    0,
    MATCH.maxChances,
  );
  const convertBelow = clampInt(
    MATCH.baseConversion + Math.floor(edge / MATCH.strengthPerConversion) + homeBonus,
    MATCH.minConversion,
    MATCH.maxConversion,
  );
  let goals = 0;
  for (let i = 0; i < chances; i++) {
    if (nextInt(rng, MATCH.conversionDenom) < convertBelow) {
      goals++;
    }
  }
  return goals;
}

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
