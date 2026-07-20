// Barrel público do @camisa-9/player-store (SPEC-016).
export { createDb, type Db, type DbHandle } from './client.js';
export { hashPassword, verifyPassword } from './store/auth.js';
export {
  createAccountWithAthlete,
  readAccountByEmail,
  readActiveAthlete,
  readAthleteIdentity,
  normalizeEmail,
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
  leaveTeam,
  readTeam,
  type CreateTeamInput,
  type CreateTeamResult,
  type JoinTeamInput,
  type JoinTeamResult,
  type TeamView,
} from './store/team-repo.js';
export { accrueRound, purchaseItem, readWallet, type Wallet } from './store/economy-repo.js';
export {
  generateForDay,
  answerDecision,
  resolveDeadline,
  readDecisionLog,
  readTransferRequested,
  clearTransferRequested,
  type DecisionLogEntry,
} from './store/decision-repo.js';
export {
  injureFromMatch,
  advanceRecovery,
  readInjuryState,
  readInjuryLog,
  type InjuryState,
  type InjuryLogEntry,
} from './store/injury-repo.js';
export {
  applyDailyMood,
  readMood,
  readMoodByIds,
  bumpMoral,
  bumpForma,
  type Mood,
} from './store/mood-repo.js';
export {
  authenticate,
  createSession,
  readSessionByHash,
  touchSession,
  deleteSession,
  deleteExpiredSessions,
  SESSION,
  type AuthResult,
  type SessionView,
  type CreatedSession,
} from './store/session-repo.js';
export * as schema from './schema/index.js';
