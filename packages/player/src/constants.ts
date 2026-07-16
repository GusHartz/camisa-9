// Tunáveis do domínio do jogador (SPEC-016). Isolados aqui: o card 13 (treino/curva de
// evolução) ajusta a progressão sem tocar a criação. Puro/determinístico.
import type { Focus, Position } from './types.js';

/** Ordem canônica dos 4 focos. */
export const FOCI: readonly Focus[] = ['fisico', 'tecnico', 'tatico', 'mental'];

/** Posições — espelha o world-engine (teste cruza p/ pegar drift). */
export const POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD'];

export const PLAYER = {
  /** Régua absoluta do atributo. O teto 99 é a lenda; a criação nasce muito abaixo. */
  attrMin: 0,
  attrMax: 99,
  /** Criação: nasce na várzea. Pool FIXO → todo atleta começa com overall = 34. */
  creation: { floor: 20, pool: 56, cap: 50 },
  name: { minLen: 2, maxLen: 20 },
  password: { minLen: 10 },
  /** Nº de opções por eixo de visual (índices válidos: 0..n-1). */
  appearance: { skinTone: 6, hairStyle: 6, hairColor: 6 },
} as const;

/** Soma fixa dos atributos na criação = piso*4 + pool (= 136 → overall uniforme 34). */
export const CREATION_TOTAL = FOCI.length * PLAYER.creation.floor + PLAYER.creation.pool;
