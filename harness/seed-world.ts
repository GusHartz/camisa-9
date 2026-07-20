// Script de OPERADOR (SPEC-039) — semeia o mundo de uma seed no banco.
//
// É o PASSO ZERO de qualquer banco novo: sem mundo, `create-account.ts` falha por FK
// (`waiting_list.world_seed` → `world.seed`) e o tick devolve `sem_ancora` para sempre. Até esta
// SPEC, semear só acontecia dentro de testes — não havia caminho de operação.
//
// ⚠️ NÃO SOBRESCREVE (a regra vive em `ops.ts:seedWorldOnce`, onde é testada).
//
// Uso:  SEED=<string> DATABASE_URL=… npx tsx harness/seed-world.ts
import { createDb } from '@camisa-9/world-store';
import { seedWorldOnce } from './ops.js';

async function main(): Promise<void> {
  const seed = process.env.SEED;
  const dbUrl = process.env.DATABASE_URL;
  if (!seed || !dbUrl) throw new Error('SEED e DATABASE_URL são obrigatórios');

  const { db, pool } = createDb(dbUrl);
  try {
    const r = await seedWorldOnce(db, seed);
    console.log(
      `mundo semeado: seed="${seed}" temporada=${r.seasonId} — ` +
        `${r.tiers} divisões, ${r.leagues} ligas, ${r.clubs} clubes.`,
    );
    console.log(
      `próximo passo: SEED="${seed}" START_DATE=YYYY-MM-DD npx tsx harness/set-anchor.ts`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('falha:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
