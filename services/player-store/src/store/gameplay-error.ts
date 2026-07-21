// Erro de domínio TIPADO (SPEC-041) — molde do `OccupyError` do world-store. Carrega um `code`
// ESTÁVEL que a borda HTTP mapeia para (status, ErrorCode público); a `message` segue genérica
// (OP-11) e NUNCA vira contrato. As fns de escrita do gameplay (spend/decisão/compra) o lançam;
// a borda captura `instanceof GameplayError` e traduz o `code` — throw sem código = 500 genérico.
export class GameplayError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameplayError';
  }
}
