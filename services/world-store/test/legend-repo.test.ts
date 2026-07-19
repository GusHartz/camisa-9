// Hall of Fame + gatilho do Regen (SPEC-022) contra Postgres REAL. Prova: o humano ENTRA aos 17
// (não herda a idade do NPC), `requestRegen` trava idade ≥25, `readRegenEligible` casa o gatilho
// (≥42 forçado / requested+≥25 voluntário), o Hall of Fame arquiva idempotente, e `vacateSlot`
// reverte a vaga a NPC. Gated por DATABASE_URL. Serial + reseed por teste.
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WORLD, type WorldState } from '@camisa-9/world-engine';
import { createDb, type DbHandle } from '../src/client.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../src/schema/world.js';
import { tickProgress } from '../src/schema/tick-progress.js';
import { legend } from '../src/schema/legend.js';
import { publishedRound } from '../src/schema/round.js';
import { season } from '../src/schema/season.js';
import { turnoverReport } from '../src/schema/turnover.js';
import { readWorld, writeWorld } from '../src/store/world-repo.js';
import {
  occupyNpcSlot,
  readOccupation,
  requestRegen,
  vacateSlot,
} from '../src/store/occupation-repo.js';
import { archiveLegend, readLegends, readRegenEligible } from '../src/store/legend-repo.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'regen-teste';
const H1 = '00000000-0000-0000-0000-0000000000b1';

describe.skipIf(!DB_URL)(
  'legend-repo — Hall of Fame + gatilho do Regen contra Postgres real',
  () => {
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
      await wipeAll();
      await writeWorld(handle.db, SEED);
    });

    async function wipeAll(): Promise<void> {
      await handle.db.delete(legend);
      await handle.db.delete(worldOccupation);
      await handle.db.delete(turnoverReport);
      await handle.db.delete(publishedRound);
      await handle.db.delete(season);
      await handle.db.delete(athlete);
      await handle.db.delete(club);
      await handle.db.delete(league);
      await handle.db.delete(worldTier);
      await handle.db.delete(tickProgress);
      await handle.db.delete(world);
    }

    function entryClubId(w: WorldState): string {
      return w.tiers[w.tiers.length - 1]!.leagues[0]!.clubs[0]!.id;
    }

    /** Ocupa uma vaga GK na entrada com o humano H1. */
    async function occupy(humanId = H1): Promise<string> {
      const clubId = entryClubId((await readWorld(handle.db, SEED))!);
      const res = await occupyNpcSlot(handle.db, {
        worldSeed: SEED,
        clubId,
        position: 'GK',
        humanAthleteId: humanId,
        humanName: 'Zé',
        ability: 40,
      });
      return res.worldAthleteId;
    }

    async function setAge(worldAthleteId: string, age: number): Promise<void> {
      await handle.db.update(athlete).set({ age }).where(eq(athlete.id, worldAthleteId));
    }

    it('o humano ENTRA aos 17 (não herda a idade do NPC substituído)', async () => {
      const id = await occupy();
      const rows = await handle.db
        .select({ age: athlete.age })
        .from(athlete)
        .where(eq(athlete.id, id));
      expect(rows[0]?.age).toBe(WORLD.youthAge); // 17
    });

    it('requestRegen: rejeita < 25, liga a flag em >= 25', async () => {
      const id = await occupy(); // idade 17
      await expect(requestRegen(handle.db, SEED, H1)).rejects.toThrow(/idade insuficiente/i);
      await setAge(id, 30);
      await requestRegen(handle.db, SEED, H1); // ok
      const rows = await handle.db
        .select({ f: worldOccupation.regenRequested })
        .from(worldOccupation)
        .where(eq(worldOccupation.humanAthleteId, H1));
      expect(rows[0]?.f).toBe(true);
    });

    it('readRegenEligible: FORÇADO aos >= 42 (sem pedir)', async () => {
      const id = await occupy();
      await setAge(id, 41);
      expect(await readRegenEligible(handle.db, SEED)).toHaveLength(0); // 41 < 42, sem pedido
      await setAge(id, 42);
      const elig = await readRegenEligible(handle.db, SEED);
      expect(elig).toHaveLength(1);
      expect(elig[0]?.humanAthleteId).toBe(H1);
      expect(elig[0]?.age).toBe(42);
    });

    it('readRegenEligible: VOLUNTÁRIO só com a flag E idade >= 25', async () => {
      const id = await occupy();
      await setAge(id, 30);
      expect(await readRegenEligible(handle.db, SEED)).toHaveLength(0); // 30, mas sem pedido
      await requestRegen(handle.db, SEED, H1);
      expect(await readRegenEligible(handle.db, SEED)).toHaveLength(1); // pediu + >= 25
    });

    it('Hall of Fame: archiveLegend grava e readLegends lê; re-arquivar é idempotente', async () => {
      const input = {
        worldSeed: SEED,
        humanAthleteId: H1,
        seasonEnded: '2030',
        humanName: 'Lenda Zé',
        clubId: 'clube-000',
        position: 'GK',
        ability: 88,
        age: 42,
        legacyPoints: 25,
      };
      await archiveLegend(handle.db, input);
      await archiveLegend(handle.db, input); // idempotente (mesma PK)
      const legends = await readLegends(handle.db, SEED);
      expect(legends).toHaveLength(1);
      expect(legends[0]).toMatchObject({ humanName: 'Lenda Zé', legacyPoints: 25, age: 42 });
    });

    it('vacateSlot: reverte a vaga a NPC (ocupação some, is_human=false)', async () => {
      const id = await occupy();
      await vacateSlot(handle.db, SEED, id);
      expect(await readOccupation(handle.db, SEED, H1)).toBeNull();
      const rows = await handle.db
        .select({ h: athlete.isHuman })
        .from(athlete)
        .where(eq(athlete.id, id));
      expect(rows[0]?.h).toBe(false);
      await vacateSlot(handle.db, SEED, id); // idempotente
    });
  },
);
