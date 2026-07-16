// Contrato da criação de conta + atleta contra Postgres REAL (SPEC-016). Prova: criação
// atômica, hash argon2id (nunca plaintext), invariante "1 atleta ativo/conta", CHECK 0..99,
// e reconciliação com a lib pura. Gated por DATABASE_URL (sem DB a suíte é PULADA).
// Serial + limpeza em ordem de FK (invariante SPEC-015).
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete, type AthleteDraft } from '@camisa-9/player';
import { createDb, type DbHandle } from '../src/client.js';
import { account, athlete } from '../src/schema/index.js';
import { verifyPassword } from '../src/store/auth.js';
import {
  createAccountWithAthlete,
  readAccountByEmail,
  readActiveAthlete,
} from '../src/store/player-repo.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';

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

describe.skipIf(!DB_URL)('player-store — conta + atleta contra Postgres real', () => {
  let handle: DbHandle;

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
    await handle.db.delete(athlete); // filho antes do pai (FK)
    await handle.db.delete(account);
  });

  it('cria conta + atleta e o atleta ativo é legível', async () => {
    const { accountId, athleteId } = await createAccountWithAthlete(handle.db, {
      email: 'Ze@Example.com',
      password: PASSWORD,
      draft: draft(),
    });
    expect(accountId).toBeTruthy();
    const active = await readActiveAthlete(handle.db, accountId);
    expect(active?.id).toBe(athleteId);
    expect(active?.name).toBe('Zé da Várzea');
    expect(await readAccountByEmail(handle.db, 'ze@example.com')).toBe(accountId); // normalizado
  });

  it('a senha é argon2id (nunca plaintext) e o verify faz round-trip', async () => {
    await createAccountWithAthlete(handle.db, { email: 'h@x.com', password: PASSWORD, draft: draft() });
    const [row] = await handle.db.select({ hash: account.passwordHash }).from(account).limit(1);
    expect(row?.hash).toBeTruthy();
    expect(row?.hash).not.toBe(PASSWORD);
    expect(row?.hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(row!.hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(row!.hash, 'senha-errada')).toBe(false);
  });

  it('e-mail duplicado → erro genérico + ROLLBACK (sem conta/atleta órfão)', async () => {
    await createAccountWithAthlete(handle.db, { email: 'dup@x.com', password: PASSWORD, draft: draft('Um') });
    await expect(
      createAccountWithAthlete(handle.db, { email: 'dup@x.com', password: PASSWORD, draft: draft('Dois') }),
    ).rejects.toThrow('e-mail já em uso');
    expect(await countRows(account)).toBe(1);
    expect(await countRows(athlete)).toBe(1); // o atleta do 2º NÃO foi criado
  });

  it('invariante: 1 atleta ATIVO por conta (índice único parcial)', async () => {
    const { accountId } = await createAccountWithAthlete(handle.db, {
      email: 'solo@x.com',
      password: PASSWORD,
      draft: draft(),
    });
    await expect(insertRawAthlete(accountId, { fisico: 34 })).rejects.toThrow();
    expect(await countRows(athlete)).toBe(1);
  });

  it('CHECK 0..99: foco fora da faixa é rejeitado pelo banco', async () => {
    const { accountId } = await createAccountWithAthlete(handle.db, {
      email: 'chk@x.com',
      password: PASSWORD,
      draft: draft(),
    });
    await handle.db.delete(athlete); // libera o slot ativo
    await expect(insertRawAthlete(accountId, { fisico: 100 })).rejects.toThrow();
  });

  it('reconciliação: o draft da lib pura persiste e volta byte-a-byte', async () => {
    const d = draft('João-Pedro');
    const { athleteId, accountId } = await createAccountWithAthlete(handle.db, {
      email: 'rec@x.com',
      password: PASSWORD,
      draft: d,
    });
    const [row] = await handle.db
      .select({
        name: athlete.name,
        position: athlete.position,
        appearance: athlete.appearance,
        fisico: athlete.fisico,
        trainingXp: athlete.trainingXp,
      })
      .from(athlete)
      .limit(1);
    expect(athleteId).toBeTruthy();
    expect(accountId).toBeTruthy();
    expect(row?.name).toBe('João-Pedro');
    expect(row?.position).toBe('FWD');
    expect(row?.appearance).toEqual(d.appearance);
    expect(row?.fisico).toBe(34);
    expect(row?.trainingXp).toBe(0); // o seam da barra começa zerado
  });

  async function countRows(table: typeof account | typeof athlete): Promise<number> {
    const rows = await handle.db.select({ x: table.createdAt }).from(table);
    return rows.length;
  }

  async function insertRawAthlete(accountId: string, over: { fisico: number }): Promise<unknown> {
    return handle.db.insert(athlete).values({
      accountId,
      name: 'Raw',
      position: 'GK',
      appearance: { skinTone: 0, hairStyle: 0, hairColor: 0 },
      fisico: over.fisico,
      tecnico: 34,
      tatico: 34,
      mental: 34,
    });
  }
});
