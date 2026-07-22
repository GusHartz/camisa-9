// A API contra um servidor REAL (SPEC-037, critérios 1, 3 e 4). Sobe via `createApiServer` +
// `listen(0)` — NUNCA importando `main.ts`, que auto-executa. Gated por DATABASE_URL.
// ⚠️ Relógio INJETADO (`clock`): TTLs e janelas de rate limit são aritmética, não `sleep`.
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAthlete, type AthleteDraft } from '@camisa-9/player';
import { createAccountWithAthlete, createDb, schema, type DbHandle } from '@camisa-9/player-store';
import { createDb as createWorldDb, type DbHandle as WorldHandle } from '@camisa-9/world-store';
import { createApiServer } from '../src/server.js';
import { requireSession } from '../src/auth/require.js';
import { reset } from '../src/http/rate-limit.js';
import type { Handler } from '../src/http/types.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
const EMAIL = 'craque@varzea.test';
const T0 = 1_700_000_000_000;

function draft(name = 'Zé da Várzea'): AthleteDraft {
  const r = createAthlete({
    name,
    position: 'FWD',
    appearance: { skinTone: 2, hairStyle: 1, hairColor: 3 },
    attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
  });
  if (!r.ok) throw new Error(`fixture inválida: ${r.reason}`);
  return r.value;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

const close = (server: Server): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()));

