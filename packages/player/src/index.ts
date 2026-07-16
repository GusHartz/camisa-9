// API pública do domínio do jogador (SPEC-016).
export * from './types.js';
export { PLAYER, FOCI, POSITIONS, CREATION_TOTAL, TRAINING, TEAM } from './constants.js';
export { validateName } from './name-filter.js';
export { allocateAttributes } from './attributes.js';
export { validateAppearance } from './appearance.js';
export { validatePassword } from './password-policy.js';
export { createAthlete } from './create.js';
export {
  trainSession,
  applyPoint,
  nextThreshold,
  pointsEarnedTotal,
  repeatPenaltyPct,
  coachFocus,
  resolveFocusStreak,
} from './training.js';
export {
  validateTeamName,
  validateKit,
  validateCodeFormat,
  isPosition,
  slotsRemaining,
  canClaim,
  humanCount,
  milestone,
  createTeam,
} from './team.js';
