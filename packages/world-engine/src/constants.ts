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

// ─────────────────────────────────────────────────────────────────────────────
// Mundo — pirâmide + elenco NPC (SPEC-009). Tunáveis ratificados pelo founder.
// ─────────────────────────────────────────────────────────────────────────────

/** Arquétipos de clube (índice = ordem de sorteio; ver `Archetype`). */
export const ARCHETYPES = ['formador', 'equilibrado', 'comprador', 'gastador'] as const;

/** Posições, na ORDEM em que o elenco é montado (determinismo do stream). */
export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const;

export const WORLD = {
  /** Andares da pirâmide (1 = topo). */
  tiers: 4,
  /** Ligas por andar. v1 = 1 (linear); a Pirâmide Elástica (R13) sobe isto. */
  leaguesPerTier: 1,
  /** Clubes por liga. */
  clubsPerLeague: 20,
  /** Atletas por clube — invariante testado após qualquer viragem (ajuste #4). */
  rosterSize: 20,
  /** Força = média inteira das N melhores habilidades do elenco. */
  strengthTopN: 11,
  /** Aposenta na viragem com idade ≥ este valor. Futuro: janela seed 33..38. */
  retirementAge: 35,
  /** Idade dos jovens repostos na viragem. */
  youthAge: 17,
  /** Faixa de idade sorteada na SEED do mundo (inclusive). */
  seedAgeMin: 18,
  seedAgeMax: 34,
  /**
   * Sobe/desce POR FRONTEIRA (ajuste aprovado): índice i = fronteira entre o
   * andar i+1 e o i+2. `tiers - 1` entradas. Conservação de fluxo por fronteira.
   */
  promoteRelegate: [3, 3, 3],
  /** Transferências por liga na viragem (placeholder — mercado real = 1.4). */
  transfersPerLeague: 12,
  /** Tamanho do vetor de pesos do arquétipo (seed-sorteado; fundação da 1.4). */
  weightCount: 4,
  /** Faixa (exclusiva) de cada peso do arquétipo: `nextInt` em [0, weightMax). */
  weightMax: 100,
  /**
   * Faixas de habilidade por andar, SOBREPOSTAS entre tiers adjacentes (ajuste
   * aprovado): um bom clube de baixo pode superar um fraco de cima. Índice 0 = tier 1.
   */
  abilityByTier: [
    { min: 58, max: 90 }, // tier 1 (topo)
    { min: 50, max: 82 }, // tier 2 (sobrepõe 58..82 com o tier 1)
    { min: 42, max: 74 }, // tier 3
    { min: 34, max: 66 }, // tier 4 (várzea)
  ],
  /** Formação do elenco por posição. Soma = `rosterSize` (3+6+7+4 = 20). */
  squadShape: { GK: 3, DEF: 6, MID: 7, FWD: 4 },
} as const;
