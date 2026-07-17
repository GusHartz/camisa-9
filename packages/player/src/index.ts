// API pública do domínio do jogador (SPEC-016).
export * from './types.js';
export { PLAYER, FOCI, POSITIONS, CREATION_TOTAL, TRAINING, TEAM } from './constants.js';
export { validateName } from './name-filter.js';
export { allocateAttributes } from './attributes.js';
export { overall, abilityFromFocos } from './ability.js';
export { regenLegacyPoints } from './regen.js';
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
export {
  ECONOMY,
  HOUSING_LADDER,
  MOTHERS_HOUSE_ID,
  PURCHASES,
  salaryPerRound,
  matchPrize,
  roundEarnings,
  purchaseById,
  isHousing,
  housingTierOf,
  lifestyleTier,
  hasMothersHouse,
  aggregateTradeoffs,
  canAfford,
  validatePurchase,
  type Purchase,
  type PurchaseKind,
  type PurchaseCheck,
  type Tradeoff,
  type MatchResult,
} from './economy.js';
export {
  DECISIONS,
  DECISIONS_PER_DAY,
  generateDailyDecisions,
  templateById,
  optionById,
  conservativeOption,
  type Decision,
  type DecisionType,
  type DecisionOption,
  type DecisionOutcome,
  type DecisionTemplate,
  type DecisionContext,
} from './decisions.js';
export {
  INJURY,
  isSeverity,
  recoveryDaysFor,
  injuryEndDay,
  injuryPhase,
  isAvailable,
  comebackOutcome,
  type Severity,
  type Injury,
} from './injury.js';
export {
  MOOD,
  clampBar,
  stepToward,
  bumpBar,
  lifestyleMoralOffset,
  nextMoral,
  nextForma,
  moodAbilityPct,
  effectiveAbility,
} from './mood.js';
