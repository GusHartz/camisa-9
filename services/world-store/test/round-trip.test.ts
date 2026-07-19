// Âncora determinística da Fatia 1 (SPEC-013): seedWorld → writeWorld → readWorld
// reproduz o MESMO WorldState (deep-equal) e o MESMO worldHash do golden do
// world-engine — o snapshot não deriva um mundo diferente. + prova de atomicidade
// (uma gravação que falha no meio não deixa mundo parcial).
//
// Gated por DATABASE_URL: sem Postgres (dev sem `docker compose up`), a suíte é
// PULADA — `npm test` segue verde. No CI, o service container define a URL e roda.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedWorld, worldHash, type WorldState } from '@camisa-9/world-engine';
import { createDb, type DbHandle } from '../src/client.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../src/schema/world.js';
import { tickProgress } from '../src/schema/tick-progress.js';
import { season } from '../src/schema/season.js';
import { readWorld, writeWorld, writeWorldState } from '../src/store/world-repo.js';

const DB_URL = process.env.DATABASE_URL;

interface Golden {
  readonly hashes: readonly string[];
}
const golden = JSON.parse(
  readFileSync(
    new URL('../../../packages/world-engine/src/__fixtures__/world.golden.json', import.meta.url),
    'utf8',
  ),
) as Golden;

describe.skipIf(!DB_URL)('world-store — round-trip determinístico do snapshot', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = createDb(DB_URL as string);
    await migrate(handle.db, {
      migrationsFolder: fileURLToPath(new URL('../src/migrations', import.meta.url)),
    });
  });

  afterAll(async () => {
    if (handle) await handle.pool.end();
  });

  beforeEach(async () => {
    // Ordem inversa das FKs. `season` (SPEC-015) referencia `world.seed` → apagar antes.
    // `world_occupation` (SPEC-020) referencia `athlete` → apagar antes do atleta.
    await handle.db.delete(worldOccupation);
    await handle.db.delete(season);
    await handle.db.delete(athlete);
    await handle.db.delete(club);
    await handle.db.delete(league);
    await handle.db.delete(worldTier);
    await handle.db.delete(tickProgress);
    await handle.db.delete(world);
  });

  it('reconstrói o WorldState idêntico ao da memória e casa com o golden hash', async () => {
    await writeWorld(handle.db, 'decada');
    const back = await readWorld(handle.db, 'decada');

    expect(back).toEqual(seedWorld('decada'));
    expect(back).not.toBeNull();
    expect(worldHash(back as WorldState)).toBe(golden.hashes[0]);
  });

  it('atomicidade: gravação que falha no meio não deixa mundo parcial', async () => {
    const corrupt = withDuplicateClubId(seedWorld('rollback'));
    await expect(writeWorldState(handle.db, 'rollback', corrupt)).rejects.toThrow();

    // Nada persistido — a transação reverteu inclusive a raiz `world`.
    expect(await readWorld(handle.db, 'rollback')).toBeNull();
  });
});

/** Duplica o id do 2º clube = 1º → viola a PK no INSERT de clubs (falha no meio da tx). */
function withDuplicateClubId(w: WorldState): WorldState {
  const t0 = w.tiers[0]!;
  const l0 = t0.leagues[0]!;
  const first = l0.clubs[0]!;
  const second = l0.clubs[1]!;
  const dup = { ...second, id: first.id };
  const clubs = [first, dup, ...l0.clubs.slice(2)];
  const league0 = { ...l0, clubs };
  const tier0 = { ...t0, leagues: [league0, ...t0.leagues.slice(1)] };
  return { ...w, tiers: [tier0, ...w.tiers.slice(1)] };
}
