// API pública do motor do mundo (SPEC-002).

export * from './types.js';
export { MATCH } from './constants.js';
export {
  createRng,
  nextUint32,
  nextFloat,
  nextInt,
  deriveSeed,
  type RngState,
} from './engine/prng.js';
export { generateFixtures } from './engine/fixtures.js';
export { resolveMatch, type Score } from './engine/match.js';
export {
  matchGoals,
  matchInjuries,
  MATCH_EVENTS,
  SCORER_WEIGHTS,
  ASSIST_WEIGHTS,
} from './engine/match-events.js';
export {
  matchRating,
  RATING,
  type MatchOutcome,
  type RatingFocos,
  type RatingInput,
} from './engine/match-rating.js';
export {
  matchChoices,
  choiceTemplateById,
  MATCH_CHOICES,
  CHOICES_PER_MATCH,
  type MatchChoice,
  type MatchChoiceOption,
  type MatchChoiceContext,
  type ChoiceEffect,
  type ChoiceAttr,
  type ChoiceTemplate,
} from './engine/match-choices.js';
export {
  resolveChoiceRoll,
  rollChance,
  choiceOptionById,
  conservativeChoiceOption,
  CHOICE_ROLL,
  type RollInput,
} from './engine/match-choice-roll.js';
export { choiceContextFrom } from './engine/match-choice-context.js';
export {
  choiceOutcomeText,
  outcomesOf,
  type ChoiceOutcome,
  type ChoiceOutcomeText,
} from './engine/match-choice-copy.js';
export { computeStandings } from './engine/standings.js';
export { simulateSeason } from './engine/season.js';
export { DEMO_LEAGUE } from './data/league-seed.js';
// Mundo — pirâmide + elenco NPC (SPEC-009).
export { WORLD, ARCHETYPES, POSITIONS } from './constants.js';
export { seedWorld } from './data/world-seed.js';
export { athleteName } from './data/names.js';
export { clubStrength, positionCounts, tierAbilityRange } from './engine/roster.js';
export { simulateWorldSeason } from './engine/world-season.js';
export { advanceWorld } from './engine/world-turnover.js';
export { applyPromotionRelegation } from './engine/promotion.js';
export { ageAndRetire, refillYouth } from './engine/lifecycle.js';
export { runTransfers } from './engine/transfers.js';
export { turnoverReport } from './engine/turnover-report.js';
export { worldHash } from './engine/world-hash.js';
export { RoundStore, type PublishedRound } from './orchestration/store.js';
export { dueDayIndex, resolveSlot, type RoundSlot } from './orchestration/anchor.js';
export {
  RoundPublisher,
  type PublishInput,
  type PublishOutcome,
  type PublishStatus,
} from './orchestration/publish.js';
