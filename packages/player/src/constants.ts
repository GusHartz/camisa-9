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

/**
 * Curva de treino (SPEC-017, card 13). TODA a calibração da progressão vive aqui —
 * reequilibra sem tocar lógica. XP em unidades inteiras (`sessionXp` = 1 treino neutro);
 * multiplicadores em % (aplicados com divisão inteira → tudo determinístico, guardrail-safe).
 * As fronteiras das zonas são em `pointsEarnedTotal` (pontos já ganhos): overall 60 ⇒ p=104;
 * overall 85 ⇒ p=204; p máx = 260 (overall 99). Limiares ≈ 3 / 8 / 15+ treinos por ponto.
 */
export const TRAINING = {
  sessionXp: 100,
  /** FOCO do dia = taxa (seam). Default NEUTRO (todos 100) — diferenciar o efeito é fatia futura. */
  focusMultPct: { fisico: 100, tecnico: 100, tatico: 100, mental: 100 },
  /** Seams neutros (default 1.0 = 100%): DLC acelera; idade desacelera. Adiados. */
  speedMultiplierPct: 100,
  ageFactorPct: 100,
  /** Fronteiras (pontos já ganhos) das 3 zonas. */
  midStartPoints: 104, // overall ~60
  eliteStartPoints: 204, // overall ~85
  /** Limiar de XP por zona (p/ o próximo ponto). */
  zone1Xp: 300, // várzea: ~3 treinos/ponto
  zone2Xp: 800, // meio: ~8 treinos/ponto
  zone3BaseXp: 1500, // elite: 15 treinos/ponto no início da cauda...
  zone3RampXp: 25, // ...+0,25 treino por ponto de progresso (a cauda vira grind orgulhoso)
} as const;
