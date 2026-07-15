// Harness da BORDA IMPURA (SPEC-002): roda uma temporada do motor determinístico
// e reporta custo de parede. Aqui — e SÓ aqui — vivem relógio real e env:
// o guardrail de determinismo vale para `packages/*/src`, não para o harness.
// Uso: SEED=<string> npm run sim
import { DEMO_LEAGUE, simulateSeason, type SeasonResult } from '@camisa-9/world-engine';

function requireSeed(): string {
  const seed = process.env.SEED;
  if (seed === undefined || seed.trim() === '') {
    console.error('ERRO: defina SEED. Ex.: SEED=demo-001 npm run sim');
    process.exit(1);
  }
  return seed;
}

function printTop(result: SeasonResult): void {
  console.log('Pos  Clube       P   J   V   E   D   GP  GC  SG');
  result.table.slice(0, 5).forEach((row, i) => {
    const cols = [
      String(i + 1).padStart(2),
      row.clubId.padEnd(10),
      String(row.points).padStart(2),
      String(row.played).padStart(2),
      String(row.won).padStart(2),
      String(row.drawn).padStart(2),
      String(row.lost).padStart(2),
      String(row.goalsFor).padStart(3),
      String(row.goalsAgainst).padStart(3),
      String(row.goalDiff).padStart(3),
    ];
    console.log(`  ${cols.join(' ')}`);
  });
}

function main(): void {
  const seed = requireSeed();
  const start = Date.now();
  const result = simulateSeason(DEMO_LEAGUE, seed);
  const elapsedMs = Date.now() - start;

  const matches = result.rounds.flatMap((r) => r.matches);
  const goals = matches.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0);
  const champion = result.table[0];

  console.log(`\n=== ${result.leagueId} / ${result.seasonId} — seed="${seed}" ===`);
  console.log(
    `${result.rounds.length} rodadas, ${matches.length} partidas, ${goals} gols ` +
      `(${(goals / matches.length).toFixed(2)}/jogo)`,
  );
  console.log(`campeão: ${champion?.clubId ?? '—'} (${champion?.points ?? 0} pts)\n`);
  printTop(result);
  console.log(`\nwall-time: ${elapsedMs} ms\n`);
}

main();