describe.skipIf(!DB_URL)('api — servidor real', () => {
  let handle: DbHandle;
  // A SPEC-038 tornou `worldDb`/`worldSeed` obrigatórios no `ApiDeps`. O `/v1/band` NÃO é exercitado
  // nesta suíte (é o alvo da suíte da 038), então basta um handle válido — sem migrar o schema do mundo.
  let worldHandle: WorldHandle;
  let server: Server;
  let base: string;
  let clock = T0;
  /** Quantas vezes o handler PROTEGIDO de teste rodou. O espião do critério 1. */
  let protectedRuns = 0;

  beforeAll(async () => {
    handle = createDb(DB_URL as string);
    worldHandle = createWorldDb(DB_URL as string);
    await migrate(handle.db, {
      migrationsFolder: fileURLToPath(
        new URL('../../player-store/src/migrations', import.meta.url),
      ),
      migrationsSchema: 'drizzle_player',
    });

    // Rota protegida SÓ da suíte: exercita o middleware `requireSession` sem poluir o router de
    // produção (o alvo real é o `GET /v1/band` da SPEC-038, que crava a mesma matriz).
    const spy: Handler = requireSession(handle.db, async () => {
      protectedRuns += 1;
      return { status: 200, body: { ok: true } };
    });
    // Rota que EXPLODE com uma mensagem cheia de detalhe interno — o alvo do OP-11.
    const boom: Handler = async () => {
      throw new Error('duplicate key value violates unique constraint "player.account_email_key"');
    };

    server = createApiServer({
      db: handle.db,
      worldDb: worldHandle.db,
      worldSeed: 'seed-de-teste',
      now: () => clock,
      extraRoutes: { 'GET /test/protected': spy, 'GET /test/boom': boom },
    });
    base = `http://127.0.0.1:${await listen(server)}`;
  });

  afterAll(async () => {
    if (server) await close(server);
    if (handle) await handle.pool.end();
    if (worldHandle) await worldHandle.pool.end();
  });

  beforeEach(async () => {
    reset(); // ⚠️ estado de módulo compartilhado entre suítes (fileParallelism:false)
    clock = T0;
    protectedRuns = 0;
    await handle.db.delete(schema.injury);
    await handle.db.delete(schema.decision);
    await handle.db.delete(schema.purchase);
    await handle.db.delete(schema.dailyLedger);
    await handle.db.delete(schema.seasonSummary); // FK→athlete+account (SPEC-053) — antes do atleta
    await handle.db.delete(schema.matchChoice); // FK→athlete (SPEC-050) — antes do atleta
    await handle.db.delete(schema.athlete);
    await handle.db.delete(schema.session);
    await handle.db.delete(schema.account);
    await createAccountWithAthlete(handle.db, {
      email: EMAIL,
      password: PASSWORD,
      draft: draft(),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const login = (email = EMAIL, password = PASSWORD): Promise<Response> =>
    fetch(`${base}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

  async function tokenOf(): Promise<string> {
    const r = await login();
    const body = (await r.json()) as { token: string };
    return body.token;
  }

  describe('critério 1 — OP-09 pelo TIPO e a superfície de erro', () => {
    it('os QUATRO 401 e o handler protegido NUNCA roda', async () => {
      const token = await tokenOf();
      reset();
      const semHeader = await fetch(`${base}/test/protected`);
      const malformado = await fetch(`${base}/test/protected`, {
        headers: { authorization: 'Basic xyz' },
      });
      const inexistente = await fetch(`${base}/test/protected`, {
        headers: { authorization: 'Bearer nao-existe' },
      });
      clock = T0 + 31 * 86_400_000; // além do teto absoluto
      const expirado = await fetch(`${base}/test/protected`, {
        headers: { authorization: `Bearer ${token}` },
      });
      for (const r of [semHeader, malformado, inexistente, expirado]) {
        expect(r.status).toBe(401);
        expect(await r.json()).toEqual({ error: 'não autorizado', code: 'unauthorized' });
      }
      expect(protectedRuns).toBe(0); // o espião: nenhuma query de domínio foi emitida
    });

    it('com sessão viva o handler protegido roda', async () => {
      const token = await tokenOf();
      const r = await fetch(`${base}/test/protected`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(r.status).toBe(200);
      expect(protectedRuns).toBe(1);
    });

    it('logout SEM header e com body malformado → 401, nunca 400 (auth antes de input)', async () => {
      const r = await fetch(`${base}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"nao": ',
      });
      expect(r.status).toBe(401);
    });

    it('logout com header bem-formado e token INEXISTENTE → 204, igual a token vivo', async () => {
      const morto = await fetch(`${base}/v1/auth/logout`, {
        method: 'POST',
        headers: { authorization: 'Bearer token-que-nunca-existiu' },
      });
      expect(morto.status).toBe(204);
      const token = await tokenOf();
      const vivo = await fetch(`${base}/v1/auth/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(vivo.status).toBe(204);
      // ...e o token realmente morreu.
      const depois = await fetch(`${base}/test/protected`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(depois.status).toBe(401);
    });

    it('OP-11: um throw com SQL dentro vira 500 genérico, sem vazar nada', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const r = await fetch(`${base}/test/boom`);
      expect(r.status).toBe(500);
      const raw = await r.text();
      expect(JSON.parse(raw)).toEqual({ error: 'erro interno', code: 'internal' });
      for (const leak of ['duplicate key', 'constraint', 'player.', 'account_email_key', 'at ']) {
        expect(raw).not.toContain(leak);
      }
    });
  });

  describe('critério 3 — login não enumera e os baldes limitam', () => {
    it('e-mail inexistente e senha errada dão respostas BYTE-IDÊNTICAS', async () => {
      const senhaErrada = await login(EMAIL, 'senha-errada-123');
      reset();
      const naoExiste = await login('ninguem@lugar.test', PASSWORD);
      expect(senhaErrada.status).toBe(naoExiste.status);
      expect(await senhaErrada.text()).toBe(await naoExiste.text());
    });

    it('11 tentativas do mesmo IP em 1 min → 429 com Retry-After no header E no corpo', async () => {
      // E-mails distintos para não esbarrar antes no balde de e-mail (5/min).
      for (let i = 0; i < 10; i++) await login(`a${i}@x.test`, 'errada');
      const r = await login('a99@x.test', 'errada');
      expect(r.status).toBe(429);
      expect(r.headers.get('retry-after')).toBeTruthy();
      const body = (await r.json()) as { code: string; retryAfter: number };
      expect(body.code).toBe('rate_limited');
      expect(body.retryAfter).toBeGreaterThan(0);
    });

    it('6 tentativas do MESMO e-mail em 1 min → 429 (o balde mais restritivo vence)', async () => {
      for (let i = 0; i < 5; i++) await login(EMAIL, 'errada');
      expect((await login(EMAIL, 'errada')).status).toBe(429);
    });

    it('a janela vira e o balde reabre', async () => {
      for (let i = 0; i < 5; i++) await login(EMAIL, 'errada');
      expect((await login(EMAIL, 'errada')).status).toBe(429);
      clock = T0 + 61_000;
      expect((await login(EMAIL, 'errada')).status).toBe(401);
    });

    it('login bem-sucedido devolve token + expiresAt e NÃO cacheia', async () => {
      const r = await login();
      expect(r.status).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-store');
      const body = (await r.json()) as { token: string; expiresAt: number };
      expect(body.token).toHaveLength(43); // base64url de 32 bytes
      expect(body.expiresAt).toBe(T0 + 30 * 86_400_000);
    });
  });

  // ⚠️ Servidor SEPARADO com TRUST_PROXY_HOPS=1: é o único jeito de simular clientes de IPs
  // diferentes (todos os requests da suíte saem de 127.0.0.1). Sem isto, o seam de derivação de IP
  // nunca era exercitado ponta-a-ponta — só a função pura — e o critério 3 ficava pela metade.
  describe('critério 3 (ponta-a-ponta) — derivação de IP e o balde certo', () => {
    let atrasDoProxy: Server;
    let proxyBase: string;

    beforeAll(async () => {
      atrasDoProxy = createApiServer({
        db: handle.db,
        worldDb: worldHandle.db,
        worldSeed: 'seed-de-teste',
        now: () => clock,
        trustProxyHops: 1,
      });
      proxyBase = `http://127.0.0.1:${await listen(atrasDoProxy)}`;
    });

    afterAll(async () => {
      if (atrasDoProxy) await close(atrasDoProxy);
    });

    const comIp = (ip: string, email = 'x@y.test'): Promise<Response> =>
      fetch(`${proxyBase}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `forjado, ${ip}` },
        body: JSON.stringify({ email, password: 'errada' }),
      });

    it('o cliente NÃO troca de balde mexendo na esquerda do X-Forwarded-For', async () => {
      for (let i = 0; i < 10; i++) {
        await fetch(`${proxyBase}/v1/auth/login`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `forjado-${i}, 9.9.9.9`, // muda só a parte que ELE controla
          },
          body: JSON.stringify({ email: `e${i}@y.test`, password: 'errada' }),
        });
      }
      const r = await comIp('9.9.9.9', 'ultimo@y.test');
      expect(r.status).toBe(429); // o balde é o do 9.9.9.9, não o do valor forjado
    });

    it('IPs reais diferentes têm baldes independentes', async () => {
      for (let i = 0; i < 10; i++) await comIp('1.1.1.1', `a${i}@y.test`);
      expect((await comIp('1.1.1.1', 'mais@y.test')).status).toBe(429);
      expect((await comIp('2.2.2.2', 'outro@y.test')).status).toBe(401); // balde limpo
    });

    it('um atacante NÃO tranca a vítima gastando o balde do e-mail dela', async () => {
      // O furo original: o balde por e-mail era consumido ANTES do authenticate, então contava
      // TENTATIVAS. 5 logins com senha qualquer no e-mail da vítima e ela, COM A SENHA CERTA,
      // passava a receber 429 — renovável indefinidamente, de um IP só.
      for (let i = 0; i < 5; i++) await comIp('6.6.6.6', EMAIL);
      expect((await comIp('6.6.6.6', EMAIL)).status).toBe(429); // o atacante trancou a SI MESMO
      const vitima = await fetch(`${proxyBase}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `qualquer, 7.7.7.7` },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      });
      expect(vitima.status).toBe(200); // a vítima entra normalmente
    });
  });

  describe('critério 4 — robustez do transporte', () => {
    it('logout TAMBÉM é limitado por IP — nenhuma rota de auth nasce sem teto', async () => {
      // O furo original: o limite morava dentro do handler do login, então o `logout` — que aceita
      // Bearer de anônimo e emite um DELETE no banco — não passava por balde nenhum.
      for (let i = 0; i < 10; i++) {
        await fetch(`${base}/v1/auth/logout`, {
          method: 'POST',
          headers: { authorization: 'Bearer qualquer-coisa' },
        });
      }
      const r = await fetch(`${base}/v1/auth/logout`, {
        method: 'POST',
        headers: { authorization: 'Bearer qualquer-coisa' },
      });
      expect(r.status).toBe(429);
      expect(r.headers.get('retry-after')).toBeTruthy();
    });

    it('corpo de 1 MiB → 413 e o servidor SEGUE VIVO', async () => {
      const r = await fetch(`${base}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: 'x'.repeat(1024 * 1024) }),
      });
      expect(r.status).toBe(413);
      expect((await r.json()) as unknown).toMatchObject({ code: 'payload_too_large' });
      reset();
      expect((await fetch(`${base}/healthz`)).status).toBe(200); // segue de pé
    });

    it('JSON truncado → 400, e o request SEGUINTE responde 200', async () => {
      const r = await fetch(`${base}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"email": ',
      });
      expect(r.status).toBe(400);
      expect((await r.json()) as unknown).toMatchObject({ code: 'invalid_input' });
      expect((await fetch(`${base}/healthz`)).status).toBe(200);
    });

    it('/healthz responde 200 SEM tocar o banco (pool apontando p/ host morto)', async () => {
      const morto = createDb('postgres://ninguem:nada@127.0.0.1:1/naoexiste');
      const mortoWorld = createWorldDb('postgres://ninguem:nada@127.0.0.1:1/naoexiste');
      const s = createApiServer({
        db: morto.db,
        worldDb: mortoWorld.db,
        worldSeed: 'seed-de-teste',
        now: () => clock,
      });
      const porta = await listen(s);
      try {
        const r = await fetch(`http://127.0.0.1:${porta}/healthz`);
        expect(r.status).toBe(200);
        expect((await r.json()) as unknown).toEqual({ ok: true });
      } finally {
        await close(s);
        await morto.pool.end();
        await mortoWorld.pool.end();
      }
    });

    it('no-store em TODA resposta salvo /healthz — em particular a do login', async () => {
      expect((await fetch(`${base}/healthz`)).headers.get('cache-control')).toBeNull();
      expect((await login()).headers.get('cache-control')).toBe('no-store');
      reset();
      expect((await login(EMAIL, 'errada')).headers.get('cache-control')).toBe('no-store');
      expect((await fetch(`${base}/nao-existe`)).headers.get('cache-control')).toBe('no-store');
    });

    it('rota desconhecida → 404 genérico', async () => {
      const r = await fetch(`${base}/v1/nao-existe`);
      expect(r.status).toBe(404);
      expect((await r.json()) as unknown).toMatchObject({ code: 'not_found' });
    });

    it('nenhum header CORS é emitido — nenhuma página web lê a resposta', async () => {
      const r = await fetch(`${base}/healthz`);
      for (const [name] of r.headers) expect(name.startsWith('access-control-')).toBe(false);
    });

    it('senha e token NUNCA aparecem no log — inclusive no caminho que REALMENTE loga', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const token = await tokenOf();
      await fetch(`${base}/test/protected`, { headers: { authorization: `Bearer ${token}` } });
      // ⚠️ Os caminhos acima são de SUCESSO e não escrevem em console — sozinhos, tornariam esta
      // asserção VÁCUA (passaria mesmo se o servidor logasse a senha em todo erro). O 500 abaixo é
      // o único caminho que chama `logInternal`, então é ele que dá sentido ao teste.
      await fetch(`${base}/test/boom`, { headers: { authorization: `Bearer ${token}` } });
      expect(err.mock.calls.length).toBeGreaterThan(0); // provou que ALGO foi logado
      const escrito = [...err.mock.calls, ...log.mock.calls].flat().join(' ');
      expect(escrito).not.toContain(PASSWORD);
      expect(escrito).not.toContain(token);
    });

    it('POST /healthz (404) também leva no-store — o opt-out é por método+path', async () => {
      const r = await fetch(`${base}/healthz`, { method: 'POST' });
      expect(r.status).toBe(404);
      expect(r.headers.get('cache-control')).toBe('no-store');
    });
  });
});
