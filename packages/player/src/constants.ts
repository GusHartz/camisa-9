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
  /** FOCO do dia = taxa (seam por-foco). Default NEUTRO (todos 100) — diferenciar POR foco é
   *  fatia futura; o efeito do FOCO na v2 vem do rendimento decrescente ao repetir (abaixo). */
  focusMultPct: { fisico: 100, tecnico: 100, tatico: 100, mental: 100 },
  /** Rendimento decrescente ao REPETIR o mesmo foco em dias consecutivos (SPEC-019, viés de
   *  taxa): cada repetição consecutiva corta `step` p.p. do depósito, com piso. Fresco/trocou =
   *  100% (o baseline da SPEC-017 — a curva não muda; só martelar um foco desacelera). */
  focusRepeatStepPct: 20, // −20 p.p. por repetição consecutiva
  focusRepeatFloorPct: 40, // nunca abaixo de 40% (piso: o treino sempre progride um pouco)
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

/**
 * Time do quinteto (SPEC-018, card R14). Tunáveis da identidade + do elenco de 16 vagas.
 * `squad` espelha `WORLD.squadShape` do engine (soma 16) — drift coberto por teste.
 * `code.alphabet` sem ambíguos (sem O/0/I/1/L) — código legível em mensagem.
 */
export const TEAM = {
  /** Forma do elenco por posição (soma 16). */
  squad: { GK: 2, DEF: 5, MID: 5, FWD: 4 },
  name: { minLen: 2, maxLen: 24 },
  /** Nº de opções por eixo da camisa (índices válidos: 0..n-1). */
  kit: { primaryColor: 12, secondaryColor: 12, crest: 16 },
  /** Código distribuível: comprimento + alfabeto (a geração aleatória vive no serviço). */
  code: { len: 6, alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' },
  /** Marcos celebrados. */
  firstEleven: 11,
  fullSquad: 16,
} as const;

/**
 * Projeção focos→`ability` para o mundo (SPEC-020, card 21). Quando o humano entra no mundo,
 * o world-engine só entende 1 escalar `ability` (nunca os 4 focos). `positionWeights` = o peso
 * de cada foco por posição na média ponderada. v1 é NEUTRO (todos 1) ⇒ ability = o `overall`
 * plano (média inteira); trocar um peso (ex.: GK pesa mental) é a especialização futura, sem
 * churn de callers — mesmo padrão de seam neutro de `TRAINING.focusMultPct`.
 */
export const ABILITY = {
  positionWeights: {
    GK: { fisico: 1, tecnico: 1, tatico: 1, mental: 1 },
    DEF: { fisico: 1, tecnico: 1, tatico: 1, mental: 1 },
    MID: { fisico: 1, tecnico: 1, tatico: 1, mental: 1 },
    FWD: { fisico: 1, tecnico: 1, tatico: 1, mental: 1 },
  },
} as const;

/**
 * Regen (SPEC-022). Quando a carreira encerra, o atleta renasce JOVEM (atributos frescos, overall
 * 34) mas com um BANCO DE PONTOS DE LEGADO = `legacyPct`% dos pontos ganhos na carreira anterior —
 * o gancho de FOMO ("quanto mais você viveu, mais forte seu herdeiro começa"). Tunável.
 */
export const REGEN = {
  legacyPct: 25,
} as const;
