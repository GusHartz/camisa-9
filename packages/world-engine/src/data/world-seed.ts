// Geração determinística do mundo inicial (SPEC-009): pirâmide de N andares, cada
// clube com elenco NPC. Puro, sem I/O. A ORDEM DE SORTEIO é contrato de determinismo
// (golden/replay): inseri-la errada quebra os vetores dourados cross-ambiente.

import { ARCHETYPES, POSITIONS, WORLD } from '../constants.js';
import type { Athlete, League, Seed, Tier, WorldClub, WorldState } from '../types.js';
import { createRng, deriveSeed, nextInt, type RngState } from '../engine/prng.js';
import { drawInt, pick } from '../engine/draw.js';
import { clubStrength, tierAbilityRange } from '../engine/roster.js';
import { athleteName, clubName } from './names.js';

/** Temporada de nascimento do mundo. */
const INITIAL_SEASON = '2026';

/** Semeia o mundo inteiro a partir de uma seed. Determinístico e reproduzível. */
export function seedWorld(seed: Seed): WorldState {
  const tiers: Tier[] = [];
  for (let t = 1; t <= WORLD.tiers; t++) {
    tiers.push(buildTier(seed, t));
  }
  return { seasonId: INITIAL_SEASON, tiers };
}

function buildTier(seed: Seed, tier: number): Tier {
  const leagues: League[] = [];
  for (let l = 0; l < WORLD.leaguesPerTier; l++) {
    leagues.push(buildLeague(seed, tier, l));
  }
  return { tier, leagues };
}

function buildLeague(seed: Seed, tier: number, leagueIndex: number): League {
  const clubs: WorldClub[] = [];
  const base = ((tier - 1) * WORLD.leaguesPerTier + leagueIndex) * WORLD.clubsPerLeague;
  for (let c = 0; c < WORLD.clubsPerLeague; c++) {
    clubs.push(createClub(seed, tier, base + c));
  }
  return { leagueId: leagueId(tier, leagueIndex), clubs };
}

function leagueId(tier: number, leagueIndex: number): string {
  return WORLD.leaguesPerTier === 1 ? `divisao-${tier}` : `divisao-${tier}-g${leagueIndex + 1}`;
}

function clubId(globalIndex: number): string {
  return `clube-${String(globalIndex).padStart(3, '0')}`;
}

/**
 * Cria um clube com a ORDEM DE SORTEIO FIXA (ajuste #2): (1) archetype, (2) weights,
 * (3) elenco. Sortear archetype/weights JÁ — mesmo sem uso na v1 — evita que a 1.4,
 * ao passar a lê-los, desloque o stream do PRNG e quebre golden/replay.
 */
function createClub(seed: Seed, tier: number, globalIndex: number): WorldClub {
  const id = clubId(globalIndex);
  const rng = createRng(deriveSeed(seed, 'club', id));
  const archetype = pick(ARCHETYPES, rng);
  const weights = Array.from({ length: WORLD.weightCount }, () => nextInt(rng, WORLD.weightMax));
  const roster = buildRoster(rng, tier, id);
  return {
    id,
    name: clubName(globalIndex),
    strength: clubStrength(roster),
    archetype,
    weights,
    roster,
  };
}

/** Monta o elenco na ordem das POSITIONS; por atleta sorteia IDADE e depois HABILIDADE. */
function buildRoster(rng: RngState, tier: number, clubIdValue: string): Athlete[] {
  const range = tierAbilityRange(tier);
  const roster: Athlete[] = [];
  let idx = 0;
  for (const position of POSITIONS) {
    for (let k = 0; k < WORLD.squadShape[position]; k++) {
      const age = drawInt(rng, WORLD.seedAgeMin, WORLD.seedAgeMax);
      const ability = drawInt(rng, range.min, range.max);
      const id = `${clubIdValue}-a${String(idx).padStart(2, '0')}`;
      roster.push({ id, name: athleteName(id), age, ability, position });
      idx += 1;
    }
  }
  return roster;
}
