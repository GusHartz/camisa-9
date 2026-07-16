// Tipos do domínio do jogador humano (SPEC-016). Puro — sem I/O.

/** As 4 dimensões do atleta — os mesmos FOCOs de treino (R4 FINAL). */
export type Focus = 'fisico' | 'tecnico' | 'tatico' | 'mental';

/** Posição primária. Espelha `Position` do world-engine (drift coberto por teste). */
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

/** Um valor 0..99 por foco. */
export type Attributes = Readonly<Record<Focus, number>>;

/** Visual pixel básico: índices bounded (o cliente renderiza o sprite — lei de arte D11). */
export interface Appearance {
  readonly skinTone: number;
  readonly hairStyle: number;
  readonly hairColor: number;
}

/** Escolhas cruas do jogador na criação (valor FINAL de cada foco). */
export interface CreateAthleteInput {
  readonly name: string;
  readonly position: Position;
  readonly appearance: Appearance;
  readonly attributes: Readonly<Record<Focus, number>>;
}

/** Identidade validada — SEM id/timestamps (isso é do store, impuro). */
export interface AthleteDraft {
  readonly name: string;
  readonly position: Position;
  readonly appearance: Appearance;
  readonly attributes: Attributes;
}

/** Validação: sucesso com valor, ou falha com motivo (genérico, sem detalhe interno). */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };
