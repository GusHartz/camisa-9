// Classificação determinística (SPEC-002). Pontos 3/1/0; desempate por ordem TOTAL:
// pontos → saldo → gols pró → id (estável). SEM confronto direto (Fase 1).

import type { MatchResult, StandingRow } from '../types.js';

interface MutableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export function computeStandings(
  clubIds: readonly string[],
  matches: readonly MatchResult[],
): StandingRow[] {
  const rows = new Map<string, MutableRow>();
  for (const id of clubIds) {
    rows.set(id, blankRow(id));
  }
  for (const m of matches) {
    applySide(rows, m.homeId, m.homeGoals, m.awayGoals);
    applySide(rows, m.awayId, m.awayGoals, m.homeGoals);
  }
  return [...rows.values()].map(freeze).sort(compareRows);
}

function applySide(rows: Map<string, MutableRow>, id: string, gf: number, ga: number): void {
  const row = rows.get(id);
  if (row === undefined) {
    return;
  }
  row.played++;
  row.goalsFor += gf;
  row.goalsAgainst += ga;
  if (gf > ga) {
    row.won++;
    row.points += 3;
  } else if (gf === ga) {
    row.drawn++;
    row.points += 1;
  } else {
    row.lost++;
  }
}

function blankRow(clubId: string): MutableRow {
  return {
    clubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
}

function freeze(r: MutableRow): StandingRow {
  return { ...r, goalDiff: r.goalsFor - r.goalsAgainst };
}

function compareRows(a: StandingRow, b: StandingRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.clubId < b.clubId ? -1 : a.clubId > b.clubId ? 1 : 0;
}
