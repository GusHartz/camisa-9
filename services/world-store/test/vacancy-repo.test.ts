// Congelamento de vaga (SPEC-023) contra Postgres REAL: a máquina de estados de retenção. `markActive`
// grava a atividade (e descongela); `runVacancyPass` congela o inativo (e-mail 1× via seam), reverte
// a NPC aos 30 dias (reusa `vacateSlot`), pula o não-rastreado; idempotente. O "benched" preserva a
// carreira (fatia só-mundo). Gated por DATABASE_URL. Serial + reseed por teste.
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorldState } from '@camisa-9/world-engine';
import { createDb, type DbHandle } from '../src/client.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../src/schema/world.js';
import { tickProgress } from '../src/schema/tick-progress.js';
import { legend } from '../src/schema/legend.js';
import { publishedRound } from '../src/schema/round.js';
import { season } from '../src/schema/season.js';
import { turnoverReport } from '../src/schema/turnover.js';
import { readWorld, writeWorld } from '../src/store/world-repo.js';
import { occupyNpcSlot, readOccupation } from '../src/store/occupation-repo.js';
import { markActive, readVacancyState, runVacancyPass } from '../src/store/vacancy-repo.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'vacancy-teste';
const H1 = '00000000-0000-0000-0000-0000000000c1';
const H2 = '00000000-0000-0000-0000-0000000000c2';

