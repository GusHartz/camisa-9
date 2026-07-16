// API pública do domínio do jogador (SPEC-016).
export * from './types.js';
export { PLAYER, FOCI, POSITIONS, CREATION_TOTAL, TRAINING } from './constants.js';
export { validateName } from './name-filter.js';
export { allocateAttributes } from './attributes.js';
export { validateAppearance } from './appearance.js';
export { validatePassword } from './password-policy.js';
export { createAthlete } from './create.js';
export { trainSession, applyPoint, nextThreshold, pointsEarnedTotal } from './training.js';
