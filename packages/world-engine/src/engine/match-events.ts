// Eventos da PARTIDA RICA (SPEC-031) — puros/determinísticos, sob o guardrail. Fatia 1: a LESÃO.
// A partida machuca RARAMENTE (taxa tunável): por lado, um sorteio; se sim, escolhe o atleta (do
// elenco), a gravidade (ponderada) e o minuto — tudo inteiro via `nextInt`. NÃO altera o placar (é
// narrativa; o RNG vem de um stream SEPARADO do placar, derivado no world-season). Zero I/O.
import { nextInt, type RngState } from './prng.js';
import type { Athlete, GoalEvent, InjuryEvent } from '../types.js';

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
} as const;

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

/** Sorteia UMA lesão para um lado (ou `null`). Ordem de consumo do RNG: roll → [atleta, gravidade,
 *  minuto] só se lesionou. */
function rollInjury(clubId: string, roster: readonly Athlete[], rng: RngState): InjuryEvent | null {
  if (roster.length === 0) return null;
  if (nextInt(rng, MATCH_EVENTS.injuryDenom) >= MATCH_EVENTS.injuryThreshold) return null;
  const athlete = roster[nextInt(rng, roster.length)]!;
  const severity = rollSeverity(rng);
  const minute = nextInt(rng, MATCH_EVENTS.matchMinutes) + 1;
  return { kind: 'injury', clubId, athleteId: athlete.id, severity, minute };
}

/** A gravidade ponderada (leve > media > grave). */
function rollSeverity(rng: RngState): 'leve' | 'media' | 'grave' {
  const r = nextInt(rng, 100);
  if (r < MATCH_EVENTS.gravePct) return 'grave';
  if (r < MATCH_EVENTS.gravePct + MATCH_EVENTS.mediaPct) return 'media';
  return 'leve';
}

/**
 * A timeline de GOLS de UMA partida (SPEC-043): sorteia EXATAMENTE `homeGoals` + `awayGoals` minutos
 * ∈ [1, matchMinutes], rotulados por lado (`clubId`). Amostra QUAL minuto — NUNCA QUANTOS: a contagem
 * é o placar já fixado pelo `simulateSeason`, então a timeline SOMA o placar por CONSTRUÇÃO. Colisão
 * de minuto é permitida (sorteio com reposição); a ORDEM cronológica final é resolvida no world-season
 * (fusão com as lesões). Ordem de consumo do RNG: casa (cada gol = 1 `nextInt`), depois fora.
 * Determinístico no `rng` (um stream SEPARADO do placar e das lesões — o world-season deriva `'goals'`).
 */
export function matchGoals(
  homeClubId: string,
  homeGoals: number,
  awayClubId: string,
  awayGoals: number,
  rng: RngState,
): GoalEvent[] {
  const goals: GoalEvent[] = [];
  for (let i = 0; i < homeGoals; i++) goals.push(makeGoal(homeClubId, rng));
  for (let i = 0; i < awayGoals; i++) goals.push(makeGoal(awayClubId, rng));
  return goals;
}

function makeGoal(clubId: string, rng: RngState): GoalEvent {
  return { kind: 'goal', clubId, minute: nextInt(rng, MATCH_EVENTS.matchMinutes) + 1 };
}
