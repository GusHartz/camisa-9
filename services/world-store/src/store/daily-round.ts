// Orquestrador de TICK diário (SPEC-015 — roadmap 1.2). Borda IMPURA: dado um epochMs
// INJETADO (o relógio nunca entra no engine puro — guardrail ESLint), publica a rodada
// do dia de TODAS as ligas do mundo numa transação atômica de nível-MUNDO, reusando o
// engine puro INTOCADO (readWorld + simulateWorldSeason — zero simulação nova, OP-17) e
// o publicador da Fatia 2. Protocolo de falha: adiar com transparência (deferido =
// ausência da linha) > publicar errado. Para LIMPO no fim da temporada (season_complete,
// SEM viragem — seam para a Fatia 3).
import { resolveSlot, simulateWorldSeason, type WorldSeasonResult } from '@camisa-9/world-engine';
import type { Db } from '../client.js';
import { readWorld } from './world-repo.js';
import { readSeasonAnchor } from './season-repo.js';
import { publishWorldRound, type WorldRoundInput } from './round-repo.js';

export type DailyRoundStatus =
  | 'published'
  | 'idempotent'
  | 'locked'
  | 'deferred'
  | 'season_complete'
  | 'before_season'
  | 'fora_de_janela'
  | 'sem_mundo'
  | 'sem_ancora';

export interface DailyRoundReport {
  readonly dayIndex: number;
  readonly seasonId: string | null;
  readonly targetRound: number | null;
  readonly status: DailyRoundStatus;
  readonly complete: boolean;
  readonly leagueCount: number;
}

/** Executa o tick do dia (15h Brasília). Não lê relógio: `epochMs` é injetado. */
export async function runDailyRound(
  db: Db,
  seed: string,
  epochMs: number,
): Promise<DailyRoundReport> {
  const slot = resolveSlot(epochMs);
  if (!slot.isMatchWindow) return report(slot.dayIndex, null, null, 'fora_de_janela');
  const world = await readWorld(db, seed);
  if (!world) return report(slot.dayIndex, null, null, 'sem_mundo');
  const startDayIndex = await readSeasonAnchor(db, seed, world.seasonId);
  if (startDayIndex === null) return report(slot.dayIndex, world.seasonId, null, 'sem_ancora');
  const targetRound = slot.dayIndex - startDayIndex + 1;
  return publishTarget(db, slot.dayIndex, simulateWorldSeason(world, seed), targetRound);
}

async function publishTarget(
  db: Db,
  dayIndex: number,
  results: WorldSeasonResult,
  targetRound: number,
): Promise<DailyRoundReport> {
  const seasonId = results.seasonId;
  const roundsLength = results.leagues[0]?.result.rounds.length ?? 0;
  if (targetRound < 1) return report(dayIndex, seasonId, targetRound, 'before_season');
  if (targetRound > roundsLength) return report(dayIndex, seasonId, targetRound, 'season_complete');
  const input = toWorldRoundInput(results, targetRound);
  try {
    const outcome = await publishWorldRound(db, input);
    return report(dayIndex, seasonId, targetRound, outcome.status, input.leagues.length);
  } catch {
    // OP-11: log genérico, sem SQL/DSN/stack. Deferido é derivado da ausência da linha.
    console.error(`rodada adiada (season=${seasonId}, round=${targetRound}) — publish_failed`);
    return report(dayIndex, seasonId, targetRound, 'deferred', input.leagues.length);
  }
}

function toWorldRoundInput(results: WorldSeasonResult, targetRound: number): WorldRoundInput {
  return {
    seasonId: results.seasonId,
    round: targetRound,
    leagues: results.leagues.map((l) => ({
      leagueId: l.result.leagueId,
      result: l.result.rounds[targetRound - 1]!, // guardado por [1, roundsLength]
    })),
  };
}

function report(
  dayIndex: number,
  seasonId: string | null,
  targetRound: number | null,
  status: DailyRoundStatus,
  leagueCount = 0,
): DailyRoundReport {
  const complete = status === 'published' || status === 'idempotent';
  return { dayIndex, seasonId, targetRound, status, complete, leagueCount };
}
