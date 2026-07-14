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
export { computeStandings } from './engine/standings.js';
export { simulateSeason } from './engine/season.js';
export { DEMO_LEAGUE } from './data/league-seed.js';
export { RoundStore, type PublishedRound } from './orchestration/store.js';
export { resolveSlot, type RoundSlot } from './orchestration/anchor.js';
export {
  RoundPublisher,
  type PublishInput,
  type PublishOutcome,
  type PublishStatus,
} from './orchestration/publish.js';