describe.skipIf(!DB_URL)('vacancy-repo — congelamento de vaga contra Postgres real', () => {
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

  /** Ocupa uma vaga GK na entrada com um humano (last_active_day nasce nulo). O clube de entrada tem
   *  2 GK, então H1 e H2 podem coexistir em vagas distintas do MESMO clube. */
  async function occupy(humanAthleteId = H1): Promise<string> {
    const clubId = entryClubId((await readWorld(handle.db, SEED))!);
    const res = await occupyNpcSlot(handle.db, {
      worldSeed: SEED,
      clubId,
      position: 'GK',
      humanAthleteId,
      humanName: 'Zé',
      ability: 40,
    });
    return res.worldAthleteId;
  }

  it('markActive grava last_active_day e a vaga nasce ativa (não-congelada)', async () => {
    await occupy();
    const res = await markActive(handle.db, SEED, H1, 100);
    expect(res.thawed).toBe(false); // não estava congelada
    expect(await readVacancyState(handle.db, SEED, H1)).toEqual({
      lastActiveDay: 100,
      frozenSinceDay: null,
    });
  });

  it('congela no 1º dia inativo; rodar de novo NÃO re-dispara o e-mail', async () => {
    await occupy();
    await markActive(handle.db, SEED, H1, 100);
    const emails: string[] = [];
    const hooks = { onFreeze: (id: string) => void emails.push(id) };
    const r1 = await runVacancyPass(handle.db, SEED, 101, hooks); // inativo 1 → congela
    expect(r1.frozen).toBe(1);
    expect(emails).toEqual([H1]);
    expect((await readVacancyState(handle.db, SEED, H1))?.frozenSinceDay).toBe(101);
    const r2 = await runVacancyPass(handle.db, SEED, 102, hooks); // segue inativo, JÁ congelada
    expect(r2.frozen).toBe(0);
    expect(emails).toEqual([H1]); // e-mail 1× só (frozen_since_day marca a transição)
  });

  it('descongela ao ficar ativo de novo (markActive) e dispara onThaw', async () => {
    await occupy();
    await markActive(handle.db, SEED, H1, 100);
    await runVacancyPass(handle.db, SEED, 105); // congela
    const thaws: string[] = [];
    const { thawed } = await markActive(handle.db, SEED, H1, 106, (id) => void thaws.push(id));
    expect(thawed).toBe(true);
    expect(thaws).toEqual([H1]);
    expect(await readVacancyState(handle.db, SEED, H1)).toEqual({
      lastActiveDay: 106,
      frozenSinceDay: null,
    });
  });

  it('reverte a NPC aos 30 dias de inatividade (via vacateSlot)', async () => {
    const id = await occupy();
    await markActive(handle.db, SEED, H1, 100);
    const r = await runVacancyPass(handle.db, SEED, 130); // inativo 30 → reverte
    expect(r.reverted).toBe(1);
    expect(await readOccupation(handle.db, SEED, H1)).toBeNull(); // a vaga sumiu
    const rows = await handle.db
      .select({ h: athlete.isHuman })
      .from(athlete)
      .where(eq(athlete.id, id));
    expect(rows[0]?.h).toBe(false); // reverteu a NPC (benched)
  });

  it('não rastreado (last_active_day nulo) é pulado — nunca congela nem reverte', async () => {
    await occupy(); // sem markActive → last_active_day nulo
    const r = await runVacancyPass(handle.db, SEED, 10_000); // dia alto, mas não rastreado
    expect(r).toEqual({ frozen: 0, reverted: 0 });
    expect(await readOccupation(handle.db, SEED, H1)).toBeTruthy(); // continua no mundo
    expect((await readVacancyState(handle.db, SEED, H1))?.frozenSinceDay).toBeNull();
  });

  it('idempotência: rodar o passe 2× no mesmo dia não duplica congelamento nem e-mail', async () => {
    await occupy();
    await markActive(handle.db, SEED, H1, 100);
    const emails: string[] = [];
    const hooks = { onFreeze: (id: string) => void emails.push(id) };
    await runVacancyPass(handle.db, SEED, 105, hooks);
    await runVacancyPass(handle.db, SEED, 105, hooks); // mesmo dia, 2×
    expect(emails).toEqual([H1]); // congelou 1×
    expect((await readVacancyState(handle.db, SEED, H1))?.frozenSinceDay).toBe(105);
  });

  it('onFreeze que lança faz ROLLBACK do congelamento → o próximo passe retenta', async () => {
    await occupy();
    await markActive(handle.db, SEED, H1, 100);
    await runVacancyPass(handle.db, SEED, 101, {
      onFreeze: () => {
        throw new Error('smtp caiu');
      },
    });
    // a tx do freeze reverteu (o hook lançou) → NÃO ficou congelada (e-mail não é perdido em silêncio)
    expect((await readVacancyState(handle.db, SEED, H1))?.frozenSinceDay).toBeNull();
    const emails: string[] = [];
    await runVacancyPass(handle.db, SEED, 102, { onFreeze: (id) => void emails.push(id) });
    expect(emails).toEqual([H1]); // retentou e enviou
    expect((await readVacancyState(handle.db, SEED, H1))?.frozenSinceDay).toBe(102);
  });

  it('limite da janela: inativo 29 congela (não reverte); inativo 30 reverte', async () => {
    await occupy();
    await markActive(handle.db, SEED, H1, 100);
    expect(await runVacancyPass(handle.db, SEED, 129)).toEqual({ frozen: 1, reverted: 0 }); // 29
    expect(await readOccupation(handle.db, SEED, H1)).toBeTruthy(); // ainda no mundo
    expect((await readVacancyState(handle.db, SEED, H1))?.frozenSinceDay).toBe(129);
    expect(await runVacancyPass(handle.db, SEED, 130)).toEqual({ frozen: 0, reverted: 1 }); // 30
    expect(await readOccupation(handle.db, SEED, H1)).toBeNull(); // reverteu
  });

  it('anti-TOCTOU: um markActive que chega no dia do revert NÃO expulsa o humano', async () => {
    const id = await occupy();
    await markActive(handle.db, SEED, H1, 100);
    // simula o humano voltando exatamente no dia 130 (antes do passe reverter): fica ativo de novo
    await markActive(handle.db, SEED, H1, 130);
    const r = await runVacancyPass(handle.db, SEED, 130); // inativo 0 (re-checado) → NÃO reverte
    expect(r).toEqual({ frozen: 0, reverted: 0 });
    expect(await readOccupation(handle.db, SEED, H1)).toBeTruthy(); // sobreviveu (não expulso)
    const rows = await handle.db
      .select({ h: athlete.isHuman })
      .from(athlete)
      .where(eq(athlete.id, id));
    expect(rows[0]?.h).toBe(true);
  });

  it('multi-ocupante: congela só o inativo; o ativo fica intacto e o report conta certo', async () => {
    await occupy(H1);
    await occupy(H2);
    await markActive(handle.db, SEED, H1, 100); // inativo
    await markActive(handle.db, SEED, H2, 106); // ativo hoje
    const r = await runVacancyPass(handle.db, SEED, 106);
    expect(r).toEqual({ frozen: 1, reverted: 0 });
    expect((await readVacancyState(handle.db, SEED, H1))?.frozenSinceDay).toBe(106);
    expect((await readVacancyState(handle.db, SEED, H2))?.frozenSinceDay).toBeNull();
  });

  it('isolamento por candidato: um onFreeze que lança não impede o outro de congelar', async () => {
    await occupy(H1);
    await occupy(H2);
    await markActive(handle.db, SEED, H1, 100);
    await markActive(handle.db, SEED, H2, 100);
    const frozen: string[] = [];
    await runVacancyPass(handle.db, SEED, 105, {
      onFreeze: (id) => {
        if (id === H1) throw new Error('smtp');
        frozen.push(id);
      },
    });
    expect(frozen).toEqual([H2]); // 1 falha não aborta o passe
    expect((await readVacancyState(handle.db, SEED, H1))?.frozenSinceDay).toBeNull(); // rolled back
    expect((await readVacancyState(handle.db, SEED, H2))?.frozenSinceDay).toBe(105); // congelou
  });

  it('markActive num humano que NÃO ocupa vaga é no-op silencioso', async () => {
    const ghost = '00000000-0000-0000-0000-0000000000ff';
    const res = await markActive(handle.db, SEED, ghost, 100);
    expect(res.thawed).toBe(false);
    expect(await readVacancyState(handle.db, SEED, ghost)).toBeNull();
  });
});
