// Heurística de transferência (SPEC-033, card 1.4 — Fatia 1). PURA/determinística, sob o guardrail
// (só aritmética inteira; sem `Date`/`random`/transcendentais). O humano é ALVO do mercado quando
// está FORTE PARA O SEU TIER (perto do topo da banda de habilidade da divisão) — um craque na
// várzea é assediado. `explore` (testou o mercado) baixa o threshold (mais assediável). O clube
// (NPC) opera o mercado; o humano só decide. A escolha do destino é da borda (world-store).

/** Tunáveis. `bandMaxByTier` REDECLARA `WORLD.abilityByTier[*].max` (o player é standalone, SPEC-016;
 *  o teste cruza com o engine). Índice 0 = tier 1 (topo). */
export const TRANSFER = {
  bandMaxByTier: [90, 82, 74, 66],
  /** "Forte para o tier" = overall a ≤ `margin` do topo da banda da divisão. */
  margin: 6,
  /** `explore` (testar o mercado) baixa o threshold em `exploreBonus` → mais assediável. */
  exploreBonus: 8,
  /** Valuation (insumo dos termos/narrativa): base + peso do overall − decaimento por idade. */
  valueBase: 100,
  valuePerOverall: 20,
  valueAgePeak: 27,
  valueAgeDecay: 30,
} as const;

/**
 * O humano é ALVO do mercado? Forte para o seu tier — overall perto/acima do topo da banda da
 * divisão (`tier` 1..4, 1 = topo). `explore` (o jogador testou o mercado) baixa o threshold.
 * Fora de 1..4 → nunca alvo. Puro/inteiro.
 */
export function isTransferTarget(overall: number, tier: number, explore = false): boolean {
  const idx = tier - 1;
  if (idx < 0 || idx >= TRANSFER.bandMaxByTier.length) return false;
  const bonus = explore ? TRANSFER.exploreBonus : 0;
  return overall >= TRANSFER.bandMaxByTier[idx]! - TRANSFER.margin - bonus;
}

/**
 * Valor de transferência (insumo dos termos/narrativa): sobe com o overall, cai depois do pico de
 * idade. Nunca negativo. Inteiro/guardrail. (Os termos ricos — salário/luvas — são fatia futura.)
 */
export function transferValue(overall: number, age: number): number {
  const ageGap = age > TRANSFER.valueAgePeak ? age - TRANSFER.valueAgePeak : 0;
  const raw =
    TRANSFER.valueBase + overall * TRANSFER.valuePerOverall - ageGap * TRANSFER.valueAgeDecay;
  return raw > 0 ? raw : 0;
}
