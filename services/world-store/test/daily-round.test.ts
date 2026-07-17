// Contrato do orquestrador de TICK diário contra Postgres REAL (SPEC-015 — 1.2).
// Prova, ponta a ponta: (a) a guarda de janela 15h 7/7; (b) o mapa calendário→rodada
// (Model B: targetRound = dayIndex - start_day_index + 1); (c) a publicação grão-MUNDO
// atômica (as 4 ligas numa tacada) reusando o engine puro; (d) parada limpa no fim da
// temporada SEM viragem; (e) idempotência/locked/concorrência herdadas da Fatia 2.
//
// Gated por DATABASE_URL: sem Postgres, a suíte é PULADA (npm test segue verde).
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedWorld, simulateWorldSeason, type WorldSeasonResult } from '@camisa-9/world-engine';
import { createDb, type DbHandle } from '../src/client.js';
import { publishedRound } from '../src/schema/round.js';
import { season } from '../src/schema/season.js';
import { athlete, club, league, world, worldOccupation, worldTier } from '../src/schema/world.js';
import { writeWorld } from '../src/store/world-repo.js';
import { setSeasonAnchor } from '../src/store/season-repo.js';
import { publishWorldRound, readRound, type WorldRoundInput } from '../src/store/round-repo.js';
import { runDailyRound } from '../src/store/daily-round.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'decada';
const SEASON = '2026'; // seasonId do mundo semeado
const LEAGUES = 4; // 4 divisões × 20 clubes
const ROUNDS = 38; // liga de 20 → turno-returno
const START = 20_000; // dia-índice âncora do round 1 (arbitrário, determinístico)

// Oráculo de epoch INDEPENDENTE do resolveSlot (mesma aritmética UTC-3 fixa da SPEC-002):
// devolve o instante das `hour`h Brasília no dia-índice `dayIndex`.
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const BRASILIA_OFFSET_MS = -3 * MS_PER_HOUR;
function epochAt(dayIndex: number, hour = 15): number {
  return dayIndex * MS_PER_DAY + hour * MS_PER_HOUR - BRASILIA_OFFSET_MS;
}

function toInput(res: WorldSeasonResult, round: number): WorldRoundInput {
  return {
    seasonId: res.seasonId,
    round,
    leagues: res.leagues.map((l) => ({
      leagueId: l.result.leagueId,
      result: l.result.rounds[round - 1]!,
    })),
  };
}

