// GET /v1/band contra um servidor REAL (SPEC-038, critérios 1, 2, 7 e o teto de round-trips da 8).
// Sobe via `createApiServer` + `listen(0)` — NUNCA importando `main.ts`. Relógio INJETADO (`clock`).
// Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAthlete, type Position } from '@camisa-9/player';
import {
  createAccountWithAthlete,
  createDb as createPlayerDb,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
} from '@camisa-9/player-store';
import {
  createDb as createWorldDb,
  occupyNpcSlot,
  readWorld,
  setSeasonAnchor,
  schema as worldSchema,
  writeWorld,
  type DbHandle as WorldHandle,
} from '@camisa-9/world-store';
import { createApiServer } from '../src/server.js';
import { reset } from '../src/http/rate-limit.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'band-server-038';
const PASSWORD = 'senha-bem-forte-123';
const T0 = 1_700_000_000_000;
let seq = 0;

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}
const close = (s: Server): Promise<void> => new Promise((r) => s.close(() => r()));

describe.skipIf(!DB_URL)('GET /v1/band — servidor real (SPEC-038)', () => {
  let worldHandle: WorldHandle;
  let playerHandle: PlayerHandle;
  let server: Server;
  let proxy: Server; // TRUST_PROXY_HOPS=1: simula IPs diferentes via X-Forwarded-For
  let base: string;
  let proxyBase: string;
  let clock = T0;

  beforeAll(async () => {
    worldHandle = createWorldDb(DB_URL as string);
    playerHandle = createPlayerDb(DB_URL as string);
    await migrate(worldHandle.db, {
      migrationsFolder: fileURLToPath(new URL('../../world-store/src/migrations', import.meta.url)),
    });
    await migrate(playerHandle.db, {
      migrationsFolder: fileURLToPath(
        new URL('../../player-store/src/migrations', import.meta.url),
      ),
      migrationsSchema: 'drizzle_player',
    });
    const deps = {
      db: playerHandle.db,
      worldDb: worldHandle.db,
      worldSeed: SEED,
      now: () => clock,
    };
    server = createApiServer(deps);
    proxy = createApiServer({ ...deps, trustProxyHops: 1 });
    base = `http://127.0.0.1:${await listen(server)}`;
    proxyBase = `http://127.0.0.1:${await listen(proxy)}`;
  });

  afterAll(async () => {
    if (server) await close(server);
    if (proxy) await close(proxy);
    if (worldHandle) await worldHandle.pool.end();
    if (playerHandle) await playerHandle.pool.end();
  });

  beforeEach(async () => {
    reset();
    clock = T0;
    await wipeAll();
    await writeWorld(worldHandle.db, SEED);
  });

  afterEach(() => vi.restoreAllMocks());

  async function wipeAll(): Promise<void> {
    await worldHandle.db.delete(worldSchema.worldOccupation);
    await worldHandle.db.delete(worldSchema.publishedRound);
    await worldHandle.db.delete(worldSchema.season);
    await worldHandle.db.delete(worldSchema.athlete);
    await worldHandle.db.delete(worldSchema.club);
    await worldHandle.db.delete(worldSchema.league);
    await worldHandle.db.delete(worldSchema.worldTier);
    await worldHandle.db.delete(worldSchema.waitingList);
    await worldHandle.db.delete(worldSchema.tickProgress);
    await worldHandle.db.delete(worldSchema.world);
    await playerHandle.db.delete(playerSchema.injury);
    await playerHandle.db.delete(playerSchema.decision);
    await playerHandle.db.delete(playerSchema.purchase);
    await playerHandle.db.delete(playerSchema.dailyLedger);
    await playerHandle.db.delete(playerSchema.matchChoice); // FK→athlete (SPEC-050) — antes do atleta
    await playerHandle.db.delete(playerSchema.athlete);
    await playerHandle.db.delete(playerSchema.team);
    await playerHandle.db.delete(playerSchema.session);
    await playerHandle.db.delete(playerSchema.account);
  }

  async function entryClubId(): Promise<string> {
    const w = (await readWorld(worldHandle.db, SEED))!;
    return w.tiers[w.tiers.length - 1]!.leagues[0]!.clubs[0]!.id;
  }

  /** Cria conta+atleta (FWD). Devolve o e-mail (p/ login) e o athleteId. */
  async function createAccount(): Promise<{ email: string; athleteId: string }> {
    seq += 1;
    const email = `s${seq}@x.com`;
    const draft = createAthlete({
      name: 'Craque',
      position: 'FWD',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email,
      password: PASSWORD,
      draft: draft.value,
    });
    return { email, athleteId };
  }

  async function occupy(
    athleteId: string,
    clubId: string,
    position: Position = 'FWD',
  ): Promise<void> {
    const res = await occupyNpcSlot(worldHandle.db, {
      worldSeed: SEED,
      clubId,
      position,
      humanAthleteId: athleteId,
      humanName: 'Craque',
      ability: 34,
    });
    await setSeasonAnchor(worldHandle.db, SEED, res.seasonId, 20_000);
  }

  async function token(email: string): Promise<string> {
    const r = await fetch(`${base}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const body = (await r.json()) as { token: string };
    return body.token;
  }

  describe('critério 1 — autorização por CONSTRUÇÃO', () => {
    it('token de A + ?athleteId=B + X-Athlete-Id:B → SEMPRE o BandState de A', async () => {
      const clubId = await entryClubId();
      const a = await createAccount();
      await occupy(a.athleteId, clubId);
      const b = await createAccount(); // B existe, mas seu id é ignorado
      reset();
      const tok = await token(a.email);
      const r = await fetch(`${base}/v1/band?athleteId=${b.athleteId}`, {
        headers: { authorization: `Bearer ${tok}`, 'x-athlete-id': b.athleteId },
      });
      expect(r.status).toBe(200);
      const state = (await r.json()) as { athlete: { id: string } };
      expect(state.athlete.id).toBe(a.athleteId); // o ator vem da SESSÃO, nunca do request
      expect(state.athlete.id).not.toBe(b.athleteId);
    });

    it('sem header Authorization → 401 (a rota está embrulhada em requireAthlete)', async () => {
      const r = await fetch(`${base}/v1/band`);
      expect(r.status).toBe(401);
      expect((await r.json()) as unknown).toMatchObject({ code: 'unauthorized' });
    });

    it('no-store na resposta da faixa', async () => {
      const clubId = await entryClubId();
      const a = await createAccount();
      await occupy(a.athleteId, clubId);
      reset();
      const r = await fetch(`${base}/v1/band`, {
        headers: { authorization: `Bearer ${await token(a.email)}` },
      });
      expect(r.headers.get('cache-control')).toBe('no-store');
    });
  });

  describe('critério 2 — conta mid-regen → 409 e readBandState NUNCA roda', () => {
    it('sessão viva sem atleta ativo → 409, zero query no banco do MUNDO', async () => {
      const a = await createAccount();
      reset();
      const tok = await token(a.email);
      // mid-regen: desativa o atleta (o readActiveAthlete passa a devolver null → session.athleteId null)
      await playerHandle.db
        .update(playerSchema.athlete)
        .set({ active: false })
        .where(eq(playerSchema.athlete.id, a.athleteId));
      const counter = instrument([worldHandle.pool]);
      const r = await fetch(`${base}/v1/band`, { headers: { authorization: `Bearer ${tok}` } });
      counter.restore();
      expect(r.status).toBe(409);
      expect((await r.json()) as unknown).toMatchObject({ code: 'no_active_athlete' });
      expect(counter.count()).toBe(0); // readBandState (o único consumidor do world) não rodou
    });
  });

  describe('critério 7 — rate limit em DUAS camadas', () => {
    // X-Forwarded-For: com trustProxyHops=1, o IP do cliente é o valor mais à DIREITA.
    const bandFrom = (ip: string, tok: string): Promise<Response> =>
      fetch(`${proxyBase}/v1/band`, {
        headers: { authorization: `Bearer ${tok}`, 'x-forwarded-for': `forjado, ${ip}` },
      });

    it('(a) por accountId: 31 chamadas do mesmo token (IPs rotacionados) → a 31ª é 429', async () => {
      const clubId = await entryClubId();
      const a = await createAccount();
      await occupy(a.athleteId, clubId);
      reset();
      const tok = await token(a.email);
      // 30 chamadas, espalhadas por 8 IPs (≤4 cada → nunca estoura o teto de IP de 10).
      for (let i = 0; i < 30; i++) {
        const r = await bandFrom(`10.0.0.${i % 8}`, tok);
        expect(r.status).toBe(200);
      }
      const limited = await bandFrom('10.0.0.0', tok); // 31ª do mesmo accountId
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBeTruthy();
      const body = (await limited.json()) as { code: string; retryAfter: number };
      expect(body.code).toBe('rate_limited');
      expect(body.retryAfter).toBeGreaterThan(0);
    });

    it('(a-discriminante) DUAS contas: A esgota 30, a 1ª de B ainda é 200', async () => {
      const clubId = await entryClubId();
      const a = await createAccount();
      await occupy(a.athleteId, clubId);
      const bClub = (await readWorld(worldHandle.db, SEED))!.tiers.at(-1)!.leagues[0]!.clubs[1]!.id;
      const b = await createAccount();
      await occupy(b.athleteId, bClub);
      reset();
      const tokA = await token(a.email);
      const tokB = await token(b.email);
      for (let i = 0; i < 30; i++) await bandFrom(`10.0.1.${i % 8}`, tokA);
      expect((await bandFrom('10.0.1.0', tokA)).status).toBe(429); // A trancou
      expect((await bandFrom('10.0.9.9', tokB)).status).toBe(200); // B, balde independente
    });

    it('(b) por IP, ANTES da auth: 11 chamadas de token INVÁLIDO do mesmo IP → 429 sem tocar a sessão', async () => {
      reset();
      const counter = instrument([playerHandle.pool]);
      for (let i = 0; i < 10; i++) {
        const r = await fetch(`${base}/v1/band`, {
          headers: { authorization: 'Bearer lixo-invalido' },
        });
        expect(r.status).toBe(401); // token inválido, mas o IP ainda tem budget
      }
      const beforeEleventh = counter.count();
      const limited = await fetch(`${base}/v1/band`, {
        headers: { authorization: 'Bearer lixo-invalido' },
      });
      const afterEleventh = counter.count();
      counter.restore();
      expect(limited.status).toBe(429); // o teto de IP mordeu ANTES da auth
      expect(afterEleventh).toBe(beforeEleventh); // a 11ª NÃO tocou o banco (readSessionByHash não rodou)
    });
  });

  describe('critério 8 — teto de round-trips da requisição COMPLETA', () => {
    it('uma requisição autenticada fica em ≤ 28 round-trips (middleware + agregador + markActive)', async () => {
      const clubId = await entryClubId();
      const a = await createAccount();
      await occupy(a.athleteId, clubId);
      reset();
      const tok = await token(a.email);
      const counter = instrument([worldHandle.pool, playerHandle.pool]);
      const r = await fetch(`${base}/v1/band`, { headers: { authorization: `Bearer ${tok}` } });
      counter.restore();
      expect(r.status).toBe(200);
      expect(counter.count()).toBeLessThanOrEqual(28);
    });
  });
});

/** Conta round-trips reais: envolve SÓ `pool.connect` e conta cada `client.query` (o `pool.query`
 *  do pg roteia por `connect`, então captura queries simples E internas de transação sem duplicar). */
type QueryFn = (...q: unknown[]) => unknown;
type PoolLike = { connect: (cb?: (e: unknown, c: unknown, r: unknown) => void) => unknown };
function instrument(pools: readonly unknown[]): { count: () => number; restore: () => void } {
  let n = 0;
  const restores: (() => void)[] = [];
  const seen = new WeakSet<object>();
  const wrap = (client: unknown): void => {
    if (!client || typeof client !== 'object' || seen.has(client)) return;
    seen.add(client);
    const c = client as { query: QueryFn };
    const cq = c.query.bind(c);
    c.query = (...q: unknown[]) => {
      n += 1;
      return cq(...q);
    };
    restores.push(() => {
      c.query = cq;
    });
  };
  for (const pool of pools) {
    const p = pool as PoolLike;
    const origConnect = p.connect.bind(p);
    p.connect = (cb?: (e: unknown, c: unknown, r: unknown) => void) => {
      if (typeof cb === 'function') {
        return origConnect((e, client, r) => {
          wrap(client);
          cb(e, client, r);
        });
      }
      return (origConnect() as Promise<unknown>).then((client) => {
        wrap(client);
        return client;
      });
    };
    restores.push(() => {
      p.connect = origConnect;
    });
  }
  return { count: () => n, restore: () => restores.forEach((r) => r()) };
}
