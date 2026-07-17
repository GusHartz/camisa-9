// Idades do ciclo de carreira do humano (SPEC-022, card Regen). O humano ENTRA aos 17
// (`WORLD.youthAge`, usado direto no occupyNpcSlot) e envelhece +1/temporada (imune, SPEC-021).
// Pode regenerar POR ESCOLHA a partir de `voluntary` (25) e é FORÇADO em `forced` (42). Tunáveis.
export const REGEN_AGE = { voluntary: 25, forced: 42 } as const;
