// Barrel público do @camisa-9/player-store (SPEC-016).
export { createDb, type Db, type DbHandle } from './client.js';
export { hashPassword, verifyPassword } from './store/auth.js';
export {
  createAccountWithAthlete,
  readAccountByEmail,
  readActiveAthlete,
  readAthleteIdentity,
  rebirthAthlete,
  type AthleteIdentity,
  type RebirthResult,
  type SignupInput,
  type SignupResult,
} from './store/player-repo.js';
export {
  applyTraining,
  spendFreePoint,
  readAthleteProgress,
  type Progress,
} from './store/training-repo.js';
export {
  createAccountWithTeam,
  joinTeamWithCode,
  lockTeam,
  readTeam,
  type CreateTeamInput,
  type CreateTeamResult,
  type JoinTeamInput,
  type JoinTeamResult,
  type TeamView,
} from './store/team-repo.js';
export * as schema from './schema/index.js';
