// Aplicador de migrations do player-store (SPEC-016). O tracking vive num schema PRÓPRIO
// (`drizzle_player`) — isola do world-store (default `drizzle.__drizzle_migrations`) SEM
// colidir com o schema `player` das tabelas (que a própria migration 0000 cria).
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida — configure o ambiente antes de migrar.');
    process.exitCode = 1;
    return;
  }
  const { db, pool } = createDb(url);
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)),
      migrationsSchema: 'drizzle_player',
    });
    console.log('migrations (player) aplicadas com sucesso.');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // OP-11: mensagem genérica, sem stack/SQL.
  console.error('falha ao aplicar migrations:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
