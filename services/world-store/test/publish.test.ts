// Contrato do publicador de rodada contra Postgres REAL (SPEC-014 — Fatia 2).
// Reproduz os 7 comportamentos que publish.test.ts (engine) provava só in-memory +
// (8) idempotência DURÁVEL (não clobbera) + (9) reconciliação com o engine +
// invariante de concorrência. Prova a atomicidade de BANCO: em falha, o ROLLBACK é
// do Postgres, não um swap de Map.
//
// Gated por DATABASE_URL: sem Postgres, a suíte é PULADA (npm test segue verde).
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_LEAGUE,
  simulateSeason,
  type PublishInput,
  type RoundResult,
} from '@camisa-9/world-engine';
import { createDb, type DbHandle } from '../src/client.js';
import { publishedRound } from '../src/schema/round.js';
import { publishRound, readRound } from '../src/store/round-repo.js';

const DB_URL = process.env.DATABASE_URL;
const LEAGUE = 'liga-varzea-a';
const SEASON = '2026';

function input(round: number, matches: RoundResult['matches'] = []): PublishInput {
  return { leagueId: LEAGUE, seasonId: SEASON, result: { round, matches } };
}

describe.skipIf(!DB_URL)('publishRound — contrato transacional contra Postgres real', () => {
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
    await handle.db.delete(publishedRound);
  });

  async function countRounds(): Promise<number> {
    const rows = await handle.db.select({ round: publishedRound.round }).from(publishedRound);
    return rows.length;
  }

  it('1. publica uma rodada nova (published, visível na leitura)', async () => {
    const out = await publishRound(handle.db, input(1));
    expect(out).toEqual({ status: 'published', round: 1 });
    expect(await readRound(handle.db, LEAGUE, SEASON, 1)).not.toBeNull();
  });

  it('2. idempotência sequencial: re-publicar rodada commitada é no-op', async () => {
    await publishRound(handle.db, input(1));
    const second = await publishRound(handle.db, input(1));
    expect(second.status).toBe('idempotent');
    expect(await countRounds()).toBe(1);
  });

  it('3. chave travada (advisory lock por outra sessão): recua com locked, não grava', async () => {
    const client = await handle.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${LEAGUE}:${SEASON}:5`,
      ]);
      const out = await publishRound(handle.db, input(5));
      expect(out.status).toBe('locked');
      expect(await countRounds()).toBe(0);
    } finally {
      await client.query('ROLLBACK'); // libera o advisory xact lock
      client.release();
    }
  });

  it('4. falha SÍNCRONA antes do commit → ROLLBACK real, nada persistido', async () => {
    const boom = new Error('falha injetada antes do commit');
    await expect(
      publishRound(handle.db, input(1), () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(await readRound(handle.db, LEAGUE, SEASON, 1)).toBeNull();
    expect(await countRounds()).toBe(0);
  });

  it('5. falha ASSÍNCRONA no seam de pré-commit → ROLLBACK real', async () => {
    const boom = new Error('falha assíncrona antes do commit');
    await expect(publishRound(handle.db, input(1), () => Promise.reject(boom))).rejects.toBe(boom);
    expect(await countRounds()).toBe(0);
  });

  it('6. lock liberado após falha: a publicação seguinte funciona', async () => {
    await expect(
      publishRound(handle.db, input(1), () => {
        throw new Error('x');
      }),
    ).rejects.toThrow();
    const retry = await publishRound(handle.db, input(1));
    expect(retry.status).toBe('published');
    expect(await countRounds()).toBe(1);
  });

  it('7. rodadas distintas coexistem', async () => {
    await publishRound(handle.db, input(1));
    await publishRound(handle.db, input(2));
    expect(await countRounds()).toBe(2);
  });

  it('8. idempotência durável NÃO clobbera o result commitado (proxy de retry pós-crash)', async () => {
    const first = input(1, [
      { round: 1, homeId: 'c01', awayId: 'c02', homeGoals: 2, awayGoals: 1 },
    ]);
    await publishRound(handle.db, first);
    const second = input(1, [
      { round: 1, homeId: 'c01', awayId: 'c02', homeGoals: 9, awayGoals: 9 },
    ]);
    const out = await publishRound(handle.db, second);
    expect(out.status).toBe('idempotent');
    expect(await readRound(handle.db, LEAGUE, SEASON, 1)).toEqual(first.result); // NÃO o second
  });

  it('9. reconciliação: RoundResult determinístico do engine → publica → lê byte-a-byte', async () => {
    const season = simulateSeason(DEMO_LEAGUE, 'decada');
    const r0 = season.rounds[0];
    expect(r0).toBeDefined();
    await publishRound(handle.db, {
      leagueId: DEMO_LEAGUE.leagueId,
      seasonId: DEMO_LEAGUE.seasonId,
      result: r0 as RoundResult,
    });
    const back = await readRound(
      handle.db,
      DEMO_LEAGUE.leagueId,
      DEMO_LEAGUE.seasonId,
      (r0 as RoundResult).round,
    );
    expect(back).toEqual(r0);
  });

  it('invariante de concorrência: 2 sobrepostas na mesma chave → 1 publicada, 1 linha', async () => {
    const [a, b] = await Promise.all([
      publishRound(handle.db, input(9)),
      publishRound(handle.db, input(9)),
    ]);
    const published = [a.status, b.status].filter((s) => s === 'published');
    expect(published).toHaveLength(1); // exatamente uma publica; a outra recua (locked ou idempotent)
    expect(await countRounds()).toBe(1);
  });
});
