// As 4 escritas de gameplay (SPEC-041) contra um servidor REAL: POST /v1/training/spend ·
// decisions/answer · purchases · regen. Sobe via createApiServer + listen(0); relógio INJETADO.
// Cobre sucesso + cada erro mapeado + auth por construção + rate limit (accountId e IP pré-auth).
// Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAthlete, templateById, type Position } from '@camisa-9/player';
import { choiceOptionById } from '@camisa-9/world-engine';
import {
  createAccountWithAthlete,
  createDb as createPlayerDb,
  generateForDay,
  readAthleteProgress,
  readDecisionLog,
  readMatchChoices,
  readMood,
  readWallet,
  schema as playerSchema,
  type DbHandle as PlayerHandle,
} from '@camisa-9/player-store';
import {
  advanceTickCursor,
  createDb as createWorldDb,
  occupyNpcSlot,
  readOccupation,
  readWorld,
  runRoundForDay,
  schema as worldSchema,
  setSeasonAnchor,
  writeWorld,
  type DbHandle as WorldHandle,
} from '@camisa-9/world-store';
import { createApiServer } from '../src/server.js';
import { reset } from '../src/http/rate-limit.js';

const DB_URL = process.env.DATABASE_URL;
const SEED = 'writes-041';
const PASSWORD = 'senha-bem-forte-123';
const T0 = 1_700_000_000_000;
let seq = 0;

const listen = (s: Server): Promise<number> =>
  new Promise((r) =>
    s.listen(0, () => {
      const a = s.address();
      r(typeof a === 'object' && a ? a.port : 0);
    }),
  );
const close = (s: Server): Promise<void> => new Promise((r) => s.close(() => r()));

