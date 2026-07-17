// Política de retenção/escassez do congelamento de vaga (SPEC-023). Molde do `regen-age.ts`:
// tunável isolado, sem lógica. Congelar é IMEDIATO (o 1º dia inativo — decisão do founder: janela
// única, sem carência); reverter a NPC aos `revertAfterDays` dias de inatividade contínua.
export const VACANCY = {
  revertAfterDays: 30,
} as const;
