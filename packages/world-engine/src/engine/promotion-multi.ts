// Promoção/rebaixamento entre GRUPOS PARALELOS (R13, SPEC-036). Ativado só quando algum andar
// tem >1 liga (pós-expansão) — o caminho de 1-liga/andar fica no `promotion.ts` INTOCADO (dispatch
// no `advanceWorld`), o que mantém o `world.golden.json` byte-idêntico. Determinístico, sem RNG:
// rank ACHATADO por andar (interleave dos grupos por posição) → reusa a lógica de fronteira de
// `newMembers` → re-empacota cada andar em grupos de `clubsPerLeague` por id. Conserva o fluxo.
// O playoff de acesso RICO (chaveamento entre campeões) é o card de produto 2.2 (fora do slice).

import { WORLD } from '../constants.js';
import type { League, StandingRow, Tier, WorldClub, WorldSeasonResult } from '../types.js';
import { assertConservation, newMembers } from './promotion.js';

const CLUBS = WORLD.clubsPerLeague;

/** Recompõe todos os andares cruzando as fronteiras entre grupos paralelos. */
export function promoteRelegateMulti(tiers: readonly Tier[], results: WorldSeasonResult): Tier[] {
  const tableByLeague = new Map<string, readonly StandingRow[]>(
    results.leagues.map((l) => [l.result.leagueId, l.result.table]),
  );
  const rankedFlat = tiers.map((tier) => flatRankTier(tier, tableByLeague));
  const next = tiers.map((tier, i) => repackTier(tier, newMembers(rankedFlat, i)));
  assertConservation(next);
  return next;
}

/**
 * Rank ACHATADO do andar: interleave dos grupos por posição (todos os 1º por ord, todos os 2º, …),
 * melhor → pior. Assim `newMembers` promove os campeões primeiro e rebaixa os lanternas primeiro.
 */
function flatRankTier(tier: Tier, tableByLeague: Map<string, readonly StandingRow[]>): WorldClub[] {
  const perGroup = tier.leagues.map((lg) => rankLeague(lg, tableByLeague));
  const depth = Math.max(0, ...perGroup.map((g) => g.length));
  const flat: WorldClub[] = [];
  for (let pos = 0; pos < depth; pos += 1) {
    for (const group of perGroup) {
      const club = group[pos];
      if (club !== undefined) flat.push(club);
    }
  }
  return flat;
}

/** Clubes de UMA liga na ordem da classificação final (melhor → pior). */
function rankLeague(
  league: League,
  tableByLeague: Map<string, readonly StandingRow[]>,
): WorldClub[] {
  const table = tableByLeague.get(league.leagueId);
  if (table === undefined) {
    throw new RangeError(`promoteRelegateMulti: sem tabela para a liga ${league.leagueId}.`);
  }
  const byId = new Map(league.clubs.map((c) => [c.id, c]));
  return table.map((row) => {
    const club = byId.get(row.clubId);
    if (club === undefined) {
      throw new RangeError(
        `promoteRelegateMulti: clube ${row.clubId} ausente em ${league.leagueId}.`,
      );
    }
    return club;
  });
}

/**
 * Re-empacota os clubes recompostos do andar nos seus grupos de `clubsPerLeague` (por id →
 * determinístico, grupos redesenhados por temporada), preservando os leagueIds por ord.
 */
function repackTier(tier: Tier, clubs: readonly WorldClub[]): Tier {
  // Falha ALTO em overflow/underflow (paridade com o caminho v1): se `promoteRelegate` for
  // reconfigurado a ponto de top-k e bottom-k se sobreporem, o `slice` abaixo truncaria em SILÊNCIO
  // (dropando/duplicando clubes) e o `assertConservation` (só checa ==20) não pegaria. Revisão SPEC-036.
  const expected = tier.leagues.length * CLUBS;
  if (clubs.length !== expected) {
    throw new RangeError(
      `promoteRelegateMulti: andar ${tier.tier} recompôs ${clubs.length} clubes ` +
        `(esperado ${expected}); revise promoteRelegate.`,
    );
  }
  // Ordena por (comprimento do id, depois lexicográfico) = ordem NUMÉRICA dos ids `clube-NNN`
  // zero-padded — robusta além de 999 clubes (o lex puro poria `clube-1000` < `clube-999`). Abaixo
  // de 1000 clubes todos os ids têm o mesmo comprimento → idêntico ao lex (golden intocado).
  const sorted = [...clubs].sort(
    (a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const leagues: League[] = tier.leagues.map((lg, j) => ({
    leagueId: lg.leagueId,
    clubs: sorted.slice(j * CLUBS, (j + 1) * CLUBS),
  }));
  return { tier: tier.tier, leagues };
}