describe.skipIf(!DB_URL)('escritas de gameplay — servidor real (SPEC-041)', () => {
  let worldHandle: WorldHandle;
  let playerHandle: PlayerHandle;
  let server: Server;
  let proxy: Server; // trustProxyHops=1: IPs distintos p/ o balde de accountId sem esbarrar no de IP
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

  /** Cria conta+atleta (FWD) e ocupa uma vaga. Devolve email + athleteId. */
  async function seat(): Promise<{ email: string; athleteId: string }> {
    seq += 1;
    const email = `w${seq}@x.com`;
    const draft = createAthlete({
      name: 'Craque',
      position: 'FWD' as Position,
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(playerHandle.db, {
      email,
      password: PASSWORD,
      draft: draft.value,
    });
    const clubId = await entryClubId();
    const res = await occupyNpcSlot(worldHandle.db, {
      worldSeed: SEED,
      clubId,
      position: 'FWD',
      humanAthleteId: athleteId,
      humanName: 'Craque',
      ability: 34,
    });
    await setSeasonAnchor(worldHandle.db, SEED, res.seasonId, 20_000);
    return { email, athleteId };
  }

  async function token(email: string): Promise<string> {
    const r = await fetch(`${base}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return ((await r.json()) as { token: string }).token;
  }

  const post = (path: string, tok: string, body?: unknown): Promise<Response> =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  describe('POST /v1/training/spend', () => {
    it('gasta 1 ponto no atributo → 200 e o estado muda', async () => {
      const { email, athleteId } = await seat();
      await playerHandle.db
        .update(playerSchema.athlete)
        .set({ freePoints: 2 })
        .where(eq(playerSchema.athlete.id, athleteId));
      reset();
      const r = await post('/v1/training/spend', await token(email), { attribute: 'fisico' });
      expect(r.status).toBe(200);
      expect((await r.json()) as unknown).toEqual({ ok: true });
      const p = (await readAthleteProgress(playerHandle.db, athleteId))!;
      expect(p.freePoints).toBe(1);
      expect(p.attributes.fisico).toBe(35);
    });

    it('sem ponto → 409 no_free_points', async () => {
      const { email } = await seat();
      reset();
      const r = await post('/v1/training/spend', await token(email), { attribute: 'fisico' });
      expect(r.status).toBe(409);
      expect((await r.json()) as unknown).toMatchObject({ code: 'no_free_points' });
    });

    it('atributo inválido → 400', async () => {
      const { email } = await seat();
      reset();
      const r = await post('/v1/training/spend', await token(email), { attribute: 'velocidade' });
      expect(r.status).toBe(400);
      expect((await r.json()) as unknown).toMatchObject({ code: 'invalid_input' });
    });

    it('dois spend CONCORRENTES com 1 ponto → um 200, um 409; o atributo sobe 1× só (FOR UPDATE)', async () => {
      const { email, athleteId } = await seat();
      await playerHandle.db
        .update(playerSchema.athlete)
        .set({ freePoints: 1 })
        .where(eq(playerSchema.athlete.id, athleteId));
      reset();
      const tok = await token(email);
      const [a, b] = await Promise.all([
        post('/v1/training/spend', tok, { attribute: 'fisico' }),
        post('/v1/training/spend', tok, { attribute: 'fisico' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]); // um venceu, o outro no_free_points
      const p = (await readAthleteProgress(playerHandle.db, athleteId))!;
      expect(p.freePoints).toBe(0);
      expect(p.attributes.fisico).toBe(35); // subiu 1× só (não 36) — nenhum ponto fabricado
    });
  });

  describe('POST /v1/decisions/answer', () => {
    async function genDecision(athleteId: string): Promise<{ id: string; optionId: string }> {
      await generateForDay(playerHandle.db, athleteId, 100, SEED);
      const log = await readDecisionLog(playerHandle.db, athleteId);
      const pending = log.find((e) => e.status === 'pending')!;
      return { id: pending.id, optionId: templateById(pending.templateId)!.options[0]!.id };
    }

    it('responde uma decisão pendente → 200', async () => {
      const { email, athleteId } = await seat();
      const dec = await genDecision(athleteId);
      reset();
      const r = await post('/v1/decisions/answer', await token(email), {
        decisionId: dec.id,
        optionId: dec.optionId,
      });
      expect(r.status).toBe(200);
    });

    it('responder 2× a mesma → 409 decision_resolved (não 500, não dupla)', async () => {
      const { email, athleteId } = await seat();
      const dec = await genDecision(athleteId);
      reset();
      const tok = await token(email);
      const body = { decisionId: dec.id, optionId: dec.optionId };
      expect((await post('/v1/decisions/answer', tok, body)).status).toBe(200);
      const again = await post('/v1/decisions/answer', tok, body);
      expect(again.status).toBe(409);
      expect((await again.json()) as unknown).toMatchObject({ code: 'decision_resolved' });
    });

    it('decisão inexistente → 404; opção inválida → 400', async () => {
      const { email, athleteId } = await seat();
      const dec = await genDecision(athleteId);
      reset();
      const tok = await token(email);
      const nf = await post('/v1/decisions/answer', tok, {
        decisionId: '00000000-0000-0000-0000-0000000000ff', // uuid válido, ausente
        optionId: dec.optionId,
      });
      expect(nf.status).toBe(404);
      const bad = await post('/v1/decisions/answer', tok, { decisionId: dec.id, optionId: 'xx' });
      expect(bad.status).toBe(400);
      expect((await bad.json()) as unknown).toMatchObject({ code: 'invalid_option' });
    });

    it('decisionId mal-formado (não-UUID) → 400 invalid_input (não 500 por 22P02)', async () => {
      const { email } = await seat();
      reset();
      const r = await post('/v1/decisions/answer', await token(email), {
        decisionId: 'nao-e-uuid',
        optionId: 'x',
      });
      expect(r.status).toBe(400);
      expect((await r.json()) as unknown).toMatchObject({ code: 'invalid_input' });
    });

    it('decisão de OUTRO atleta → 404 (answerDecision filtra por dono)', async () => {
      const a = await seat();
      const b = await seat();
      const decB = await genDecision(b.athleteId);
      reset();
      const r = await post('/v1/decisions/answer', await token(a.email), {
        decisionId: decB.id,
        optionId: decB.optionId,
      });
      expect(r.status).toBe(404);
    });
  });

  describe('POST /v1/purchases', () => {
    it('compra com saldo → 200; sem saldo → 409; repetida → 409 already_owned', async () => {
      const { email, athleteId } = await seat();
      await playerHandle.db
        .update(playerSchema.athlete)
        .set({ balance: 1000 })
        .where(eq(playerSchema.athlete.id, athleteId));
      reset();
      const tok = await token(email);
      const ok = await post('/v1/purchases', tok, { itemId: 'videogame' });
      expect(ok.status).toBe(200);
      const wallet = (await readWallet(playerHandle.db, athleteId))!;
      expect(wallet.ownedItemIds).toContain('videogame');
      expect(wallet.balance).toBe(500); // 1000 - 500

      const dup = await post('/v1/purchases', tok, { itemId: 'videogame' });
      expect(dup.status).toBe(409);
      expect((await dup.json()) as unknown).toMatchObject({ code: 'already_owned' });

      const broke = await post('/v1/purchases', tok, { itemId: 'carro' }); // 3000 > 500
      expect(broke.status).toBe(409);
      expect((await broke.json()) as unknown).toMatchObject({ code: 'insufficient_balance' });
    });

    it('item inválido → 400', async () => {
      const { email } = await seat();
      reset();
      const r = await post('/v1/purchases', await token(email), { itemId: 'jatinho' });
      expect(r.status).toBe(400);
    });
  });

  describe('POST /v1/regen', () => {
    it('jovem (<25) → 409 regen_ineligible', async () => {
      const { email } = await seat(); // entra aos 17
      reset();
      const r = await post('/v1/regen', await token(email));
      expect(r.status).toBe(409);
      expect((await r.json()) as unknown).toMatchObject({ code: 'regen_ineligible' });
    });

    it('idade ≥25 → 200 (a flag de regen fica ligada; a viragem executa)', async () => {
      const { email, athleteId } = await seat();
      const occ = (await readOccupation(worldHandle.db, SEED, athleteId))!;
      await worldHandle.db
        .update(worldSchema.athlete)
        .set({ age: 25 })
        .where(eq(worldSchema.athlete.id, occ.athleteId));
      reset();
      const r = await post('/v1/regen', await token(email));
      expect(r.status).toBe(200);
    });
  });

  describe('auth + rate limit', () => {
    it('sem header → 401; conta mid-regen → 409', async () => {
      const { email, athleteId } = await seat();
      expect((await fetch(`${base}/v1/training/spend`, { method: 'POST' })).status).toBe(401);
      const tok = await token(email);
      await playerHandle.db
        .update(playerSchema.athlete)
        .set({ active: false })
        .where(eq(playerSchema.athlete.id, athleteId));
      const r = await post('/v1/training/spend', tok, { attribute: 'fisico' });
      expect(r.status).toBe(409);
      expect((await r.json()) as unknown).toMatchObject({ code: 'no_active_athlete' });
    });

    it('balde por accountId: 6 regens (IPs rotacionados) → a 6ª é 429 com Retry-After', async () => {
      const { email } = await seat();
      reset();
      const tok = await token(email);
      const regenFrom = (ip: string): Promise<Response> =>
        fetch(`${proxyBase}/v1/regen`, {
          method: 'POST',
          headers: { authorization: `Bearer ${tok}`, 'x-forwarded-for': `forjado, ${ip}` },
        });
      for (let i = 0; i < 5; i++) await regenFrom(`10.0.0.${i}`); // limite regen = 5
      const limited = await regenFrom('10.0.0.9');
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBeTruthy(); // Critério 5: o header acompanha o 429
    });

    it('treino: 11 spend do MESMO IP → todos 200 (fix da revisão: o teto write era 10 < 30 por-conta)', async () => {
      const { email, athleteId } = await seat();
      await playerHandle.db
        .update(playerSchema.athlete)
        .set({ freePoints: 15 })
        .where(eq(playerSchema.athlete.id, athleteId));
      reset();
      const tok = await token(email);
      // O antigo balde `write` COMUM (10) barrava o 11º spend — o jogador não conseguia distribuir os
      // pontos acumulados (o gancho central). Agora o treino tem balde de IP próprio a 40 (> os 30 por-conta).
      for (let i = 0; i < 11; i++) {
        const r = await post('/v1/training/spend', tok, { attribute: 'fisico' });
        expect(r.status).toBe(200);
      }
    });

    it('balde de IP pré-auth: 11 tokens inválidos do mesmo IP (purchases, teto 10) → 429', async () => {
      reset();
      // Os 10 primeiros PAGAM um readSessionByHash (token-lixo → null → 401); o balde de IP morde o 11º
      // ANTES da auth — o teto coarse da SPEC-038 (sem ele, o flood de token inválido seria ilimitado).
      for (let i = 0; i < 10; i++) {
        const r = await post('/v1/purchases', 'lixo-invalido', { itemId: 'videogame' });
        expect(r.status).toBe(401);
      }
      const limited = await post('/v1/purchases', 'lixo-invalido', { itemId: 'videogame' });
      expect(limited.status).toBe(429);
    });
  });

  describe('POST /v1/matches/choices/answer (SPEC-050)', () => {
    const D050 = 20_000; // = o startDay que o seat() ancora → a rodada mostrada é a 1
    const atDay = (hour: number): number => D050 * 86_400_000 + hour * 3_600_000 + 3 * 3_600_000;

    interface BandChoiceJson {
      readonly minute: number;
      readonly templateId: string;
      readonly options: readonly { id: string; label: string; risky?: boolean; attr?: string }[];
      readonly chosenOptionId?: string;
      readonly result?: string;
    }

    async function getChoices(tok: string): Promise<BandChoiceJson[]> {
      const r = await fetch(`${base}/v1/band`, { headers: { authorization: `Bearer ${tok}` } });
      const body = (await r.json()) as {
        club: { todayMatch: { choices?: BandChoiceJson[] } | null } | null;
      };
      return body.club?.todayMatch?.choices ?? [];
    }

    /** seat + rodada 1 publicada + cursor liquidado + relógio às 16h do dia da partida. */
    async function playedSeat(): Promise<{ email: string; athleteId: string }> {
      const s = await seat();
      clock = atDay(16);
      await runRoundForDay(worldHandle.db, SEED, D050);
      await advanceTickCursor(worldHandle.db, SEED, D050);
      reset();
      return s;
    }

    it('responde uma escolha da oferta → 200; o band ANOTA; 2ª resposta → 409 choice_resolved', async () => {
      const { email } = await playedSeat();
      const tok = await token(email);
      const offer = await getChoices(tok);
      expect(offer.length).toBeGreaterThanOrEqual(1);
      const target = offer[0]!;
      const opt = target.options[0]!;
      const r = await post('/v1/matches/choices/answer', tok, {
        round: 1,
        templateId: target.templateId,
        optionId: opt.id,
      });
      expect(r.status).toBe(200);
      expect((await r.json()) as unknown).toEqual({ ok: true });
      const annotated = (await getChoices(tok)).find((c) => c.templateId === target.templateId)!;
      expect(annotated.chosenOptionId).toBe(opt.id);
      expect(['success', 'fail', 'na']).toContain(annotated.result);
      const r2 = await post('/v1/matches/choices/answer', tok, {
        round: 1,
        templateId: target.templateId,
        optionId: opt.id,
      });
      expect(r2.status).toBe(409);
      expect((await r2.json()) as unknown).toMatchObject({ code: 'choice_resolved' });
    });

    it('opção ARRISCADA → roll server-side: o efeito do RESULT (nunca o do cliente) é o aplicado', async () => {
      // A oferta é determinística por atleta; procura um seat cuja oferta tenha opção risky (≤4
      // FWDs no clube de entrada). Com 2 templates arriscados sempre-elegíveis, acha rápido.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { email, athleteId } = await playedSeat();
        await playerHandle.db
          .update(playerSchema.athlete)
          .set({ fisico: 20, tecnico: 90, tatico: 25, mental: 80 }) // focos ASSIMÉTRICOS (lição 029→046→047)
          .where(eq(playerSchema.athlete.id, athleteId));
        const tok = await token(email);
        const offer = await getChoices(tok);
        const target = offer.find((c) => c.options.some((o) => o.risky === true));
        if (!target) continue;
        const opt = target.options.find((o) => o.risky === true)!;
        expect(typeof opt.attr).toBe('string'); // o contrato telegrafa o foco do roll
        const r = await post('/v1/matches/choices/answer', tok, {
          round: 1,
          templateId: target.templateId,
          optionId: opt.id,
        });
        expect(r.status).toBe(200);
        const annotated = (await getChoices(tok)).find((c) => c.templateId === target.templateId)!;
        expect(['success', 'fail']).toContain(annotated.result); // arriscada NUNCA é 'na'
        // O efeito persistido é o DECLARADO do catálogo para o result — hidratado server-side.
        const catOpt = choiceOptionById(target.templateId, opt.id)!;
        const occ = (await readOccupation(worldHandle.db, SEED, athleteId))!;
        const rows = await readMatchChoices(playerHandle.db, athleteId, occ.seasonId, 1);
        const row = rows.find((x) => x.templateId === target.templateId)!;
        expect(row.result).toBe(annotated.result);
        expect(row.effect).toEqual(
          annotated.result === 'success' ? catOpt.effect : catOpt.risky!.fail,
        );
        const m = row.effect['moral'];
        expect((await readMood(playerHandle.db, athleteId))!.moral).toBe(
          50 + (typeof m === 'number' ? m : 0),
        );
        return;
      }
      throw new Error('nenhuma oferta com opção arriscada em 4 seats — ajustar o fixture');
    });

    it('gates: round errado → 409; template fora da oferta → 400; body inválido → 400; sem auth → 401', async () => {
      const { email } = await playedSeat();
      const tok = await token(email);
      const r1 = await post('/v1/matches/choices/answer', tok, {
        round: 2,
        templateId: 'chance-clara',
        optionId: 'seguro',
      });
      expect(r1.status).toBe(409);
      expect((await r1.json()) as unknown).toMatchObject({ code: 'choice_not_available' });
      const r2 = await post('/v1/matches/choices/answer', tok, {
        round: 1,
        templateId: 'nao-existe',
        optionId: 'x',
      });
      expect(r2.status).toBe(400);
      expect((await r2.json()) as unknown).toMatchObject({ code: 'invalid_option' });
      const r3 = await post('/v1/matches/choices/answer', tok, {
        round: 1.5,
        templateId: 'a',
        optionId: 'b',
      });
      expect(r3.status).toBe(400);
      expect((await r3.json()) as unknown).toMatchObject({ code: 'invalid_input' });
      const r4 = await fetch(`${base}/v1/matches/choices/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(r4.status).toBe(401); // OP-09: sessão primeiro — a rota é inalcançável sem ela
    });

    it('a janela vai até o tick de D+1: às 09h da manhã seguinte a resposta ainda entra (200)', async () => {
      const { email } = await playedSeat();
      clock = (D050 + 1) * 86_400_000 + 9 * 3_600_000 + 3 * 3_600_000; // 09h BRT de D+1 → tickDay = D
      const tok = await token(email);
      const offer = await getChoices(tok);
      expect(offer.length).toBeGreaterThanOrEqual(1); // a rodada de ONTEM ainda é a mostrada
      const target = offer[0]!;
      const r = await post('/v1/matches/choices/answer', tok, {
        round: 1,
        templateId: target.templateId,
        optionId: target.options[0]!.id,
      });
      expect(r.status).toBe(200);
    });

    it('balde por conta: a 31ª resposta no minuto → 429 com Retry-After (IP `matches` 40 não morde antes)', async () => {
      const { email } = await playedSeat();
      const tok = await token(email);
      // As 30 primeiras passam o balde (o teto morde ANTES da lógica — respostas viram 400 aqui).
      for (let i = 0; i < 30; i++) {
        const r = await post('/v1/matches/choices/answer', tok, {
          round: 1,
          templateId: 'nao-existe',
          optionId: 'x',
        });
        expect(r.status).toBe(400);
      }
      const limited = await post('/v1/matches/choices/answer', tok, {
        round: 1,
        templateId: 'nao-existe',
        optionId: 'x',
      });
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBeTruthy();
    });

    it('rodada NÃO liquidada (sem cursor) → 409 choice_not_available', async () => {
      const { email } = await seat();
      clock = atDay(16); // 16h do dia da rodada 1, mas nada publicado/cursor
      reset();
      const tok = await token(email);
      const r = await post('/v1/matches/choices/answer', tok, {
        round: 1,
        templateId: 'chance-clara',
        optionId: 'seguro',
      });
      expect(r.status).toBe(409);
      expect((await r.json()) as unknown).toMatchObject({ code: 'choice_not_available' });
    });
  });
});
