// Constantes de resolução de partida (SPEC-002). Ratificáveis pelo founder.
// Modelo transcendental-free: "chances × conversão" (soma de Bernoullis inteiros),
// tudo por +,-,*,/ e comparação — sem exp/log/pow. Alvo: vitória do favorito ~45–70%/temporada.

export const MATCH = {
  /** Chances base por time numa partida equilibrada. */
  baseChances: 4,
  /** Teto de chances. */
  maxChances: 11,
  /** Cada N pontos de vantagem de força = +1 chance. */
  strengthPerChance: 9,
  /**
   * Vantagem de mando como bônus DIRETO de conversão (em `conversionDenom`),
   * aplicado só ao mandante. Direto — e não via pontos de força — porque um bônus
   * em força seria quantizado a zero pela divisão inteira de `strengthPerChance`/
   * `strengthPerConversion` para gaps pequenos (o mando "sumia" entre times iguais).
   */
  homeConversionBonus: 6,
  /** Conversão base (em `conversionDenom`). */
  baseConversion: 34,
  /** Cada N pontos de vantagem = +1 ponto de conversão. */
  strengthPerConversion: 13,
  /** Piso e teto de conversão. */
  minConversion: 18,
  maxConversion: 60,
  /** Denominador da conversão (comparação inteira). */
  conversionDenom: 100,
} as const;
