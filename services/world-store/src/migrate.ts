// Aplicador de migrations (SPEC-013). Roda via `tsx src/migrate.ts` (dev) e no CI,
// após `docker compose up`. Aplica os .sql versionados em `src/migrations/`. A
// `DATABASE_URL` é server-only (OP-12) — lida do ambiente, nunca hardcoded.
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, pickMigrationUrl } from './client.js';

async function main(): Promise<void> {
  // SPEC-035: migrations no endpoint DIRECT (DATABASE_URL_UNPOOLED), fora do PgBouncer.
  const url = pickMigrationUrl(process.env);
  if (!url) {
    console.error('DATABASE_URL não definida — configure o ambiente antes de migrar.');
    process.exitCode = 1;
    return;
  }
  const { db, pool } = createDb(url);
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)),
    });
    console.log('migrations aplicadas com sucesso.');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // OP-11: mensagem genérica, sem stack/SQL (é uma CLI de ops, mas não vaza interno).
  console.error('falha ao aplicar migrations:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
