// Contrato da sessão contra Postgres REAL (SPEC-037, critérios 2 e 3). Prova: o token NUNCA em
// claro no banco, os DOIS relógios (idle 7d + absoluto 30d), o deslize throttled, o logout, o cap
// de 10 por conta e a purga. Gated por DATABASE_URL (sem DB a suíte é PULADA).
// ⚠️ ZERO `sleep`: o `nowMs` é INJETADO em todas as funções, então "8 dias depois" é aritmética.
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete, type AthleteDraft } from '@camisa-9/player';
import { createDb, type DbHandle } from '../src/client.js';
import {
  account,
  athlete,
  dailyLedger,
  decision,
  injury,
  purchase,
  session,
} from '../src/schema/index.js';
import { OPTS } from '../src/store/auth.js';
import { createAccountWithAthlete } from '../src/store/player-repo.js';
import {
  DUMMY_HASH,
  authenticate,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  readSessionByHash,
  touchSession,
  SESSION,
} from '../src/store/session-repo.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
const EMAIL = 'craque@varzea.test';
const T0 = 1_700_000_000_000; // epoch fixo — nada aqui lê relógio
const DAY = 86_400_000;

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

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

// PURO (roda sempre, sem DB): a defesa contra enumeração depende de o dummy custar o MESMO que um
// hash real. Medir latência é frágil em CI; comparar os parâmetros embutidos é determinístico.
describe('DUMMY_HASH — a defesa de timing (critério 3)', () => {
  it('tem os MESMOS parâmetros argon2 dos hashes reais', () => {
    const params = /\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(DUMMY_HASH);
    expect(params).not.toBeNull();
    expect(Number(params?.[1])).toBe(OPTS.memoryCost);
    expect(Number(params?.[2])).toBe(OPTS.timeCost);
    expect(Number(params?.[3])).toBe(OPTS.parallelism);
  });
});

