// Promoção/rebaixamento por fronteira (SPEC-009). Determinístico e sem RNG: decorre
// só das tabelas finais. `promoteRelegate[b]` = clubes que cruzam a fronteira b (entre
// o andar b+1 e o b+2). Conservação de fluxo: cada andar termina com clubsPerLeague.

import { WORLD } from '../constants.js';
import type { StandingRow, Tier, WorldClub, WorldSeasonResult } from '../types.js';

/** Reordena os clubes entre andares adjacentes a partir das classificações finais. */
export function applyPromotionRelegation(
  tiers: readonly Tier[],
  results: WorldSeasonResult,
): Tier[] {
  assertSingleLeaguePerTier(tiers);
  const tableByLeague = new Map<string, readonly StandingRow[]>(
    results.leagues.map((l) => [l.result.leagueId, l.result.table]),
  );
  const ranked = tiers.map((tier) => rankClubs(tier, tableByLeague));
  const next = tiers.map((tier, i) => ({
    tier: tier.tier,
    leagues: [{ leagueId: leagueIdOf(tier), clubs: newMembers(ranked, i) }],
  }));
  assertConservation(next);
  return next;
}

/** v1 é linear (1 liga/andar). Grupos paralelos (R13) reescreverão a promoção — até lá,
 * falhar alto é melhor que descartar as ligas leagues[1..] em silêncio. */
function assertSingleLeaguePerTier(tiers: readonly Tier[]): void {
  for (const tier of tiers) {
    if (tier.leagues.length !== 1) {
      throw new RangeError(
        `promoção multi-liga (grupos paralelos R13) ainda não implementada: andar ${tier.tier} tem ${tier.leagues.length} ligas.`,
      );
    }
  }
}

/** Protege a conservação de fluxo se promoteRelegate (tunável por fronteira) for
 * reconfigurado a ponto de sobrepor top-k e bottom-k (clube subindo e descendo). */
function assertConservation(tiers: readonly Tier[]): void {
  for (const tier of tiers) {
    for (const league of tier.leagues) {
      if (league.clubs.length !== WORLD.clubsPerLeague) {
        throw new RangeError(
          `promoção quebrou a conservação: ${league.leagueId} com ${league.clubs.length} clubes ` +
            `(esperado ${WORLD.clubsPerLeague}); revise promoteRelegate.`,
        );
      }
    }
  }
}

/** Clubes do andar em ordem de classificação final (melhor → pior). */
function rankClubs(tier: Tier, tableByLeague: Map<string, readonly StandingRow[]>): WorldClub[] {
  const league = firstLeague(tier);
  const table = tableByLeague.get(league.leagueId);
  if (table === undefined) {
    throw new RangeError(`rankClubs: sem tabela para a liga ${league.leagueId}.`);
  }
  const byId = new Map(league.clubs.map((c) => [c.id, c]));
  return table.map((row) => {
    const club = byId.get(row.clubId);
    if (club === undefined) {
      throw new RangeError(`rankClubs: clube ${row.clubId} ausente na liga ${league.leagueId}.`);
    }
    return club;
  });
}

/** Nova composição do andar i: fica quem não cruzou fronteira + quem entrou de cima/baixo. */
function newMembers(ranked: readonly WorldClub[][], i: number): WorldClub[] {
  const own = at(ranked, i);
  const removeIds = new Set<string>();
  const incoming: WorldClub[] = [];
  if (i >= 1) {
    const k = boundaryK(i - 1); // fronteira acima (andar i-1 ↔ i)
    top(own, k).forEach((c) => removeIds.add(c.id)); // sobe → sai deste andar
    incoming.push(...bottom(at(ranked, i - 1), k)); // desce de cima → entra
  }
  if (i <= ranked.length - 2) {
    const k = boundaryK(i); // fronteira abaixo (andar i ↔ i+1)
    bottom(own, k).forEach((c) => removeIds.add(c.id)); // desce → sai deste andar
    incoming.push(...top(at(ranked, i + 1), k)); // sobe de baixo → entra
  }
  const stay = own.filter((c) => !removeIds.has(c.id));
  return sortById([...stay, ...incoming]);
}

function firstLeague(tier: Tier): Tier['leagues'][number] {
  const league = tier.leagues[0];
  if (league === undefined) throw new RangeError(`promotion: andar ${tier.tier} sem liga.`);
  return league;
}

function leagueIdOf(tier: Tier): string {
  return firstLeague(tier).leagueId;
}

function at(ranked: readonly WorldClub[][], idx: number): WorldClub[] {
  const arr = ranked[idx];
  if (arr === undefined) throw new RangeError(`promotion: andar índice ${idx} inválido.`);
  return arr;
}

function boundaryK(idx: number): number {
  const k = WORLD.promoteRelegate[idx];
  if (k === undefined) throw new RangeError(`promotion: fronteira ${idx} sem parâmetro.`);
  return k;
}

function top(clubs: readonly WorldClub[], k: number): WorldClub[] {
  return clubs.slice(0, k);
}

function bottom(clubs: readonly WorldClub[], k: number): WorldClub[] {
  return clubs.slice(clubs.length - k);
}

function sortById(clubs: readonly WorldClub[]): WorldClub[] {
  return [...clubs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
