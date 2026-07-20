// Script de OPERADOR (SPEC-039) — ancora a temporada: grava o dia da RODADA 1.
//
// Sem a âncora, `runDailyTick` devolve `sem_ancora` para sempre — o mundo existe mas nunca joga.
// É o dado que o snapshot não tem e que só um humano pode decidir: quando esta temporada começa.
//
// ⚠️ O operador informa uma DATA, nunca o `dayIndex`; a conversão delega ao `resolveSlot` do ENGINE
// (`ops-date.ts`). O `seasonId` é DERIVADO do mundo (`ops.ts:anchorSeason`), nunca perguntado.
//
// Uso:  SEED=<string> START_DATE=YYYY-MM-DD DATABASE_URL=… npx tsx harness/set-anchor.ts
import { createDb } from '@camisa-9/world-store';
import { anchorSeason } from './ops.js';

async function main(): Promise<void> {
  const seed = process.env.SEED;
  const startDate = process.env.START_DATE;
  const dbUrl = process.env.DATABASE_URL;
  if (!seed || !startDate || !dbUrl) {
    throw new Error('SEED, START_DATE (YYYY-MM-DD) e DATABASE_URL são obrigatórios');
  }

  const { db, pool } = createDb(dbUrl);
  try {
    const r = await anchorSeason(db, seed, startDate);
    console.log(
      `âncora gravada: seed="${seed}" temporada=${r.seasonId} — ` +
        `rodada 1 em ${r.startDate} (dayIndex=${r.startDayIndex}).`,
    );
    console.log(
      'confira a data acima: ancorar no dia errado desloca o calendário inteiro do mundo.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('falha:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
