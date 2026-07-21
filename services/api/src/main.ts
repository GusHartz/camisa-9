// A BORDA da API (SPEC-037) — a SEGUNDA e última borda de relógio do projeto (a primeira é o
// `scheduler/src/main.ts`). É o único lugar deste serviço que lê `Date.now()`; tudo abaixo recebe
// `epochMs` injetado via `RouteCtx`, e por isso é testável sem relógio nem sleep.
//
// Diferente do scheduler (que roda um tick e sai), aqui o processo fica VIVO escutando a porta —
// é um web service, não um cron job. Ver a seção "API (web service)" no runbook de deploy.
import { createDb } from '@camisa-9/player-store';
import { createDb as createWorldDb } from '@camisa-9/world-store';
import { createApiServer } from './server.js';
import { trustProxyHops } from './http/client-ip.js';

export async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL é obrigatória');
  // A SPEC-038 leu o mundo: `WORLD_SEED` é obrigatória junto da URL (falha rápido, não meio-de-pé).
  const worldSeed = process.env.WORLD_SEED;
  if (!worldSeed) throw new Error('WORLD_SEED é obrigatória');
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const { db, pool } = createDb(dbUrl);
  const { db: worldDb, pool: worldPool } = createWorldDb(dbUrl);
  const server = createApiServer({
    db,
    worldDb,
    worldSeed,
    now: Date.now,
    trustProxyHops: trustProxyHops(process.env),
  });

  const shutdown = (signal: string): void => {
    console.log(`api: ${signal} — encerrando`);
    server.close(() => {
      // Encerra os DOIS pools (player + world) antes de sair.
      void Promise.all([pool.end(), worldPool.end()]).then(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  // Uma promise rejeitada solta não pode derrubar o servidor inteiro (OP-11: log genérico).
  process.on('unhandledRejection', (reason) => {
    console.error('api: rejeição não tratada —', reason instanceof Error ? reason.message : 'erro');
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`api: escutando na porta ${port}`);
}

// Auto-execução como entrypoint (`npm run start -w services/api`). Nada importa este arquivo — o
// barrel exporta só `createApiServer` —, então isto NÃO dispara em typecheck/test.
main().catch((err) => {
  console.error('api: falhou ao subir —', err instanceof Error ? err.message : 'erro'); // OP-11
  process.exitCode = 1;
});