describe.skipIf(!DB_URL)('runDailyRound — orquestrador diário contra Postgres real', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = createDb(DB_URL as string);
    await migrate(handle.db, {
      migrationsFolder: fileURLToPath(new URL('../src/migrations', import.meta.url)),
    });
    await wipeAll(); // idempotente: limpa resíduo de outra suíte antes de semear
    await writeWorld(handle.db, SEED); // mundo estável para toda a suíte
  });

  async function wipeAll(): Promise<void> {
    await handle.db.delete(worldOccupation); // ordem inversa das FKs (SPEC-020: filho de athlete)
    await handle.db.delete(publishedRound);
    await handle.db.delete(season);
    await handle.db.delete(athlete);
    await handle.db.delete(club);
    await handle.db.delete(league);
    await handle.db.delete(worldTier);
    await handle.db.delete(world);
  }

  afterAll(async () => {
    if (handle) await handle.pool.end();
  });

  beforeEach(async () => {
    await handle.db.delete(publishedRound);
    await handle.db.delete(season);
  });

  async function countRounds(): Promise<number> {
    const rows = await handle.db.select({ round: publishedRound.round }).from(publishedRound);
    return rows.length;
  }

  it('fora da janela (não 15h) → fora_de_janela, nada gravado', async () => {
    const rep = await runDailyRound(handle.db, SEED, epochAt(START, 10));
    expect(rep.status).toBe('fora_de_janela');
    expect(rep.complete).toBe(false);
    expect(await countRounds()).toBe(0);
  });

  it('mundo ausente na janela → sem_mundo', async () => {
    const rep = await runDailyRound(handle.db, 'seed-sem-mundo', epochAt(START));
    expect(rep.status).toBe('sem_mundo');
    expect(rep.complete).toBe(false);
  });

  it('mundo presente, temporada não ancorada → sem_ancora', async () => {
    const rep = await runDailyRound(handle.db, SEED, epochAt(START));
    expect(rep.status).toBe('sem_ancora');
    expect(rep.seasonId).toBe(SEASON);
  });

  it('publica a rodada do dia de TODAS as ligas numa tacada (published, 4 ligas)', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    const rep = await runDailyRound(handle.db, SEED, epochAt(START));
    expect(rep.status).toBe('published');
    expect(rep.complete).toBe(true);
    expect(rep.targetRound).toBe(1);
    expect(rep.leagueCount).toBe(LEAGUES);
    expect(rep.seasonId).toBe(SEASON);
    expect(await countRounds()).toBe(LEAGUES);
  });

  it('calendário: o dia START+k publica a rodada k+1', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    const rep = await runDailyRound(handle.db, SEED, epochAt(START + 4));
    expect(rep.status).toBe('published');
    expect(rep.targetRound).toBe(5);
    expect(await countRounds()).toBe(LEAGUES);
  });

  it('antes do início (dia < âncora) → before_season, nada gravado', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    const rep = await runDailyRound(handle.db, SEED, epochAt(START - 1));
    expect(rep.status).toBe('before_season');
    expect(rep.targetRound).toBe(0);
    expect(await countRounds()).toBe(0);
  });

  it('após a última rodada → season_complete, SEM viragem, nada gravado', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    const rep = await runDailyRound(handle.db, SEED, epochAt(START + ROUNDS)); // targetRound 39
    expect(rep.status).toBe('season_complete');
    expect(rep.targetRound).toBe(ROUNDS + 1);
    expect(await countRounds()).toBe(0);
  });

  it('idempotência: rodar o mesmo dia 2× → 2ª é idempotent, ainda 4 linhas', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    await runDailyRound(handle.db, SEED, epochAt(START));
    const rep = await runDailyRound(handle.db, SEED, epochAt(START));
    expect(rep.status).toBe('idempotent');
    expect(rep.complete).toBe(true);
    expect(await countRounds()).toBe(LEAGUES);
  });

  it('chave do dia travada (advisory lock por outra sessão) → locked, nada gravado', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    const client = await handle.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `world:${SEASON}:1`,
      ]);
      const rep = await runDailyRound(handle.db, SEED, epochAt(START));
      expect(rep.status).toBe('locked');
      expect(rep.complete).toBe(false);
      expect(await countRounds()).toBe(0);
    } finally {
      await client.query('ROLLBACK'); // libera o advisory xact lock
      client.release();
    }
  });

  it('concorrência: 2 ticks sobrepostos no mesmo dia → 1 publica, 4 linhas (não 8)', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    const [a, b] = await Promise.all([
      runDailyRound(handle.db, SEED, epochAt(START)),
      runDailyRound(handle.db, SEED, epochAt(START)),
    ]);
    const published = [a.status, b.status].filter((s) => s === 'published');
    expect(published).toHaveLength(1); // exatamente um tick publica; o outro recua
    expect(await countRounds()).toBe(LEAGUES);
  });

  it('reconciliação grão-mundo: cada liga publica a SUA rodada N do engine', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    await runDailyRound(handle.db, SEED, epochAt(START + 2)); // rodada 3
    const res = simulateWorldSeason(seedWorld(SEED), SEED);
    for (const l of res.leagues) {
      const back = await readRound(handle.db, l.result.leagueId, SEASON, 3);
      expect(back).toEqual(l.result.rounds[2]);
    }
  });

  it('atomicidade grão-mundo: falha no seam pré-commit → ROLLBACK total, zero linhas', async () => {
    const input = toInput(simulateWorldSeason(seedWorld(SEED), SEED), 1);
    const boom = new Error('falha injetada antes do commit');
    await expect(
      publishWorldRound(handle.db, input, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(await countRounds()).toBe(0); // nem uma liga vazou — all-or-nothing
  });

  it('protocolo de falha: publish que estoura → deferred (nada publicado); retry publica o dia', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    // CHECK temporária força o INSERT da rodada 1 a estourar — falha realista de banco
    // que a checagem de existência NÃO intercepta (a linha ainda não existe).
    await handle.db.execute(
      sql`ALTER TABLE published_round ADD CONSTRAINT tmp_boom CHECK (round <> 1)`,
    );
    try {
      const rep = await runDailyRound(handle.db, SEED, epochAt(START));
      expect(rep.status).toBe('deferred');
      expect(rep.complete).toBe(false);
      expect(await countRounds()).toBe(0); // all-or-nothing: o ROLLBACK apagou tudo
    } finally {
      await handle.db.execute(sql`ALTER TABLE published_round DROP CONSTRAINT tmp_boom`);
    }
    const retry = await runDailyRound(handle.db, SEED, epochAt(START)); // sem a trava, publica
    expect(retry.status).toBe('published');
    expect(await countRounds()).toBe(LEAGUES);
  });

  it('determinismo ponta a ponta: 38 dias → 4×38 rodadas byte-idênticas ao engine', async () => {
    await setSeasonAnchor(handle.db, SEED, SEASON, START);
    for (let d = 0; d < ROUNDS; d++) {
      const rep = await runDailyRound(handle.db, SEED, epochAt(START + d));
      expect(rep.status).toBe('published');
    }
    expect(await countRounds()).toBe(LEAGUES * ROUNDS);
    const res = simulateWorldSeason(seedWorld(SEED), SEED);
    for (const l of res.leagues) {
      const backs = await Promise.all(
        l.result.rounds.map((_, i) => readRound(handle.db, l.result.leagueId, SEASON, i + 1)),
      );
      expect(backs).toEqual(l.result.rounds); // toda rodada de toda liga = a temporada pura
    }
  });
});
