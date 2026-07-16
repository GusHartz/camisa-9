// Relatório de viragem por DIFF puro (SPEC-009): compara o mundo antes/depois e deduz
// promovidos/rebaixados (clube mudou de andar), aposentados (id sumiu), nascidos (id
// novo) e transferidos (mesmo id, clube diferente). Sem estado, sem RNG, determinístico.
// Saídas ordenadas por id → relatório estável (auditabilidade / painel 1.5).

import type { AthleteMove, ClubMove, TurnoverReport, WorldState } from '../types.js';

/** Deriva o relatório da transição de `before` para `after`. */
export function turnoverReport(before: WorldState, after: WorldState): TurnoverReport {
  const { promoted, relegated } = diffClubs(before, after);
  const { retired, born, transferred } = diffAthletes(before, after);
  return {
    fromSeasonId: before.seasonId,
    toSeasonId: after.seasonId,
    promoted,
    relegated,
    retired,
    born,
    transferred,
  };
}

function diffClubs(before: WorldState, after: WorldState): {
  promoted: ClubMove[];
  relegated: ClubMove[];
} {
  const tierAfter = clubTierMap(after);
  const promoted: ClubMove[] = [];
  const relegated: ClubMove[] = [];
  for (const [clubId, fromTier] of clubTierMap(before)) {
    const toTier = tierAfter.get(clubId);
    if (toTier === undefined || toTier === fromTier) continue;
    const move: ClubMove = { clubId, fromTier, toTier };
    if (toTier < fromTier) promoted.push(move);
    else relegated.push(move);
  }
  return { promoted: sortBy(promoted, (m) => m.clubId), relegated: sortBy(relegated, (m) => m.clubId) };
}

function diffAthletes(before: WorldState, after: WorldState): {
  retired: string[];
  born: string[];
  transferred: AthleteMove[];
} {
  const clubAfter = athleteClubMap(after);
  const clubBefore = athleteClubMap(before);
  const retired: string[] = [];
  const transferred: AthleteMove[] = [];
  for (const [athleteId, fromClubId] of clubBefore) {
    const toClubId = clubAfter.get(athleteId);
    if (toClubId === undefined) retired.push(athleteId);
    else if (toClubId !== fromClubId) transferred.push({ athleteId, fromClubId, toClubId });
  }
  const born = [...clubAfter.keys()].filter((id) => !clubBefore.has(id));
  return {
    retired: retired.sort(byString),
    born: born.sort(byString),
    transferred: sortBy(transferred, (m) => m.athleteId),
  };
}

function clubTierMap(world: WorldState): Map<string, number> {
  const map = new Map<string, number>();
  for (const tier of world.tiers) {
    for (const league of tier.leagues) {
      for (const club of league.clubs) map.set(club.id, tier.tier);
    }
  }
  return map;
}

function athleteClubMap(world: WorldState): Map<string, string> {
  const map = new Map<string, string>();
  for (const tier of world.tiers) {
    for (const league of tier.leagues) {
      for (const club of league.clubs) {
        for (const a of club.roster) map.set(a.id, club.id);
      }
    }
  }
  return map;
}

function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortBy<T>(items: T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => byString(key(a), key(b)));
}
