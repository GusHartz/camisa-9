// Tipos de domínio do motor do mundo (SPEC-002). Puros, sem I/O.

export interface Club {
  readonly id: string;
  readonly name: string;
  /** Força agregada do clube (0..100). Modelo mínimo do spike. */
  readonly strength: number;
}

export interface LeagueState {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly clubs: readonly Club[];
}

export interface Fixture {
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
}

/** Um evento da PARTIDA RICA (SPEC-031). Fatia 1: a lesão (`kind:'injury'`); `kind` aberto p/
 *  `goal`/`choice` futuros. Puro/serializável (vai no `jsonb` do `RoundResult`). */
export interface MatchEvent {
  readonly kind: 'injury';
  readonly clubId: string;
  readonly athleteId: string;
  readonly severity: 'leve' | 'media' | 'grave';
  readonly minute: number;
}

export interface MatchResult {
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
  readonly homeGoals: number;
  readonly awayGoals: number;
  /** Eventos da partida rica (SPEC-031) — preenchidos SÓ no `world-season` (que tem os elencos),
   *  DEPOIS do placar, com RNG próprio. O `simulateSeason` puro NÃO os toca → `season.golden`
   *  intocado. Opcional (ausente = sem eventos). */
  readonly events?: readonly MatchEvent[];
}

export interface RoundResult {
  readonly round: number;
  readonly matches: readonly MatchResult[];
}

export interface StandingRow {
  readonly clubId: string;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly goalDiff: number;
  readonly points: number;
}

export interface SeasonResult {
  readonly leagueId: string;
  readonly seasonId: string;
  readonly rounds: readonly RoundResult[];
  readonly table: readonly StandingRow[];
}

export type Seed = string;

// ─────────────────────────────────────────────────────────────────────────────
// Mundo — pirâmide de N andares com elenco NPC (SPEC-009). Puros, sem I/O.
// ─────────────────────────────────────────────────────────────────────────────

/** Posição do atleta NPC. Modelo mínimo — os 12 atributos ficam em card separado. */
export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

/**
 * Arquétipo de clube, sorteado por seed na CRIAÇÃO do clube (SPEC-009 ajuste #2).
 * A v1 não o usa; existe para não deslocar o stream do PRNG quando a 1.4 (mercado
 * com necessidade + personalidade) passar a lê-lo. Atribuir depois quebraria replay.
 */
export type Archetype = 'formador' | 'equilibrado' | 'comprador' | 'gastador';

/** Atleta NPC mínimo: idade + habilidade + posição. */
export interface Athlete {
  readonly id: string;
  readonly name: string;
  /** Idade em temporadas. */
  readonly age: number;
  /** Habilidade agregada 0..100 (base do `clubStrength`). */
  readonly ability: number;
  readonly position: Position;
}

/** Clube do mundo: elenco NPC + força derivada + arquétipo/pesos seed-sorteados. */
export interface WorldClub {
  readonly id: string;
  readonly name: string;
  /** Derivada do elenco por `clubStrength` — nunca escrita à mão. */
  readonly strength: number;
  /** Sorteado por seed na criação (SPEC-009 ajuste #2; fundação da 1.4). */
  readonly archetype: Archetype;
  /** Vetor de pesos do arquétipo, sorteado por seed na criação (fundação da 1.4). */
  readonly weights: readonly number[];
  readonly roster: readonly Athlete[];
}

/**
 * Uma liga (grupo) dentro de um andar. v1: 1 liga por andar; o tipo já modela
 * a lista para a Pirâmide Elástica (R13) crescer em grupos paralelos sem refatorar.
 */
export interface League {
  readonly leagueId: string;
  readonly clubs: readonly WorldClub[];
}

/** Um andar da pirâmide: `tier` (1 = topo) → uma OU MAIS ligas (SPEC-009 ajuste #1). */
export interface Tier {
  readonly tier: number;
  readonly leagues: readonly League[];
}

/** Estado do mundo numa temporada: identificador + andares. */
export interface WorldState {
  readonly seasonId: string;
  readonly tiers: readonly Tier[];
}

/** Resultado de uma liga numa temporada, anotado com o andar de origem. */
export interface LeagueSeasonResult {
  readonly tier: number;
  readonly result: SeasonResult;
}

/** Resultado do mundo numa temporada: todas as ligas de todos os andares. */
export interface WorldSeasonResult {
  readonly seasonId: string;
  readonly leagues: readonly LeagueSeasonResult[];
}

/** Movimento de um clube entre andares na viragem (tier menor = mais alto). */
export interface ClubMove {
  readonly clubId: string;
  readonly fromTier: number;
  readonly toTier: number;
}

/** Movimento de um atleta entre clubes na viragem (transferência). */
export interface AthleteMove {
  readonly athleteId: string;
  readonly fromClubId: string;
  readonly toClubId: string;
}

/**
 * Relatório de viragem (auditabilidade — insumo do painel 1.5). Derivado por DIFF
 * puro do estado antes/depois: promovidos/rebaixados, aposentados, nascidos e
 * transferidos. Não altera o estado; é uma observação sobre a transição.
 */
export interface TurnoverReport {
  readonly fromSeasonId: string;
  readonly toSeasonId: string;
  readonly promoted: readonly ClubMove[];
  readonly relegated: readonly ClubMove[];
  readonly retired: readonly string[];
  readonly born: readonly string[];
  readonly transferred: readonly AthleteMove[];
}
