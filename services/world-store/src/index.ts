// Barrel público do @camisa-9/world-store (SPEC-013).
export { createDb, type Db, type DbHandle } from './client.js';
export { readClubRoster, readWorld, writeWorld, writeWorldState } from './store/world-repo.js';
export {
  rowToAthlete,
  rowsToWorldState,
  worldStateToRows,
  type WorldReadRows,
  type WorldRows,
} from './mapping/world-mapper.js';
export {
  publishRound,
  publishWorldRound,
  readRound,
  type WorldRoundInput,
} from './store/round-repo.js';
export { readSeasonAnchor, setSeasonAnchor } from './store/season-repo.js';
export {
  occupyNpcSlot,
  readOccupation,
  readWorldOccupations,
  requestRegen,
  vacateSlot,
  OccupyError,
  type OccupyInput,
  type OccupyResult,
  type OccupationView,
} from './store/occupation-repo.js';
export {
  archiveLegend,
  readLegends,
  readRegenEligible,
  type LegendInput,
  type LegendView,
  type RegenCandidate,
} from './store/legend-repo.js';
export { reassignSlot, type ReassignInput } from './store/reassign-repo.js';
export { REGEN_AGE } from './store/regen-age.js';
export {
  persistWorldTurnover,
  TurnoverError,
  type TurnoverOutcome,
  type TurnoverStatus,
} from './store/turnover-repo.js';
export {
  runDailyRound,
  type DailyRoundReport,
  type DailyRoundStatus,
} from './store/daily-round.js';
export type { PublishInput, PublishOutcome, PublishStatus } from '@camisa-9/world-engine';
export * as schema from './schema/index.js';
