// Mapeadores PUROS WorldState ↔ linhas (SPEC-013). Sem I/O, sem driver — a lógica
// de tradução é testável isolada e o repo só orquestra a transação. `strength` é
// RECOMPUTADA na leitura (clubStrength), nunca lida do banco. A coluna `ord` carrega
// a ordem canônica das listas do WorldState (viragem/replay dependem dela).
import {
  clubStrength,
  type Archetype,
  type Athlete,
  type League,
  type Position,
  type Tier,
  type WorldClub,
  type WorldState,
} from '@camisa-9/world-engine';
import { athlete, club, league, world, worldTier } from '../schema/world.js';

type WorldRow = typeof world.$inferInsert;
type TierRow = typeof worldTier.$inferInsert;
type LeagueRow = typeof league.$inferInsert;
type ClubRow = typeof club.$inferInsert;
type AthleteRow = typeof athlete.$inferInsert;

type WorldSel = typeof world.$inferSelect;
type TierSel = typeof worldTier.$inferSelect;
type LeagueSel = typeof league.$inferSelect;
type ClubSel = typeof club.$inferSelect;
type AthleteSel = typeof athlete.$inferSelect;

/** Linhas de INSERÇÃO derivadas de um WorldState, na ordem de dependência das FKs. */
export interface WorldRows {
  readonly world: WorldRow;
  readonly tiers: TierRow[];
  readonly leagues: LeagueRow[];
  readonly clubs: ClubRow[];
  readonly athletes: AthleteRow[];
}

/** Linhas LIDAS do banco, para reconstruir o WorldState. */
export interface WorldReadRows {
  readonly world: WorldSel;
  readonly tiers: TierSel[];
  readonly leagues: LeagueSel[];
  readonly clubs: ClubSel[];
  readonly athletes: AthleteSel[];
}

/** Achata o WorldState em linhas. `seed` é a fonte-da-verdade (raiz das FKs). */
export function worldStateToRows(seed: string, state: WorldState): WorldRows {
  const tiers: TierRow[] = [];
  const leagues: LeagueRow[] = [];
  const clubs: ClubRow[] = [];
  const athletes: AthleteRow[] = [];
  for (const t of state.tiers) {
    tiers.push({ worldSeed: seed, tier: t.tier });
    t.leagues.forEach((lg, li) => {
      leagues.push({ worldSeed: seed, tier: t.tier, leagueId: lg.leagueId, ord: li });
      lg.clubs.forEach((c, ci) => {
        clubs.push(clubToRow(seed, lg.leagueId, c, ci));
        c.roster.forEach((a, ai) => athletes.push(athleteToRow(seed, c.id, a, ai)));
      });
    });
  }
  return { world: { seed, seasonId: state.seasonId }, tiers, leagues, clubs, athletes };
}

function clubToRow(seed: string, leagueId: string, c: WorldClub, ord: number): ClubRow {
  return {
    worldSeed: seed,
    leagueId,
    id: c.id,
    ord,
    name: c.name,
    archetype: c.archetype,
    weights: [...c.weights],
  };
}

function athleteToRow(seed: string, clubId: string, a: Athlete, ord: number): AthleteRow {
  return {
    worldSeed: seed,
    clubId,
    id: a.id,
    ord,
    name: a.name,
    age: a.age,
    ability: a.ability,
    position: a.position,
  };
}

/** Reconstrói o WorldState a partir das linhas lidas. Recompõe a ordem por `ord`. */
export function rowsToWorldState(rows: WorldReadRows): WorldState {
  const athletesByClub = groupSorted(rows.athletes, (a) => a.clubId);
  const clubsByLeague = groupSorted(rows.clubs, (c) => c.leagueId);
  const leaguesByTier = groupSorted(rows.leagues, (l) => String(l.tier));
  const tiers: Tier[] = [...rows.tiers]
    .sort((a, b) => a.tier - b.tier)
    .map((t) => ({
      tier: t.tier,
      leagues: (leaguesByTier.get(String(t.tier)) ?? []).map((lg) =>
        rowToLeague(lg, clubsByLeague.get(lg.leagueId) ?? [], athletesByClub),
      ),
    }));
  return { seasonId: rows.world.seasonId, tiers };
}

function rowToLeague(
  lg: LeagueSel,
  clubRows: ClubSel[],
  athletesByClub: Map<string, AthleteSel[]>,
): League {
  return {
    leagueId: lg.leagueId,
    clubs: clubRows.map((c) => rowToClub(c, athletesByClub.get(c.id) ?? [])),
  };
}

function rowToClub(c: ClubSel, athleteRows: AthleteSel[]): WorldClub {
  const roster = athleteRows.map(rowToAthlete);
  return {
    id: c.id,
    name: c.name,
    strength: clubStrength(roster),
    archetype: c.archetype as Archetype,
    weights: [...c.weights],
    roster,
  };
}

/** Converte uma linha de atleta no domínio (narrow da posição). Reusado pelos readers. */
export function rowToAthlete(a: AthleteSel): Athlete {
  return {
    id: a.id,
    name: a.name,
    age: a.age,
    ability: a.ability,
    position: a.position as Position,
  };
}

function groupSorted<T extends { ord: number }>(
  rows: T[],
  key: (row: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket) bucket.push(row);
    else map.set(key(row), [row]);
  }
  for (const bucket of map.values()) bucket.sort((a, b) => a.ord - b.ord);
  return map;
}
