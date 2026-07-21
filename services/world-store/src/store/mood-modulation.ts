// Modulação de Forma/Moral na PARTIDA (SPEC-029, fatia B) — PURA, sem I/O. Dado um mapa
// `athleteId → ability efetiva` (computado pela costura a partir de forma/moral), reconstrói o
// `WorldState` sobrescrevendo a ability dos atletas presentes e RECOMPUTANDO o `clubStrength` dos
// clubes afetados. É a única forma de o engine (que só lê `ability` via `clubStrength`) "ver" a
// forma/moral — SEM tocar a lógica do engine (reusa `clubStrength`, já exportado) nem o snapshot
// (a base congelada da SPEC-020 fica intacta; isto é in-memory). No-op se o mapa é vazio.
import { clubStrength, type Tier, type WorldClub, type WorldState } from '@camisa-9/world-engine';

/** Aplica as abilities moduladas ao `WorldState` (in-memory). Mapa vazio → o mesmo estado (no-op). */
export function applyMoodToWorld(
  world: WorldState,
  abilityByAthleteId: ReadonlyMap<string, number>,
): WorldState {
  if (abilityByAthleteId.size === 0) return world;
  return { ...world, tiers: world.tiers.map((t) => modulateTier(t, abilityByAthleteId)) };
}

function modulateTier(tier: Tier, abilityByAthleteId: ReadonlyMap<string, number>): Tier {
  return {
    ...tier,
    leagues: tier.leagues.map((l) => ({
      ...l,
      clubs: l.clubs.map((c) => modulateClub(c, abilityByAthleteId)),
    })),
  };
}

/** Sobrescreve a ability dos atletas mapeados e recomputa a força. Sem atleta afetado → o mesmo clube. */
function modulateClub(club: WorldClub, abilityByAthleteId: ReadonlyMap<string, number>): WorldClub {
  let touched = false;
  const roster = club.roster.map((a) => {
    const override = abilityByAthleteId.get(a.id);
    if (override === undefined || override === a.ability) return a;
    touched = true;
    return { ...a, ability: override };
  });
  if (!touched) return club;
  return { ...club, roster, strength: clubStrength(roster) };
}

/** As afinidades de papel do humano (SPEC-046), derivadas dos focos vivos. */
export interface HumanTraits {
  readonly finishing: number; // Técnico
  readonly playmaking: number; // Tático
  readonly durability: number; // Físico
}

/** Injeta as afinidades de papel (SPEC-046) nos `Athlete` mapeados — in-memory, como a Forma/Moral,
 *  MAS sem recomputar `strength` (as afinidades pesam o SORTEIO de gol/assistência/lesão, não a força
 *  do clube; o re-bake do overall no `clubStrength` é card seguinte). Mapa vazio → no-op. */
export function applyHumanTraits(
  world: WorldState,
  traitsByAthleteId: ReadonlyMap<string, HumanTraits>,
): WorldState {
  if (traitsByAthleteId.size === 0) return world;
  return {
    ...world,
    tiers: world.tiers.map((t) => ({
      ...t,
      leagues: t.leagues.map((l) => ({
        ...l,
        clubs: l.clubs.map((c) => traitClub(c, traitsByAthleteId)),
      })),
    })),
  };
}

function traitClub(
  club: WorldClub,
  traitsByAthleteId: ReadonlyMap<string, HumanTraits>,
): WorldClub {
  let touched = false;
  const roster = club.roster.map((a) => {
    const t = traitsByAthleteId.get(a.id);
    if (t === undefined) return a;
    touched = true;
    return { ...a, finishing: t.finishing, playmaking: t.playmaking, durability: t.durability };
  });
  return touched ? { ...club, roster } : club;
}
