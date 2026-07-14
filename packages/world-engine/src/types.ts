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

export interface MatchResult {
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
  readonly homeGoals: number;
  readonly awayGoals: number;
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
