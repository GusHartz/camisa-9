// Economia (SPEC-024) contra Postgres REAL: `accrueRound` credita salário+prêmio; `purchaseItem` é
// a compra ATÔMICA (deduz saldo + grava posse) que NÃO toca os focos (nunca loja de stats); regras
// (saldo/1×/moradia em ordem); `readWallet` (moradia/marco/agregado). Gated por DATABASE_URL. Serial.
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete, matchPrize, salaryPerRound } from '@camisa-9/player';
import {
  accrueRound,
  createAccountWithAthlete,
  createDb,
  purchaseItem,
  readWallet,
  schema,
  type DbHandle,
} from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)('economy-repo — salário e estilo de vida contra Postgres real', () => {
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
    await handle.db.delete(schema.decision);
    await handle.db.delete(schema.purchase);
    await handle.db.delete(schema.athlete);
    await handle.db.delete(schema.team);
    await handle.db.delete(schema.account);
  });

  /** Cria um atleta fresco (overall 34) e devolve o id. */
  async function newAthlete(): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name: 'Grana',
      position: 'GK',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(handle.db, {
      email: `e${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    return athleteId;
  }

  async function setBalance(athleteId: string, balance: number): Promise<void> {
    await handle.db.update(schema.athlete).set({ balance }).where(eq(schema.athlete.id, athleteId));
  }

  it('accrueRound credita o salário (e o prêmio com resultado)', async () => {
    const id = await newAthlete(); // overall 34
    const r1 = await accrueRound(handle.db, id);
    expect(r1.credited).toBe(salaryPerRound(34));
    expect(r1.balance).toBe(salaryPerRound(34));
    const r2 = await accrueRound(handle.db, id, 'win');
    expect(r2.credited).toBe(salaryPerRound(34) + matchPrize('win'));
    expect(r2.balance).toBe(salaryPerRound(34) * 2 + matchPrize('win'));
  });

  it('compra atômica deduz o saldo, grava a posse — e NÃO toca os focos (nunca loja de stats)', async () => {
    const id = await newAthlete();
    await setBalance(id, 1000);
    const w = await purchaseItem(handle.db, id, 'videogame'); // custa 500
    expect(w.balance).toBe(500);
    expect(w.ownedItemIds).toContain('videogame');
    // ANTI-LOJA-DE-STATS: os 4 focos ficam INTOCADOS pela compra
    const [a] = await handle.db
      .select({
        f: schema.athlete.fisico,
        t: schema.athlete.tecnico,
        ta: schema.athlete.tatico,
        m: schema.athlete.mental,
      })
      .from(schema.athlete)
      .where(eq(schema.athlete.id, id));
    expect(a).toEqual({ f: 34, t: 34, ta: 34, m: 34 });
  });

  it('saldo insuficiente → erro genérico, nada muda', async () => {
    const id = await newAthlete();
    await setBalance(id, 100);
    await expect(purchaseItem(handle.db, id, 'carro')).rejects.toThrow(/saldo insuficiente/i);
    const w = await readWallet(handle.db, id);
    expect(w?.balance).toBe(100);
    expect(w?.ownedItemIds).toHaveLength(0);
  });

  it('item já adquirido → erro (1×)', async () => {
    const id = await newAthlete();
    await setBalance(id, 5000);
    await purchaseItem(handle.db, id, 'videogame');
    await expect(purchaseItem(handle.db, id, 'videogame')).rejects.toThrow(/já adquirido/i);
  });

  it('moradia sobe a escada EM ORDEM; fora de ordem → erro; lifestyleTier reflete', async () => {
    const id = await newAthlete();
    await setBalance(id, 100000);
    await expect(purchaseItem(handle.db, id, 'casa')).rejects.toThrow(/fora de ordem/i);
    await purchaseItem(handle.db, id, 'quitinete');
    expect((await readWallet(handle.db, id))?.lifestyleTier).toBe(1);
    await purchaseItem(handle.db, id, 'casa');
    await purchaseItem(handle.db, id, 'cobertura');
    expect((await readWallet(handle.db, id))?.lifestyleTier).toBe(3);
  });

  it('casa da mãe liga o marco; o wallet agrega os trade-offs (só dado)', async () => {
    const id = await newAthlete();
    await setBalance(id, 100000);
    await purchaseItem(handle.db, id, 'carro');
    await purchaseItem(handle.db, id, 'casa-da-mae');
    const w = await readWallet(handle.db, id);
    expect(w?.hasMothersHouse).toBe(true);
    // carro { moral:10, fama:8, risco:2 } + casa-da-mae { moral:25 }
    expect(w?.tradeoffs).toEqual({ moral: 35, fama: 8, risco: 2 });
  });

  it('concorrência: 2 compras simultâneas (juntas > saldo) → exatamente 1 passa, saldo nunca negativo', async () => {
    const id = await newAthlete();
    await setBalance(id, 3000); // carro=3000, academia=1500; juntas 4500 > 3000
    const results = await Promise.allSettled([
      purchaseItem(handle.db, id, 'carro'),
      purchaseItem(handle.db, id, 'academia'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); // o FOR UPDATE serializa
    const w = await readWallet(handle.db, id);
    expect(w!.balance).toBeGreaterThanOrEqual(0); // o CHECK nunca é acionado
    expect(w!.ownedItemIds).toHaveLength(1); // só uma posse gravada
  });

  it('accrueRound credita mas NÃO toca os focos (anti-loja-de-stats no caminho do crédito)', async () => {
    const id = await newAthlete();
    await accrueRound(handle.db, id, 'win');
    const [a] = await handle.db
      .select({
        f: schema.athlete.fisico,
        t: schema.athlete.tecnico,
        ta: schema.athlete.tatico,
        m: schema.athlete.mental,
      })
      .from(schema.athlete)
      .where(eq(schema.athlete.id, id));
    expect(a).toEqual({ f: 34, t: 34, ta: 34, m: 34 });
  });

  it('saldo EXATO: comprar com o custo == saldo zera o saldo (boundary)', async () => {
    const id = await newAthlete();
    await setBalance(id, 500); // videogame custa 500
    const w = await purchaseItem(handle.db, id, 'videogame');
    expect(w.balance).toBe(0);
  });
});
