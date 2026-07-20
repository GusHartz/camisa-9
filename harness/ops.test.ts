// Os scripts de operador contra Postgres REAL (SPEC-039, critérios 1, 2 e 4). Gated por
// DATABASE_URL. O critério 2 é o que importa: semear duas vezes NÃO pode destruir o mundo.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  createDb,
  readSeasonAnchor,
  readWorld,
  schema,
  type DbHandle,
} from '@camisa-9/world-store';
import { anchorSeason, OpsError, seedWorldOnce } from './ops.js';
import { dayIndexFromDate } from './ops-date.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'ops-spec-039';

describe.skipIf(!DB_URL)('scripts de ops contra Postgres real', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = createDb(DB_URL as string);
    await migrate(handle.db, {
      migrationsFolder: fileURLToPath(
        new URL('../services/world-store/src/migrations', import.meta.url),
      ),
    });
  });

  afterAll(async () => {
    if (handle) await handle.pool.end();
  });

  beforeEach(async () => {
    // Limpeza em ordem de FK, restrita à seed desta suíte (as outras suítes dividem o mesmo banco).
    await handle.db.delete(schema.waitingList);
    await handle.db.delete(schema.worldOccupation);
    await handle.db.delete(schema.publishedRound);
    await handle.db.delete(schema.season);
    await handle.db.delete(schema.athlete);
    await handle.db.delete(schema.club);
    await handle.db.delete(schema.league);
    await handle.db.delete(schema.worldTier);
    await handle.db.delete(schema.tickProgress);
    await handle.db.delete(schema.world);
  });

  describe('seedWorldOnce (critérios 1 e 2)', () => {
    it('semeia num banco limpo e reporta a topologia', async () => {
      const r = await seedWorldOnce(handle.db, SEED);
      expect(r.tiers).toBeGreaterThan(0);
      expect(r.clubs).toBe(r.leagues * 20); // ligas de 20 clubes
      expect(await readWorld(handle.db, SEED)).not.toBeNull();
    });

    it('⚠️ semear DUAS VEZES falha e o mundo anterior fica INTACTO', async () => {
      await seedWorldOnce(handle.db, SEED);
      const antes = (await readWorld(handle.db, SEED))!;
      const clubesAntes = await handle.db.select().from(schema.club);
      const atletasAntes = await handle.db.select().from(schema.athlete);

      await expect(seedWorldOnce(handle.db, SEED)).rejects.toThrow(OpsError);

      // Nada foi escrito: o mundo é o MESMO, não um novo por cima.
      const depois = (await readWorld(handle.db, SEED))!;
      expect(depois.seasonId).toBe(antes.seasonId);
      expect(await handle.db.select().from(schema.club)).toHaveLength(clubesAntes.length);
      expect(await handle.db.select().from(schema.athlete)).toHaveLength(atletasAntes.length);
      expect(depois).toEqual(antes);
    });

    it('a recusa nomeia a seed e diz que nada foi escrito', async () => {
      await seedWorldOnce(handle.db, SEED);
      await expect(seedWorldOnce(handle.db, SEED)).rejects.toThrow(/nada foi escrito/);
      await expect(seedWorldOnce(handle.db, SEED)).rejects.toThrow(SEED);
    });
  });

  describe('anchorSeason (critério 4)', () => {
    it('sem mundo, falha apontando o seed-world — e não grava nada', async () => {
      await expect(anchorSeason(handle.db, SEED, '2026-08-01')).rejects.toThrow(/seed-world/);
      expect(await handle.db.select().from(schema.season)).toHaveLength(0);
    });

    it('deriva o seasonId do mundo e grava o dayIndex da data', async () => {
      await seedWorldOnce(handle.db, SEED);
      const mundo = (await readWorld(handle.db, SEED))!;
      const r = await anchorSeason(handle.db, SEED, '2026-08-01');

      expect(r.seasonId).toBe(mundo.seasonId); // NUNCA foi informado pelo operador
      expect(r.startDayIndex).toBe(dayIndexFromDate('2026-08-01'));
      expect(await readSeasonAnchor(handle.db, SEED, mundo.seasonId)).toBe(r.startDayIndex);
    });

    it('data inválida é recusada ANTES de tocar o banco', async () => {
      await seedWorldOnce(handle.db, SEED);
      await expect(anchorSeason(handle.db, SEED, '2026-02-30')).rejects.toThrow();
      expect(await handle.db.select().from(schema.season)).toHaveLength(0);
    });
  });
});
