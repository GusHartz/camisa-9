// Barrel público do @camisa-9/player-store (SPEC-016).
export { createDb, type Db, type DbHandle } from './client.js';
export { hashPassword, verifyPassword } from './store/auth.js';
export {
  createAccountWithAthlete,
  readAccountByEmail,
  readActiveAthlete,
  type SignupInput,
  type SignupResult,
} from './store/player-repo.js';
export * as schema from './schema/index.js';
