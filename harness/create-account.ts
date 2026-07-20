// Script de OPERADOR (SPEC-037) — cria uma conta + atleta e o admite no mundo.
//
// Por que isto existe: `POST /v1/auth/signup` ficou FORA da fatia (Decisão 3). Um endpoint
// não-autenticado que ESCREVE consome vagas NPC FINITAS via `admitOrEnqueue` — cadastro em massa
// por bot seria dano irreversível ao pilar da escassez, sem reversão barata. O cadastro público
// volta como card próprio, com invite-gating desenhado de propósito. Enquanto isso, as contas do
// beta nascem por aqui: sem este script, a fatia entregaria um servidor em que ninguém entra.
//
// Uso:
//   DATABASE_URL=… WORLD_SEED=… npx tsx harness/create-account.ts <email> <senha> <nome> <POS>
//   POS ∈ GK | DEF | MID | FWD
import { createAthlete, isPosition } from '@camisa-9/player';
import { createAccountWithAthlete, createDb as createPlayerDb } from '@camisa-9/player-store';
import { createDb as createWorldDb, readWorld } from '@camisa-9/world-store';
import { admitOrEnqueue } from '@camisa-9/world-entry';

async function main(): Promise<void> {
  const [email, password, name, position] = process.argv.slice(2);
  const dbUrl = process.env.DATABASE_URL;
  const worldSeed = process.env.WORLD_SEED;
  if (!dbUrl || !worldSeed) throw new Error('DATABASE_URL e WORLD_SEED são obrigatórios');
  if (!email || !password || !name || !position) {
    throw new Error('uso: create-account.ts <email> <senha> <nome> <GK|DEF|MID|FWD>');
  }
  if (!isPosition(position)) throw new Error('posição inválida (GK|DEF|MID|FWD)');

  // Todo atleta nasce com o mesmo pool (soma 136 = overall 34, o fundo da banda de várzea) — a
  // calibração de justiça da SPEC-016. O operador não escolhe atributos.
  const drafted = createAthlete({
    name,
    position,
    appearance: { skinTone: 0, hairStyle: 0, hairColor: 0 },
    attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
  });
  if (!drafted.ok) throw new Error(`atleta inválido: ${drafted.reason}`);

  const player = createPlayerDb(dbUrl);
  const world = createWorldDb(dbUrl);
  try {
    // ⚠️ Pré-checagem (SPEC-039): sem mundo semeado, o `admitOrEnqueue` estoura no INSERT da
    // waiting_list (FK `world_seed` → `world.seed`) e o operador recebia SQL cru, sem pista do que
    // fazer — e com a CONTA JÁ CRIADA, porque a falha vinha depois. Checar aqui falha cedo, com o
    // comando seguinte na mensagem, e não deixa conta órfã para trás.
    if (!(await readWorld(world.db, worldSeed))) {
      throw new Error(
        `não existe mundo semeado para a seed "${worldSeed}" — nenhuma conta foi criada.\n` +
          `  Rode primeiro: SEED="${worldSeed}" npx tsx harness/seed-world.ts`,
      );
    }
    const created = await createAccountWithAthlete(player.db, {
      email,
      password,
      draft: drafted.value,
    });
    const { admitted } = await admitOrEnqueue(world.db, player.db, {
      humanAthleteId: created.athleteId,
      worldSeed,
    });
    console.log(
      `conta criada: account=${created.accountId} athlete=${created.athleteId} ` +
        `— ${admitted ? 'ADMITIDO no mundo' : 'na FILA de espera'}`,
    );
  } finally {
    await player.pool.end();
    await world.pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('falha:', err instanceof Error ? err.message : String(err)); // OP-11: genérico
  process.exitCode = 1;
});