describe.skipIf(!DB_URL)('session-repo — sessão contra Postgres real', () => {
  let handle: DbHandle;
  let accountId: string;

  beforeAll(async () => {
    handle = createDb(DB_URL as string);
    await migrate(handle.db, {
      migrationsFolder: fileURLToPath(new URL('../src/migrations', import.meta.url)),
      migrationsSchema: 'drizzle_player',
    });
  });

  afterAll(async () => {
    if (handle) await handle.pool.end();
  });

  beforeEach(async () => {
    await handle.db.delete(injury);
    await handle.db.delete(decision);
    await handle.db.delete(purchase);
    await handle.db.delete(dailyLedger);
    await handle.db.delete(athlete);
    await handle.db.delete(session); // filha de account (FK)
    await handle.db.delete(account);
    const created = await createAccountWithAthlete(handle.db, {
      email: EMAIL,
      password: PASSWORD,
      draft: draft(),
    });
    accountId = created.accountId;
  });

  describe('authenticate — o portão', () => {
    it('aceita a credencial certa e devolve conta + atleta ativo', async () => {
      const r = await authenticate(handle.db, EMAIL, PASSWORD);
      expect(r?.accountId).toBe(accountId);
      expect(r?.athleteId).toBeTruthy();
    });

    it('recusa senha errada E e-mail inexistente com o MESMO resultado', async () => {
      expect(await authenticate(handle.db, EMAIL, 'senha-errada-123')).toBeNull();
      expect(await authenticate(handle.db, 'ninguem@lugar.test', PASSWORD)).toBeNull();
    });

    it('normaliza o e-mail (caixa/espaço não criam conta nova)', async () => {
      const r = await authenticate(handle.db, `  ${EMAIL.toUpperCase()}  `, PASSWORD);
      expect(r?.accountId).toBe(accountId);
    });
  });

  describe('o token nunca em claro (critério 2a)', () => {
    it('persiste só o sha256; o token devolvido NÃO aparece no banco', async () => {
      const token = 'token-de-teste-opaco-123';
      await createSession(handle.db, accountId, sha256(token), T0);
      const rows = await handle.db
        .select({ tokenHash: session.tokenHash })
        .from(session)
        .where(eq(session.accountId, accountId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(sha256(token));
      expect(rows[0]?.tokenHash).not.toBe(token);
      expect(rows[0]?.tokenHash).not.toContain(token);
    });
  });

  describe('os dois relógios (critérios 2b, 2c, 2d)', () => {
    it('desliza a janela idle, mas THROTTLED: dois usos em 1 min = 1 UPDATE', async () => {
      const h = sha256('tok-throttle');
      await createSession(handle.db, accountId, h, T0);
      // O primeiro uso: `last_seen_at` acabou de ser gravado (defaultNow ≈ agora real), então o
      // throttle depende do relógio INJETADO estar bem à frente — 13h depois.
      expect(await touchSession(handle.db, h, T0 + 13 * 3_600_000)).toBe(true);
      // 1 minuto depois do bump: dentro da janela de 12h ⇒ NÃO escreve.
      expect(await touchSession(handle.db, h, T0 + 13 * 3_600_000 + 60_000)).toBe(false);
    });

    it('mata por IDLE (8 dias sem uso) mesmo com o teto absoluto longe', async () => {
      const h = sha256('tok-idle');
      await createSession(handle.db, accountId, h, T0);
      expect(await readSessionByHash(handle.db, h, T0 + DAY)).not.toBeNull();
      const idleDeath = T0 + SESSION.idleTtlMs + DAY; // 8 dias
      expect(await readSessionByHash(handle.db, h, idleDeath)).toBeNull();
    });

    it('a BORDA do idle é o valor da constante, não uma faixa qualquer', async () => {
      // Sem sondar a borda, `idleTtlMs` poderia ser 1d ou 29d com a suíte igualmente verde.
      const h = sha256('tok-borda-idle');
      await createSession(handle.db, accountId, h, T0);
      expect(await readSessionByHash(handle.db, h, T0 + SESSION.idleTtlMs - 1_000)).not.toBeNull();
      expect(await readSessionByHash(handle.db, h, T0 + SESSION.idleTtlMs + 1_000)).toBeNull();
    });

    it('a BORDA do teto absoluto é o valor da constante', async () => {
      const h = sha256('tok-borda-abs');
      await createSession(handle.db, accountId, h, T0);
      // Desliza até o fim para isolar o teto absoluto do relógio de idle.
      await touchSession(handle.db, h, T0 + SESSION.absoluteTtlMs - 60_000);
      expect(
        await readSessionByHash(handle.db, h, T0 + SESSION.absoluteTtlMs - 1_000),
      ).not.toBeNull();
      expect(await readSessionByHash(handle.db, h, T0 + SESSION.absoluteTtlMs + 1_000)).toBeNull();
    });

    it('a BORDA do throttle é o valor da constante', async () => {
      const h = sha256('tok-borda-throttle');
      await createSession(handle.db, accountId, h, T0);
      expect(await touchSession(handle.db, h, T0 + SESSION.touchThrottleMs - 1_000)).toBe(false);
      expect(await touchSession(handle.db, h, T0 + SESSION.touchThrottleMs + 1_000)).toBe(true);
    });

    it('mata pelo teto ABSOLUTO (30d) mesmo com deslize contínuo', async () => {
      const h = sha256('tok-absoluto');
      await createSession(handle.db, accountId, h, T0);
      // Desliza a cada 13h ao longo de 29 dias — a janela idle nunca vence.
      for (let d = 1; d <= 29; d++) await touchSession(handle.db, h, T0 + d * DAY);
      expect(await readSessionByHash(handle.db, h, T0 + 29 * DAY + 3_600_000)).not.toBeNull();
      // No dia 31 o teto absoluto já passou: deslizar não salva.
      await touchSession(handle.db, h, T0 + 31 * DAY);
      expect(await readSessionByHash(handle.db, h, T0 + 31 * DAY)).toBeNull();
    });
  });

  describe('logout e purga (critérios 2e, 2f)', () => {
    it('logout mata o token; deletar de novo é no-op (nunca vira oráculo)', async () => {
      const h = sha256('tok-logout');
      await createSession(handle.db, accountId, h, T0);
      await deleteSession(handle.db, h);
      expect(await readSessionByHash(handle.db, h, T0 + 60_000)).toBeNull();
      await expect(deleteSession(handle.db, h)).resolves.toBeUndefined();
    });

    it('a purga remove SÓ as vencidas pelo teto absoluto', async () => {
      const viva = sha256('tok-viva');
      const morta = sha256('tok-morta');
      await createSession(handle.db, accountId, morta, T0);
      await createSession(handle.db, accountId, viva, T0 + 20 * DAY);
      const removed = await deleteExpiredSessions(handle.db, T0 + 31 * DAY);
      expect(removed).toBe(1);
      const rows = await handle.db
        .select({ tokenHash: session.tokenHash })
        .from(session)
        .where(eq(session.accountId, accountId));
      expect(rows.map((r) => r.tokenHash)).toEqual([viva]);
    });
  });

  describe('cap de sessões vivas por conta (critério 2g)', () => {
    it('12 logins deixam 10 linhas, e os 2 tokens mais antigos morrem', async () => {
      const hashes: string[] = [];
      for (let i = 0; i < 12; i++) {
        const h = sha256(`tok-cap-${i}`);
        hashes.push(h);
        await createSession(handle.db, accountId, h, T0 + i * 1_000);
      }
      const rows = await handle.db
        .select({ tokenHash: session.tokenHash })
        .from(session)
        .where(eq(session.accountId, accountId));
      expect(rows).toHaveLength(SESSION.maxLive);
      // Os 2 primeiros caíram; o último continua vivo.
      expect(await readSessionByHash(handle.db, hashes[0] as string, T0 + 60_000)).toBeNull();
      expect(await readSessionByHash(handle.db, hashes[1] as string, T0 + 60_000)).toBeNull();
      expect(await readSessionByHash(handle.db, hashes[11] as string, T0 + 60_000)).not.toBeNull();
    });

    it('sob carga concorrente, nenhuma sessão abaixo do cap se perde (smoke)', async () => {
      // ⚠️ HONESTIDADE SOBRE O QUE ESTE TESTE É: um smoke de carga, NÃO uma regressão determinística.
      // Verifiquei: ele passa TAMBÉM com a poda em dois statements (a versão com o bug) — o
      // `Promise.all` não força a intercalação que dispara a corrida (SELECT de B → commit de A →
      // DELETE de B). Reproduzir aquilo exige pausar DENTRO da transação, que o código não permite
      // instrumentar. O que protege de fato é a CONSTRUÇÃO: a poda é um único statement com o
      // SELECT das mantidas como subquery, então subquery e DELETE compartilham o mesmo snapshot.
      // A corrida foi reproduzida e a correção validada ao vivo na revisão adversarial da SPEC-037.
      // ⚠️ Um refactor que volte a partir a poda em dois statements NÃO é pego por este teste —
      // está registrado como lacuna conhecida no DONE.
      const hashes = Array.from({ length: 8 }, (_, i) => sha256(`tok-corrida-${i}`));
      await Promise.all(hashes.map((h, i) => createSession(handle.db, accountId, h, T0 + i)));
      const vivas = await Promise.all(
        hashes.map((h) => readSessionByHash(handle.db, h, T0 + 60_000)),
      );
      expect(vivas.filter((v) => v !== null)).toHaveLength(8);
    });

    it('o cap é POR CONTA — a sessão de outra conta não é podada', async () => {
      const outra = await createAccountWithAthlete(handle.db, {
        email: 'outro@varzea.test',
        password: PASSWORD,
        draft: draft('Outro Craque'),
      });
      const daOutra = sha256('tok-outra-conta');
      await createSession(handle.db, outra.accountId, daOutra, T0);
      for (let i = 0; i < 12; i++) {
        await createSession(handle.db, accountId, sha256(`tok-enche-${i}`), T0 + i * 1_000);
      }
      expect(await readSessionByHash(handle.db, daOutra, T0 + 60_000)).not.toBeNull();
    });
  });
});
