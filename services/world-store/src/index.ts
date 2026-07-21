// Barrel público do @camisa-9/world-store (SPEC-013).
export { createDb, type Db, type DbHandle } from './client.js';
export {
  readClubRoster,
  readClubBrief,
  readClubSquad,
  readLeagueClubIds,
  readWorld,
  writeWorld,
  writeWorldState,
  type ClubBrief,
  type ClubSquadEntry,
} from './store/world-repo.js';
export { readOccupationsByClub } from './store/occupation-by-club.js';
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
  toOccupationView,
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
export {
  transferOccupation,
  pickTransferDestination,
  type TransferInput,
  type TransferResult,
} from './store/transfer-repo.js';
export { REGEN_AGE } from './store/regen-age.js';
export {
  markActive,
  runVacancyPass,
  readVacancyState,
  type VacancyHooks,
  type VacancyReport,
  type VacancyState,
} from './store/vacancy-repo.js';
export { VACANCY } from './store/vacancy-policy.js';
export {
  persistWorldTurnover,
  entryOccupancyRate,
  TurnoverError,
  type TurnoverOutcome,
  type TurnoverStatus,
} from './store/turnover-repo.js';
export {
  runDailyRound,
  runRoundForDay,
  targetRoundFor,
  type DailyRoundReport,
  type DailyRoundStatus,
  type WorldModulator,
} from './store/daily-round.js';
export { advanceTickCursor, readTickCursor } from './store/tick-progress-repo.js';
export {
  WAITINGLIST,
  countEntryHumans,
  dequeue,
  enqueue,
  findEntryClubWithSlot,
  queueLength,
  readQueue,
  type QueueEntry,
} from './store/waiting-repo.js';
export { applyMoodToWorld, applyHumanTraits, type HumanTraits } from './store/mood-modulation.js';
export type { PublishInput, PublishOutcome, PublishStatus } from '@camisa-9/world-engine';
export * as schema from './schema/index.js';
