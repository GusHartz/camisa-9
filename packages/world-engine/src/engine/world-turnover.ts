// Viragem de temporada (SPEC-009): a máquina que leva o mundo de uma temporada à
// próxima. ORDEM CANÔNICA — a da SPEC-009 aprovada (escopo §52-58 + Notas), pois
// "mudá-la muda o golden":
//   1. promoção/rebaixamento por fronteira (das tabelas finais) — dispatch 1-grupo/multi-grupo (R13)
//   2. envelhecer (+1) todos
//   3. aposentar (age ≥ 35)
//   4. transferências placeholder (trocas de mesma posição, preservam o tamanho)
//   5. repor base por posição → volta a rosterSize (ajuste #4)
//   6. EXPANSÃO (R13/SPEC-036) — gated por `expand`; no-op sem consumir PRNG quando false
//   7. recomputar a força a partir do elenco final; seasonId += 1
// Puro e determinístico; toda aleatoriedade vem de sub-seeds derivadas do `seed`.

import type { Seed, WorldClub, League, WorldSeasonResult, WorldState } from '../types.js';
import { createRng, deriveSeed } from './prng.js';
import { clubStrength } from './roster.js';
import { ageAndRetire, refillYouth } from './lifecycle.js';
import { runTransfers } from './transfers.js';
import { applyPromotionRelegation } from './promotion.js';
import { promoteRelegateMulti } from './promotion-multi.js';
import { applyExpansion } from './expansion.js';

/**
 * Avança o mundo uma temporada. Retorna um novo estado; não muta a entrada.
 * `immuneIds` (SPEC-021): atletas a PULAR em aposentar/transferir (os humanos, derivados de
 * `world_occupation` pela borda). O engine fala de IDS, não de "humano".
 * `expand` (R13/SPEC-036): quando `true`, a virada EXPANDE a pirâmide (alarga a base / novo andar);
 * a borda decide a partir da ocupação humana da base. Ambos default ⇒ comportamento e stream do
 * PRNG IDÊNTICOS ao original (o `world.golden.json` fica byte-idêntico).
 */
export function advanceWorld(
  world: WorldState,
  results: WorldSeasonResult,
  seed: Seed,
  immuneIds: ReadonlySet<string> = new Set(),
  expand = false,
): WorldState {
  const seasonId = world.seasonId;
  // Passo 1: dispatch — todos os andares com 1 grupo → o caminho v1 INTOCADO (golden byte-idêntico);
  // qualquer andar com grupos paralelos (pós-expansão R13) → a promoção multi-grupo.
  const promoted = world.tiers.every((t) => t.leagues.length === 1)
    ? applyPromotionRelegation(world.tiers, results)
    : promoteRelegateMulti(world.tiers, results);
  // Passos 2–5: gira cada liga (envelhece/aposenta/transfere/repõe).
  const turned = promoted.map((tier) => ({
    tier: tier.tier,
    leagues: tier.leagues.map((league) => turnLeague(league, tier.tier, seed, seasonId, immuneIds)),
  }));
  // Passo 6: expansão (gated). Passo 7: força já foi recomputada em `turnLeague`/`createClub`.
  const tiers = applyExpansion(turned, seed, expand);
  return { seasonId: nextSeasonId(seasonId), tiers };
}

/** Passos 2–6 para uma liga: envelhece/aposenta → transfere → repõe base → força. */
function turnLeague(
  league: League,
  tier: number,
  seed: Seed,
  seasonId: string,
  immuneIds: ReadonlySet<string>,
): League {
  const survivors = league.clubs.map((c) => ({ ...c, roster: ageAndRetire(c.roster, immuneIds) }));
  const transferRng = createRng(deriveSeed(seed, 'transfers', seasonId, league.leagueId));
  const traded = runTransfers(survivors, transferRng, immuneIds);
  const refilled = traded.map((c) => refillClub(c, tier, seed, seasonId));
  const clubs = refilled.map((c) => ({ ...c, strength: clubStrength(c.roster) }));
  return { leagueId: league.leagueId, clubs };
}

/** Passo 5: repõe a base do clube pela sub-seed do clube (após as transferências). */
function refillClub(club: WorldClub, tier: number, seed: Seed, seasonId: string): WorldClub {
  const youthRng = createRng(deriveSeed(seed, 'youth', seasonId, club.id));
  return { ...club, roster: refillYouth(club.roster, tier, club.id, seasonId, youthRng) };
}

/** Próxima temporada como string numérica. Determinístico (sem relógio). */
function nextSeasonId(seasonId: string): string {
  const n = Number(seasonId);
  if (!Number.isFinite(n)) {
    throw new RangeError(`nextSeasonId: seasonId não numérico: ${seasonId}`);
  }
  return String(n + 1);
}
