// Eventos da PARTIDA RICA — puros/determinísticos, sob o guardrail. SPEC-031: a LESÃO. SPEC-043: a
// timeline de GOLS. SPEC-046: o ARTILHEIRO + a ASSISTÊNCIA + a ponderação por ATRIBUTO (os focos
// vivos do humano viajam nas afinidades do `Athlete`, injetadas in-memory pela costura da SPEC-029;
// o NPC cai no default posição×habilidade). NADA altera o placar (é narrativa; o RNG vem de streams
// SEPARADOS do placar, derivados no world-season). Zero I/O.
import { nextInt, type RngState } from './prng.js';
import type { Athlete, GoalEvent, InjuryEvent, Position } from '../types.js';

/** Tunáveis dos eventos de partida — a calibração vive aqui (rebalanceia sem tocar lógica). */
export const MATCH_EVENTS = {
  /** Chance de lesão POR LADO por partida = `injuryThreshold / injuryDenom` (raro). */
  injuryDenom: 100,
  injuryThreshold: 4,
  /** Distribuição de gravidade (%): grave, depois media; o resto é leve. Soma < 100. */
  gravePct: 10,
  mediaPct: 30,
  /** Minutos possíveis (o minuto ∈ [1, matchMinutes]). */
  matchMinutes: 90,
  /** SPEC-046: chance de um gol ter assistência (o resto é gol solo/pênalti). */
  assistChancePct: 70,
  /** SPEC-046: vulnerabilidade a lesão. NPC (sem `durability`) usa o default; humano = `100 − Físico`. */
  durabilityMax: 100,
  durabilityDefault: 50,
} as const;

/** SPEC-046: peso do PAPEL por posição — o teto do papel; a habilidade/afinidade escala dentro dele. */
export const SCORER_WEIGHTS: Record<Position, number> = { GK: 0, DEF: 1, MID: 3, FWD: 5 };
export const ASSIST_WEIGHTS: Record<Position, number> = { GK: 0, DEF: 2, MID: 5, FWD: 3 };

/** Pick ponderado: sorteia um índice proporcional a `weights` (um `nextInt` sobre o total). `-1` se o
 *  total ≤ 0 (SEM consumir RNG) — o chamador decide o fallback. Inteiro/determinístico. */
function weightedPick(weights: readonly number[], rng: RngState): number {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) return -1;
  let r = nextInt(rng, total);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]! > 0 ? weights[i]! : 0;
    if (r < 0) return i;
  }
  return weights.length - 1; // guarda numérica (não deve ocorrer)
}

/** Peso de finalização (artilheiro): teto do papel × skill na dimensão — humano usa `finishing`
 *  (Técnico), NPC cai na `ability`. */
function scorerWeight(a: Athlete): number {
  return SCORER_WEIGHTS[a.position] * (a.finishing ?? a.ability);
}

/** Peso de criação (assistência): teto do papel × skill — humano usa `playmaking` (Tático), NPC `ability`. */
function assistWeight(a: Athlete): number {
  return ASSIST_WEIGHTS[a.position] * (a.playmaking ?? a.ability);
}

/** Os eventos de lesão de UMA partida (0 a 2 — um sorteio por lado). Determinístico no `rng`. */
export function matchInjuries(
  homeClubId: string,
  homeRoster: readonly Athlete[],
  awayClubId: string,
  awayRoster: readonly Athlete[],
  rng: RngState,
): InjuryEvent[] {
  const events: InjuryEvent[] = [];
  const home = rollInjury(homeClubId, homeRoster, rng);
  if (home) events.push(home);
  const away = rollInjury(awayClubId, awayRoster, rng);
  if (away) events.push(away);
  return events;
}

/** Sorteia UMA lesão para um lado (ou `null`). Ordem de consumo do RNG: roll → [vítima, gravidade,
 *  minuto] só se lesionou. */
function rollInjury(clubId: string, roster: readonly Athlete[], rng: RngState): InjuryEvent | null {
  if (roster.length === 0) return null;
  if (nextInt(rng, MATCH_EVENTS.injuryDenom) >= MATCH_EVENTS.injuryThreshold) return null;
  const athlete = roster[pickVictim(roster, rng)]!;
  const severity = rollSeverity(rng);
  const minute = nextInt(rng, MATCH_EVENTS.matchMinutes) + 1;
  return { kind: 'injury', clubId, athleteId: athlete.id, severity, minute };
}

/** A vítima da lesão (SPEC-046). Elenco SEM `durability` (all-NPC) → índice UNIFORME, byte-idêntico
 *  à SPEC-031 (mesmo consumo de RNG). Com `durability` (há humano) → ponderado por vulnerabilidade
 *  (`durabilityMax − durability`; NPC usa o default) → Físico alto = menos lesão. */
