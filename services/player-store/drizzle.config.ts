// Config do drizzle-kit (SPEC-016) — gera a migration versionada do player-store a partir
// do schema. A APLICAÇÃO é via `src/migrate.ts` (com migrationsSchema `player`, para o
// tracking NÃO colidir com o do world-store no mesmo Postgres).
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/schema/account.ts', './src/schema/team.ts', './src/schema/athlete.ts'],
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/camisa9_dev',
  },
});
