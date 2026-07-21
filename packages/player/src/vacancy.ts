// Dias até a vaga reverter a NPC (SPEC-038) — o relógio do congelamento (SPEC-023) que a faixa mostra.
//
// ⚠️ O limiar NÃO é constante daqui: `VACANCY.revertAfterDays` vive num SERVICE
// (`world-store/vacancy-policy.ts`), e `packages/player` não importa service. Por isso a borda
// INJETA `revertAfterDays`. PURA, inteira, sob o guardrail.
export function daysUntilRevert(
  frozenSinceDay: number | null,
  currentDay: number,
  revertAfterDays: number,
): number | null {
  if (frozenSinceDay === null) return null; // não congelado ⇒ "não se aplica" (não zero)
  return Math.max(0, frozenSinceDay + revertAfterDays - currentDay);
}
