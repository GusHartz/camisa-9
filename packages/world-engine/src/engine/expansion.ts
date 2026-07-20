// Pirâmide Elástica (R13, SPEC-036): a EXPANSÃO na virada. Gated por `expand` — quando `false`
// (o default e o caso do golden), é NO-OP e NÃO consome PRNG → `world.golden.json` byte-idêntico.
// Regra (decisão do founder): alarga o andar de ENTRADA (o mais baixo) até o teto = `branchingFactor`
// × a largura do andar acima; quando satura, nasce um ANDAR NOVO embaixo (1 grupo, a nova entrada).
// Clubes novos = NPC frescos via `createClub` (reusa o seeding), com índices globais CONTINUADOS a
// partir da contagem atual (únicos, determinísticos) e sub-seed 'club' disjunta dos existentes.

import { WORLD } from '../constants.js';
import type { League, Seed, Tier, WorldClub } from '../types.js';
import { createClub } from '../data/world-seed.js';

const CLUBS = WORLD.clubsPerLeague;

/** Aplica a expansão (se `expand`) ao fim da viragem. Retorna os andares (crescidos ou não). */
export function applyExpansion(
  tiers: readonly Tier[],
  seed: Seed,
  expand: boolean,
): readonly Tier[] {
  if (!expand) return tiers; // no-op, ZERO PRNG → golden byte-idêntico
  const startIndex = countClubs(tiers);
  return shouldWiden(tiers)
    ? widenEntry(tiers, seed, startIndex)
    : addFloor(tiers, seed, startIndex);
}

/** Total de clubes hoje = o próximo índice global livre (monotônico; nunca colide com 0..N-1). */
function countClubs(tiers: readonly Tier[]): number {
  let n = 0;
  for (const t of tiers) for (const lg of t.leagues) n += lg.clubs.length;
  return n;
}

/** Alarga se a entrada ainda não atingiu o teto (2× a largura do andar acima); senão, novo andar. */
function shouldWiden(tiers: readonly Tier[]): boolean {
  const entry = tiers[tiers.length - 1];
  const above = tiers[tiers.length - 2];
  if (entry === undefined || above === undefined) return true; // o mundo sempre tem ≥ 2 andares
  return entry.leagues.length < WORLD.branchingFactor * above.leagues.length;
}

/** +1 grupo no andar de entrada; re-rotula os grupos do andar (agora >1) por ord. */
function widenEntry(tiers: readonly Tier[], seed: Seed, startIndex: number): Tier[] {
  const last = tiers.length - 1;
  const entry = tiers[last]!;
  const newClubs = buildClubs(seed, entry.tier, startIndex);
  const grouped: WorldClub[][] = [...entry.leagues.map((lg) => [...lg.clubs]), newClubs];
  const leagues: League[] = grouped.map((clubs, j) => ({
    leagueId: groupLeagueId(entry.tier, j),
    clubs,
  }));
  return tiers.map((t, i) => (i === last ? { tier: t.tier, leagues } : t));
}

/** Novo andar embaixo (1 grupo de clubes de várzea), que vira a nova entrada. */
function addFloor(tiers: readonly Tier[], seed: Seed, startIndex: number): Tier[] {
  const newTier = tiers[tiers.length - 1]!.tier + 1;
  const clubs = buildClubs(seed, newTier, startIndex);
  const floor: Tier = { tier: newTier, leagues: [{ leagueId: `divisao-${newTier}`, clubs }] };
  return [...tiers, floor];
}

/** 20 clubes NPC frescos p/ o andar, índices globais [startIndex, startIndex+clubsPerLeague). */
function buildClubs(seed: Seed, tier: number, startIndex: number): WorldClub[] {
  const clubs: WorldClub[] = [];
  for (let c = 0; c < CLUBS; c += 1) {
    clubs.push(createClub(seed, tier, startIndex + c));
  }
  return clubs;
}

/** Nome de liga de um grupo num andar com >1 grupo. */
function groupLeagueId(tier: number, ord: number): string {
  return `divisao-${tier}-g${ord + 1}`;
}
