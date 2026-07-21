// Forma & Moral (SPEC-027) contra Postgres REAL: as barras nascem em 50; o passe diário decai (moral
// rumo ao alvo do estilo de vida, forma rumo ao baseline / rebaixada recuperando); a 2.3 APLICA os
// seams na fonte (decisão → moral, comeback → moral, treino → forma); o consumidor (moral baixa →
// crise-moral deixa de ser inerte); clamps + isolamento. Gated por DATABASE_URL. Serial.
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MOOD, comebackOutcome, createAthlete } from '@camisa-9/player';
import {
  advanceRecovery,
  answerDecision,
  applyDailyMood,
  applyTraining,
  createAccountWithAthlete,
  createDb,
  generateForDay,
  injureFromMatch,
  readMood,
  readMoodByIds,
  resolveDeadline,
  schema,
  type DbHandle,
} from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)('mood-repo — Forma & Moral contra Postgres real', () => {
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
    await handle.db.delete(schema.purchase);
    await handle.db.delete(schema.dailyLedger);
    await handle.db.delete(schema.athlete);
    await handle.db.delete(schema.team);
    await handle.db.delete(schema.account);
  });

  async function newAthlete(): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name: 'Barra',
      position: 'MID',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(handle.db, {
      email: `m${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    return athleteId;
  }

  async function setMood(id: string, forma: number, moral: number): Promise<void> {
    await handle.db.update(schema.athlete).set({ forma, moral }).where(eq(schema.athlete.id, id));
  }

  it('as barras nascem em 50 (default) e readMood devolve o par', async () => {
    const id = await newAthlete();
    expect(await readMood(handle.db, id)).toEqual({ forma: 50, moral: 50 });
  });

  it('readMoodByIds: batch com ids presentes + ausentes (a costura da partida usa)', async () => {
    const a = await newAthlete();
    const b = await newAthlete();
    await setMood(a, 80, 40);
    const map = await readMoodByIds(handle.db, [a, b, '00000000-0000-0000-0000-0000000000ff']);
    expect(map.get(a)).toEqual({ forma: 80, moral: 40 });
    expect(map.get(b)).toEqual({ forma: 50, moral: 50 }); // default
    expect(map.has('00000000-0000-0000-0000-0000000000ff')).toBe(false); // ausente → fora
    expect(await readMoodByIds(handle.db, [])).toEqual(new Map()); // lista vazia → mapa vazio
  });

  it('applyDailyMood é IDEMPOTENTE por dia (SPEC-030): 2× no mesmo dia decai 1×', async () => {
    const id = await newAthlete();
    await setMood(id, 70, 70);
    const first = await applyDailyMood(handle.db, id, 0);
    expect(first).toEqual({ forma: 70 - MOOD.decayStep, moral: 70 - MOOD.decayStep }); // 65
    const second = await applyDailyMood(handle.db, id, 0); // MESMO dia → no-op (não 60)
    expect(second).toEqual(first);
  });

  it('passe diário sem compras: moral e forma decaem rumo ao baseline (50)', async () => {
    const id = await newAthlete();
    await setMood(id, 70, 70);
    const m = await applyDailyMood(handle.db, id, 0);
    expect(m).toEqual({ forma: 70 - MOOD.decayStep, moral: 70 - MOOD.decayStep });
  });

  it('passe diário com compra (carro, moral +10): a moral sobe rumo ao alvo 60', async () => {
    const id = await newAthlete();
    await handle.db.insert(schema.purchase).values({ athleteId: id, itemId: 'carro' });
    // moral 50, offset +10 → alvo 60 → sobe um passo
    const m = await applyDailyMood(handle.db, id, 0);
    expect(m.moral).toBe(50 + MOOD.decayStep);
  });

  it('passe diário recuperando de lesão: a forma decai rumo ao baseline rebaixado', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'grave'); // 30 dias → recuperando no dia 105
    const m = await applyDailyMood(handle.db, id, 105);
    expect(m.forma).toBe(50 - MOOD.decayStep); // rumo a 50 − drag = 30
  });

  it('a 2.3 aplica o moral da DECISÃO respondida (evento-na-fonte)', async () => {
    const id = await newAthlete();
    const [ins] = await handle.db
      .insert(schema.decision)
      .values({ athleteId: id, day: 1, ord: 0, templateId: 'treino-extra', type: 'rotina' })
      .returning({ id: schema.decision.id });
    await answerDecision(handle.db, id, ins!.id, 'descanso'); // outcome { moral: 5 }
    expect((await readMood(handle.db, id))?.moral).toBe(55);
  });

  it('a 2.3 aplica o COMEBACK à moral quando a lesão recupera (SPEC-026)', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'leve'); // 3 dias → termina 103
    const before = (await readMood(handle.db, id))!.moral;
    await advanceRecovery(handle.db, id, 110); // recupera → aplica o comeback
    const delta = (comebackOutcome()['moral'] as number) ?? 0;
    expect((await readMood(handle.db, id))?.moral).toBe(before + delta);
  });

  it('o TREINO sobe a forma (evento-na-fonte)', async () => {
    const id = await newAthlete();
    await applyTraining(handle.db, id, 'fisico', 1);
    expect((await readMood(handle.db, id))?.forma).toBe(50 + MOOD.trainFormaBump);
  });

  it('consumidor: moral baixa faz crise-moral APARECER na geração; moral neutra não', async () => {
    const low = await newAthlete();
    await setMood(low, 50, 20); // moral < 30 → crise-moral elegível
    let found = false;
    for (let day = 0; day < 40 && !found; day++) {
      found = (await generateForDay(handle.db, low, day, 'mood-seed')).some(
        (d) => d.templateId === 'crise-moral',
      );
    }
    expect(found).toBe(true); // o seam de moral vive na geração (deixou de ser inerte)

    const ok = await newAthlete();
    await setMood(ok, 50, 50); // moral neutra → nunca elegível
    let appeared = false;
    for (let day = 0; day < 40 && !appeared; day++) {
      appeared = (await generateForDay(handle.db, ok, day, 'mood-seed')).some(
        (d) => d.templateId === 'crise-moral',
      );
    }
    expect(appeared).toBe(false);
  });

  it('clamps: os bumps não passam de [0,100]', async () => {
    const id = await newAthlete();
    await setMood(id, 99, 98);
    await applyTraining(handle.db, id, 'fisico', 1); // +4 forma → teto 100 (não 103)
    expect((await readMood(handle.db, id))?.forma).toBe(100);
  });

  it('isolamento: os wires de mood NÃO tocam focos nem saldo', async () => {
    const id = await newAthlete();
    await handle.db.update(schema.athlete).set({ balance: 500 }).where(eq(schema.athlete.id, id));
    await applyTraining(handle.db, id, 'fisico', 1); // forma
    await injureFromMatch(handle.db, id, 100, 'leve');
    await advanceRecovery(handle.db, id, 110); // comeback → moral
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
    expect(a).toEqual({ f: 34, t: 34, ta: 34, m: 34, balance: 500 });
  });

  it('convergência: rodar o passe 2× no mesmo dia converge (monotônico, sem overshoot)', async () => {
    const id = await newAthlete();
    await setMood(id, 52, 52);
    await applyDailyMood(handle.db, id, 0); // 52 → 50 (um passo, sem ultrapassar)
    const m = await applyDailyMood(handle.db, id, 0); // já em 50 → estável
    expect(m).toEqual({ forma: 50, moral: 50 });
  });

  it('a 2.3 aplica o moral da CONSERVADORA no resolveDeadline (o fallback das 18h)', async () => {
    const id = await newAthlete();
    await handle.db
      .insert(schema.decision)
      .values({ athleteId: id, day: 7, ord: 0, templateId: 'treino-extra', type: 'rotina' });
    await resolveDeadline(handle.db, id, 7); // conservadora 'descanso' → moral +5
    expect((await readMood(handle.db, id))?.moral).toBe(55);
  });

  it('concorrência: dois answerDecision no mesmo atleta → NENHUM bump perdido (FOR UPDATE)', async () => {
    const id = await newAthlete();
    const ins = await handle.db
      .insert(schema.decision)
      .values([
        // dias distintos (o unique é (athlete_id, day, template_id)); o alvo é a corrida dos bumps
        { athleteId: id, day: 8, ord: 0, templateId: 'treino-extra', type: 'rotina' },
        { athleteId: id, day: 9, ord: 0, templateId: 'treino-extra', type: 'rotina' },
      ])
      .returning({ id: schema.decision.id });
    await Promise.all([
      answerDecision(handle.db, id, ins[0]!.id, 'descanso'), // +5
      answerDecision(handle.db, id, ins[1]!.id, 'descanso'), // +5
    ]);
    expect((await readMood(handle.db, id))?.moral).toBe(60); // 50 + 5 + 5 (nenhum lost update)
  });

  it('convergência COM offset: o passe converge no alvo do estilo de vida, saturando em +clamp', async () => {
    const id = await newAthlete();
    // carro(10)+casa(10)+cobertura(15)+casa-da-mãe(25) = 60 → clampeado em lifestyleClamp → alvo 80
    await handle.db.insert(schema.purchase).values([
      { athleteId: id, itemId: 'carro' },
      { athleteId: id, itemId: 'casa' },
      { athleteId: id, itemId: 'cobertura' },
      { athleteId: id, itemId: 'casa-da-mae' },
    ]);
    let m = { forma: 50, moral: 50 };
    for (let i = 0; i < 20; i++) m = await applyDailyMood(handle.db, id, i); // dias distintos (ledger)
    expect(m.moral).toBe(MOOD.baseline + MOOD.lifestyleClamp); // converge em 80 (saturado), não 100
  });

  it('boundary do drag da lesão: forma abaixo do alvo rebaixado SOBE rumo a ele; no prazo o drag some', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'grave'); // 30 dias → termina 130
    await setMood(id, 20, 50); // forma 20, abaixo do alvo rebaixado (50 − drag = 30)
    const rec = await applyDailyMood(handle.db, id, 105); // recuperando → sobe rumo a 30
    expect(rec.forma).toBe(20 + MOOD.decayStep);
    await setMood(id, 40, 50);
    const back = await applyDailyMood(handle.db, id, 130); // no prazo: disponível → drag off, rumo a 50
    expect(back.forma).toBe(40 + MOOD.decayStep);
  });

  it('decisão SEM moral no outcome (transfer) → a moral NÃO muda (moralOf = 0)', async () => {
    const id = await newAthlete();
    const [ins] = await handle.db
      .insert(schema.decision)
      .values({ athleteId: id, day: 9, ord: 0, templateId: 'proposta-salario', type: 'proposta' })
      .returning({ id: schema.decision.id });
    await answerDecision(handle.db, id, ins!.id, 'aceitar'); // outcome { transfer: 'rival' } — sem moral
    expect((await readMood(handle.db, id))?.moral).toBe(50);
  });

  it('piso do clamp: um bump negativo grande leva a moral a 0 (não abaixo)', async () => {
    const id = await newAthlete();
    await setMood(id, 50, 3);
    const [ins] = await handle.db
      .insert(schema.decision)
      .values({ athleteId: id, day: 10, ord: 0, templateId: 'treino-extra', type: 'rotina' })
      .returning({ id: schema.decision.id });
    await answerDecision(handle.db, id, ins!.id, 'extra'); // outcome { moral: -5 } → 3 − 5 = piso 0
    expect((await readMood(handle.db, id))?.moral).toBe(0);
  });

  it('o comeback também é aplicado quando injureFromMatch fecha-lazily a vencida (fix da revisão)', async () => {
    const id = await newAthlete();
    await injureFromMatch(handle.db, id, 100, 'leve'); // termina 103
    const before = (await readMood(handle.db, id))!.moral;
    // dia 110: a leve venceu (o passe não rodou); a nova grave fecha-lazily a antiga → comeback aqui
    await injureFromMatch(handle.db, id, 110, 'grave');
    const delta = (comebackOutcome()['moral'] as number) ?? 0;
    expect((await readMood(handle.db, id))?.moral).toBe(before + delta);
  });
});
