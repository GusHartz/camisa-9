// Lesões (SPEC-026) contra Postgres REAL: ocorrência-seam (injureFromMatch, 1 ativa/atleta),
// recuperação (advanceRecovery fecha o arco no prazo), disponibilidade derivada, a decisão via o
// motor da SPEC-025 (injured no extra → lesao-volta), efeitos=seam (não toca focos/saldo), a história.
// Gated por DATABASE_URL. Serial + limpeza em ordem de FK (injury antes de athlete).
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete, generateDailyDecisions, recoveryDaysFor } from '@camisa-9/player';
import {
  advanceRecovery,
  createAccountWithAthlete,
  createDb,
  generateForDay,
  injureFromMatch,
  readDecisionLog,
  readInjuryLog,
  readInjuryState,
  schema,
  type DbHandle,
} from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)('injury-repo — lesões narrativas contra Postgres real', () => {
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
    await handle.db.delete(schema.injury);
    await handle.db.delete(schema.decision);
    await handle.db.delete(schema.dailyLedger);
    await handle.db.delete(schema.purchase); // FK→athlete (SPEC-024) — antes de athlete, senão FK viola
    await handle.db.delete(schema.matchChoice); // FK→athlete (SPEC-050) — antes do atleta
    await handle.db.delete(schema.athlete);
    await handle.db.delete(schema.team);
    await handle.db.delete(schema.account);
  });

  async function newAthlete(): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name: 'Machucado',
      position: 'DEF',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(handle.db, {
      email: `l${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    return athleteId;
  }

  it('injureFromMatch cria a lesão ativa; 2ª chamada é no-op (1 ativa/atleta)', async () => {
    const id = await newAthlete();
    expect(await injureFromMatch(handle.db, id, 100, 'media')).toEqual({ injured: true });
    expect(await injureFromMatch(handle.db, id, 101, 'grave')).toEqual({ injured: false }); // já ativa
    const st = await readInjuryState(handle.db, id, 105);
    expect(st.injury?.severity).toBe('media'); // a 1ª venceu
    expect(st.injury?.recoveryDays).toBe(recoveryDaysFor('media'));
  });

  it('advanceRecovery fecha o arco no prazo; antes, segue indisponível', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'media'); // 10 dias → termina 110
    expect(await advanceRecovery(handle.db, id, 105)).toEqual({ recovered: false }); // antes
    expect((await readInjuryState(handle.db, id, 105)).available).toBe(false); // recuperando
    expect(await advanceRecovery(handle.db, id, 110)).toEqual({ recovered: true }); // no prazo
    const st = await readInjuryState(handle.db, id, 110);
    expect(st.injury).toBeNull(); // não há mais ativa
    expect(st.available).toBe(true);
  });

  it('gravidade inválida → erro genérico (OP-11)', async () => {
    const id = await newAthlete();
    await expect(injureFromMatch(handle.db, id, 100, 'mortal')).rejects.toThrow(/inválida/i);
  });

  it('gera a decisão via SPEC-025: injured=true habilita lesao-volta (sem, não)', async () => {
    const id = await newAthlete();
    const ctx = { overall: 34, balance: 0, lifestyleTier: 0, injured: true };
    let day = 0;
    while (
      day < 100 &&
      !generateDailyDecisions('les-seed', day, id, ctx).some((d) => d.templateId === 'lesao-volta')
    ) {
      day += 1;
    }
    expect(day).toBeLessThan(100);
    await generateForDay(handle.db, id, day, 'les-seed', { injured: true });
    const withInjury = (await readDecisionLog(handle.db, id))
      .filter((e) => e.day === day)
      .map((e) => e.templateId);
    expect(withInjury).toContain('lesao-volta');
    // sem injured (outro dia) → a decisão da lesão NÃO aparece
    await generateForDay(handle.db, id, day + 1000, 'les-seed');
    const noInjury = (await readDecisionLog(handle.db, id))
      .filter((e) => e.day === day + 1000)
      .map((e) => e.templateId);
    expect(noInjury).not.toContain('lesao-volta');
  });

  it('efeitos = seam: a lesão/recuperação NÃO altera focos nem saldo', async () => {
    const id = await newAthlete();
    await handle.db.update(schema.athlete).set({ balance: 1000 }).where(eq(schema.athlete.id, id));
    await injureFromMatch(handle.db, id, 100, 'grave');
    await advanceRecovery(handle.db, id, 200); // recupera (volta por cima)
    const [a] = await handle.db
      .select({
        f: schema.athlete.fisico,
        t: schema.athlete.tecnico,
        ta: schema.athlete.tatico,
        m: schema.athlete.mental,
        balance: schema.athlete.balance,
      })
      .from(schema.athlete)
      .where(eq(schema.athlete.id, id));
    expect(a).toEqual({ f: 34, t: 34, ta: 34, m: 34, balance: 1000 });
  });

  it('readInjuryLog é a história (a lesão + a volta por cima)', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'leve');
    await advanceRecovery(handle.db, id, 200); // recovered
    const hist = await readInjuryLog(handle.db, id);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ severity: 'leve', status: 'recovered', startedDay: 100 });
  });

  it('readInjuryState: lesão ativa com prazo vencido (sem o passe) → available=true, linha ativa', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'leve'); // 3 dias → termina 103
    const st = await readInjuryState(handle.db, id, 110); // prazo vencido; advanceRecovery NÃO rodou
    expect(st.available).toBe(true); // a fase (dia) decide — o arco manda
    expect(st.injury?.severity).toBe('leve'); // a linha ativa segue (o passe não a fechou)
    expect((await readInjuryLog(handle.db, id))[0]?.status).toBe('active');
  });

  it('re-lesão após o prazo vencer (sem o passe): a nova ENTRA — lazy-close reconcilia status↔dia', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'leve'); // termina 103
    // dia 110: a leve já venceu (o passe não rodou). Uma nova grave — a stale é fechada lazily.
    expect(await injureFromMatch(handle.db, id, 110, 'grave')).toEqual({ injured: true });
    const st = await readInjuryState(handle.db, id, 111);
    expect(st.injury?.severity).toBe('grave'); // a NOVA é a ativa (não a stale leve)
    expect(st.available).toBe(false); // recuperando da grave
    expect(await readInjuryLog(handle.db, id)).toHaveLength(2); // leve (recovered) + grave (active)
  });

  it('boundary: advanceRecovery no último dia recuperando (109) NÃO fecha; no prazo (110) fecha', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'media'); // 10 dias → termina 110
    expect(await advanceRecovery(handle.db, id, 109)).toEqual({ recovered: false }); // ainda recuperando
    expect(await advanceRecovery(handle.db, id, 110)).toEqual({ recovered: true }); // no prazo exato
  });

  it('re-lesão após recuperar: uma NOVA ativa é permitida (o loop de carreira)', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'leve');
    await advanceRecovery(handle.db, id, 110); // recovered
    expect(await injureFromMatch(handle.db, id, 120, 'grave')).toEqual({ injured: true }); // nova ok
    expect(await readInjuryLog(handle.db, id)).toHaveLength(2);
  });

  it('advanceRecovery idempotente: a 2ª chamada é no-op; sem lesão ativa → no-op', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'media');
    expect(await advanceRecovery(handle.db, id, 110)).toEqual({ recovered: true });
    expect(await advanceRecovery(handle.db, id, 110)).toEqual({ recovered: false }); // já recuperada
    const id2 = await newAthlete();
    expect(await advanceRecovery(handle.db, id2, 110)).toEqual({ recovered: false }); // sem lesão
  });

  it('isolamento: advanceRecovery recupera SÓ o atleta alvo', async () => {
    const a = await newAthlete();
    const b = await newAthlete();
    await injureFromMatch(handle.db, a, 100, 'media');
    await injureFromMatch(handle.db, b, 100, 'media');
    await advanceRecovery(handle.db, a, 110); // só A
    expect((await readInjuryLog(handle.db, a))[0]?.status).toBe('recovered');
    expect((await readInjuryLog(handle.db, b))[0]?.status).toBe('active'); // B intacto
  });

  it('concorrência: 2 injureFromMatch simultâneos → exatamente 1 lesiona (lock advisory)', async () => {
    const id = await newAthlete();
    const [r1, r2] = await Promise.all([
      injureFromMatch(handle.db, id, 100, 'media'),
      injureFromMatch(handle.db, id, 100, 'grave'),
    ]);
    expect([r1.injured, r2.injured].filter(Boolean)).toHaveLength(1); // exatamente 1
    expect(await readInjuryLog(handle.db, id)).toHaveLength(1); // 1 lesão gravada
  });
});
