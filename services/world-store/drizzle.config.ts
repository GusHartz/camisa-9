// Config do drizzle-kit (SPEC-013). Usada em dev p/ GERAR a migration versionada
// a partir do schema (`npm run db:generate -w services/world-store`). A APLICAÇÃO
// das migrations é via `src/migrate.ts` (drizzle-orm migrator), não pelo kit.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/schema/world.ts',
    './src/schema/round.ts',
    './src/schema/season.ts',
    './src/schema/turnover.ts',
    './src/schema/legend.ts',
    './src/schema/tick-progress.ts',
  ],
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Só usado por comandos que tocam o banco (push/studio). `generate` não precisa.
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/camisa9_dev',
  },
});
