// A BORDA de produção (SPEC-030) — o ÚNICO lugar que lê o relógio (`Date.now()`; o guardrail permite,
// services/* está fora do escopo). Lê a seed/DATABASE_URL da env, cria os dois handles, roda o tick do
// dia e fecha. O deploy (cron) só precisa invocar `node main.js` 1×/dia — o agendamento em si é a
// próxima fatia (infra). Nada abaixo daqui lê relógio: o `epochMs` é injetado no tick (testável).
import { createDb as createWorldDb } from '@camisa-9/world-store';
import { createDb as createPlayerDb } from '@camisa-9/player-store';
import { runDailyTick } from './daily-tick.js';

/** Roda UMA passada do tick (o cron invoca 1×/dia). Lê o relógio aqui — só aqui. */
export async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  const seed = process.env.WORLD_SEED;
  if (!dbUrl || !seed) throw new Error('DATABASE_URL e WORLD_SEED são obrigatórios');
  const worldHandle = createWorldDb(dbUrl);
  const playerHandle = createPlayerDb(dbUrl);
  try {
    const r = await runDailyTick(worldHandle.db, playerHandle.db, seed, Date.now());
    console.log(
      `tick: day=${r.dayIndex} status=${r.roundStatus} humanos=${r.humans} pagos=${r.accrued} ` +
        `decisões=${r.decisions} recuperados=${r.recovered} regen=${r.regenerated} ` +
        `vacancy=${r.vacancy.frozen}/${r.vacancy.reverted}`,
    );
  } finally {
    await worldHandle.pool.end();
    await playerHandle.pool.end();
  }
}

// Auto-execução como entrypoint (o cron chama `node main.js`). Nada importa este arquivo (o barrel
// exporta só `runDailyTick`), então isto NÃO dispara em typecheck/test.
main().catch((err) => {
  console.error('tick: falhou —', err instanceof Error ? err.message : 'erro'); // OP-11: genérico
  process.exitCode = 1;
});
