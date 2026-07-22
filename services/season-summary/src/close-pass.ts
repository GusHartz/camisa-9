// Fecho de temporada (SPEC-053) — carimba na campanha de cada humano o desfecho do clube:
// campeão · subiu · permaneceu · rebaixado. Costura cross-schema (mundo → jogador), molde do
// `runRegenPass`: isolamento por linha, erros genéricos (OP-11), nenhuma escrita no mundo.
//
// ⚠️ RODA EM TODO DIA LIQUIDADO, não só na janela de gênese. A janela dura UM dia (a viragem semeia
// a âncora nova como `dia+1`), e este passe é best-effort por linha — se um erro fosse engolido lá
// dentro, aquela temporada NUNCA fecharia e o card não existiria, para sempre. Rodar todo dia é
// idempotente (`closed_at IS NULL`) e no-op barato quando não há o que fechar.
//
// ⚠️ É DIRIGIDO PELA LINHA, nunca pelo `seasonId` do tick: em `season_rolled` esse id é o da
// temporada que ACABOU e no reprocesso `before_season` é o da NOVA — significam coisas opostas.
// Cada campanha aberta pergunta pelo turnover DA PRÓPRIA temporada dela, por PK.
import { computeStandings } from '@camisa-9/world-engine';
import {
  closeSeason,
  readOpenSeasonsBefore,
  type Db as PlayerDb,
  type OpenSeason,
  type SeasonOutcome,
} from '@camisa-9/player-store';
import {
  readSeasonMatches,
  readTurnoverReport,
  readWorld,
  type Db as WorldDb,
} from '@camisa-9/world-store';

export interface SeasonCloseReport {
  readonly closed: number;
  readonly pending: number;
}

/** Fecha as campanhas cuja temporada já virou. Retorna quantas fecharam e quantas seguem abertas
 *  (as que ainda esperam a viragem — não é erro). */
export async function runSeasonClosePass(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
): Promise<SeasonCloseReport> {
  const world = await readWorld(worldDb, seed);
  if (!world) return { closed: 0, pending: 0 };
  const open = await readOpenSeasonsBefore(playerDb, world.seasonId);
  let closed = 0;
  let pending = 0;
  for (const row of open) {
    const done = await tryCloseOne(worldDb, playerDb, seed, row);
    if (done) closed++;
    else pending++;
  }
  return { closed, pending };
}

/** Uma campanha, ISOLADA: um erro numa linha não pode impedir o fecho das outras (molde do
 *  `runRegenPass`). O retry acontece no dia seguinte — o passe roda todo dia. */
async function tryCloseOne(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  row: OpenSeason,
): Promise<boolean> {
  try {
    const report = await readTurnoverReport(worldDb, seed, row.seasonId);
    if (!report) return false; // a temporada dele ainda não virou → tenta de novo amanhã
    const moved = movementOf(report, row.clubId);
    const outcome = await outcomeOf(worldDb, row, moved);
    const result = await closeSeason(playerDb, row.athleteId, row.seasonId, {
      outcome,
      tierAfter: moved?.toTier ?? null,
    });
    return result.closed;
  } catch {
    console.error(`fecho de temporada adiado (season=${row.seasonId}) — season_close_failed`); // OP-11
  }
  return false;
}

interface Movement {
  readonly kind: 'promoted' | 'relegated';
  readonly toTier: number;
}

/** O que o `turnover_report` diz que aconteceu com o clube na virada. */
function movementOf(
  report: { promoted: readonly { clubId: string; toTier: number }[]; relegated: readonly { clubId: string; toTier: number }[] },
  clubId: string,
): Movement | null {
  const up = report.promoted.find((m) => m.clubId === clubId);
  if (up) return { kind: 'promoted', toTier: up.toTier };
  const down = report.relegated.find((m) => m.clubId === clubId);
  if (down) return { kind: 'relegated', toTier: down.toTier };
  return null;
}

/**
 * O desfecho. `champion` exige DUAS condições: ser o 1º da classificação das rodadas PUBLICADAS
 * **e** não ter sido rebaixado.
 *
 * ⚠️ A guarda dupla não é paranoia: a tabela das rodadas publicadas e a re-simulação que decide
 * promoção/rebaixamento são simulações DIFERENTES (a modulação de forma/moral muda a cada dia —
 * SPEC-029/047 —, e um humano admitido mid-season joga na re-simulação as rodadas em que o NPC
 * jogou de fato). Sem a guarda, o card poderia dizer CAMPEÃO com a seta apontando para baixo.
 */
async function outcomeOf(
  worldDb: WorldDb,
  row: OpenSeason,
  moved: Movement | null,
): Promise<SeasonOutcome> {
  if (moved?.kind === 'relegated') return 'relegated';
  if (await wasChampion(worldDb, row)) return 'champion';
  if (moved?.kind === 'promoted') return 'promoted';
  return 'stayed';
}

/** 1º lugar na classificação das rodadas publicadas da temporada. Os clubes da liga saem da UNIÃO
 *  dos participantes das partidas — não do snapshot, que a viragem já sobrescreveu. */
async function wasChampion(worldDb: WorldDb, row: OpenSeason): Promise<boolean> {
  const matches = await readSeasonMatches(worldDb, row.leagueId, row.seasonId);
  if (matches.length === 0) return false;
  const clubIds = new Set<string>();
  for (const m of matches) {
    clubIds.add(m.homeId);
    clubIds.add(m.awayId);
  }
  const table = computeStandings([...clubIds], matches);
  return table[0]?.clubId === row.clubId;
}
