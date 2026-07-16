// Blocklist MÍNIMA de nomes (SPEC-016) — termos reservados/de impersonação. Já em forma
// CANÔNICA (minúscula, sem acento, sem leet, só letras — casa `canonical` do name-filter).
// "Mínimo" = barra o óbvio; moderação exaustiva é serviço futuro. Ampliar aqui, sem tocar
// a lógica do filtro. (Palavrões curados entram nesta mesma lista, na mesma forma.)
export const NAME_BLOCKLIST: readonly string[] = [
  'admin',
  'administrador',
  'moderador',
  'sistema',
  'root',
  'suporte',
  'oficial',
  'nextgoat',
];
