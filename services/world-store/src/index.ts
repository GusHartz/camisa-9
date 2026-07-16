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
export * as schema from './schema/world.js';
