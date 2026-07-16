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
export { publishRound, readRound } from './store/round-repo.js';
export type { PublishInput, PublishOutcome, PublishStatus } from '@camisa-9/world-engine';
export * as schema from './schema/index.js';