function pickVictim(roster: readonly Athlete[], rng: RngState): number {
  if (!roster.some((a) => a.durability !== undefined)) return nextInt(rng, roster.length);
  const weights = roster.map(
    (a) => MATCH_EVENTS.durabilityMax - (a.durability ?? MATCH_EVENTS.durabilityDefault),
  );
  const idx = weightedPick(weights, rng);
  return idx >= 0 ? idx : nextInt(rng, roster.length);
}

/** A gravidade ponderada (leve > media > grave). */
function rollSeverity(rng: RngState): 'leve' | 'media' | 'grave' {
  const r = nextInt(rng, 100);
  if (r < MATCH_EVENTS.gravePct) return 'grave';
  if (r < MATCH_EVENTS.gravePct + MATCH_EVENTS.mediaPct) return 'media';
  return 'leve';
}

/**
 * A timeline de GOLS de UMA partida (SPEC-043 + SPEC-046). Sorteia EXATAMENTE `homeGoals` + `awayGoals`
 * minutos ∈ [1, matchMinutes] (a contagem é o placar já fixado → a timeline SOMA o placar por
 * CONSTRUÇÃO), e para cada gol o ARTILHEIRO (ponderado por `finishing`) e a ASSISTÊNCIA (~`assistChancePct`,
 * do mesmo elenco ≠ o artilheiro, ponderada por `playmaking`). Ordem de consumo do RNG (stream `'goals'`,
 * SEPARADO do placar e das lesões): **minutos PRIMEIRO** (casa, depois fora — idêntico à SPEC-043),
 * depois os artilheiros, depois as assistências. Determinístico no `rng`.
 */
export function matchGoals(
  homeClubId: string,
  homeGoals: number,
  homeRoster: readonly Athlete[],
  awayClubId: string,
  awayGoals: number,
  awayRoster: readonly Athlete[],
  rng: RngState,
): GoalEvent[] {
  // Fase 1 — minutos (idêntico à SPEC-043: casa, depois fora).
  const drafts: { clubId: string; minute: number; roster: readonly Athlete[] }[] = [];
  for (let i = 0; i < homeGoals; i++)
    drafts.push({ clubId: homeClubId, minute: minuteOf(rng), roster: homeRoster });
  for (let i = 0; i < awayGoals; i++)
    drafts.push({ clubId: awayClubId, minute: minuteOf(rng), roster: awayRoster });
  // Fase 2 — artilheiros (ponderado por finishing).
  const scorers = drafts.map((d) => pickScorer(d.roster, rng));
  // Fase 3 — assistências (roll de chance + ponderado por playmaking, ≠ o artilheiro).
  const assists = drafts.map((d, i) => pickAssist(d.roster, scorers[i], rng));
  return drafts.map((d, i) => makeGoal(d.clubId, d.minute, scorers[i], assists[i]));
}

function minuteOf(rng: RngState): number {
  return nextInt(rng, MATCH_EVENTS.matchMinutes) + 1;
}

/** O artilheiro: ponderado por `scorerWeight`; elenco vazio → `undefined`; pesos zerados → uniforme. */
function pickScorer(roster: readonly Athlete[], rng: RngState): string | undefined {
  if (roster.length === 0) return undefined;
  const idx = weightedPick(
    roster.map((a) => scorerWeight(a)),
    rng,
  );
  const chosen = idx >= 0 ? roster[idx]! : roster[nextInt(rng, roster.length)]!;
  return chosen.id;
}

/** A assistência: rola a chance (1 draw); se sim, pondera por `assistWeight` EXCLUINDO o artilheiro.
 *  Sem elenco / sem elegível → `undefined`. */
function pickAssist(
  roster: readonly Athlete[],
  scorerId: string | undefined,
  rng: RngState,
): string | undefined {
  if (roster.length === 0) return undefined;
  if (nextInt(rng, 100) >= MATCH_EVENTS.assistChancePct) return undefined; // gol solo/pênalti
  const idx = weightedPick(
    roster.map((a) => (a.id === scorerId ? 0 : assistWeight(a))),
    rng,
  );
  return idx >= 0 ? roster[idx]!.id : undefined;
}

/** exactOptionalPropertyTypes: só inclui `athleteId`/`assistId` quando definidos. */
function makeGoal(
  clubId: string,
  minute: number,
  scorerId: string | undefined,
  assistId: string | undefined,
): GoalEvent {
  return {
    kind: 'goal',
    clubId,
    minute,
    ...(scorerId !== undefined ? { athleteId: scorerId } : {}),
    ...(assistId !== undefined ? { assistId } : {}),
  };
}
