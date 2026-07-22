// Motor de decisões (SPEC-025) contra Postgres REAL: geração idempotente do dia, responder (grava a
// escolha + outcome), fallback das 18h (resolveDeadline aplica a conservadora nas pending, sem
// sobrescrever a answered), o log, efeitos=seam (não toca focos/saldo) e a transferência registrada.
// Gated por DATABASE_URL. Serial + limpeza em ordem de FK (decision antes de athlete).
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  conservativeOption,
  createAthlete,
  generateDailyDecisions,
  templateById,
} from '@camisa-9/player';
import {
  answerDecision,
  createAccountWithAthlete,
  createDb,
  generateForDay,
  readDecisionLog,
  readTransferRequested,
  resolveDeadline,
  schema,
  type DbHandle,
} from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)('decision-repo — motor de decisões contra Postgres real', () => {
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
    await handle.db.delete(schema.matchChoice); // FK→athlete (SPEC-050) — antes do atleta
    await handle.db.delete(schema.athlete);
    await handle.db.delete(schema.team);
    await handle.db.delete(schema.account);
  });

  async function newAthlete(): Promise<string> {
    seq += 1;
    const draft = createAthlete({
      name: 'Decisor',
      position: 'MID',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error('draft inválido');
    const { athleteId } = await createAccountWithAthlete(handle.db, {
      email: `d${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    return athleteId;
  }

  async function setOverall(athleteId: string, value: number): Promise<void> {
    await handle.db
      .update(schema.athlete)
      .set({ fisico: value, tecnico: value, tatico: value, mental: value })
      .where(eq(schema.athlete.id, athleteId));
  }

  it('gera as decisões do dia (≥3) e é idempotente (2× → mesmo conjunto, sem duplicar)', async () => {
    const id = await newAthlete();
    const d1 = await generateForDay(handle.db, id, 100, 'seed');
    expect(d1.length).toBeGreaterThanOrEqual(3);
    const d2 = await generateForDay(handle.db, id, 100, 'seed');
    expect(d2.map((d) => d.templateId).sort()).toEqual(d1.map((d) => d.templateId).sort());
    expect(await readDecisionLog(handle.db, id)).toHaveLength(d1.length); // não duplicou
  });

  it('aceitar uma proposta seta transfer_requested (o seam do card 1.4 — SPEC-033)', async () => {
    const id = await newAthlete();
    await setOverall(id, 60); // forte para o tier
    expect(await readTransferRequested(handle.db, id)).toBe(false); // começa sem pendência
    let answered = false;
    for (let day = 0; day < 60 && !answered; day++) {
      const gen = await generateForDay(handle.db, id, day, 'seed', { tier: 4 });
      if (!gen.some((d) => d.templateId === 'proposta-clube-maior')) continue;
      const log = await readDecisionLog(handle.db, id);
      const dec = log.find(
        (e) => e.templateId === 'proposta-clube-maior' && e.status === 'pending',
      );
      if (!dec) continue;
      await answerDecision(handle.db, id, dec.id, 'aceitar'); // outcome.transfer = 'accept'
      answered = true;
    }
    expect(answered).toBe(true); // a proposta apareceu (o seam de tier gatilha)
    expect(await readTransferRequested(handle.db, id)).toBe(true); // a pendência foi marcada
  });

  it('responder grava a escolha + o outcome declarado (status=answered, resolved_by=player)', async () => {
    const id = await newAthlete();
    await generateForDay(handle.db, id, 100, 'seed');
    const [first] = await readDecisionLog(handle.db, id);
    const opt = templateById(first!.templateId)!.options[0]!;
    await answerDecision(handle.db, id, first!.id, opt.id);
    const after = (await readDecisionLog(handle.db, id)).find((e) => e.id === first!.id)!;
    expect(after.status).toBe('answered');
    expect(after.chosenOption).toBe(opt.id);
    expect(after.resolvedBy).toBe('player');
    expect(after.outcome).toEqual(opt.outcome);
  });

  it('fallback 18h: resolveDeadline aplica a conservadora (agent) nas PENDING, sem tocar a answered', async () => {
    const id = await newAthlete();
    const gen = await generateForDay(handle.db, id, 100, 'seed');
    const log = await readDecisionLog(handle.db, id);
    const opt = templateById(log[0]!.templateId)!.options[0]!;
    await answerDecision(handle.db, id, log[0]!.id, opt.id); // responde a 1ª; deixa as outras pending
    const resolved = await resolveDeadline(handle.db, id, 100);
    expect(resolved).toBe(gen.length - 1);
    const after = await readDecisionLog(handle.db, id);
    expect(after.find((e) => e.id === log[0]!.id)!.resolvedBy).toBe('player'); // NÃO sobrescrita
    const byAgent = after.filter((e) => e.resolvedBy === 'agent');
    expect(byAgent).toHaveLength(gen.length - 1);
    for (const e of byAgent) expect(e.chosenOption).toBe(conservativeOption(e.templateId)!.id);
  });

  it('efeitos = seam: responder NÃO altera focos nem saldo', async () => {
    const id = await newAthlete();
    await handle.db.update(schema.athlete).set({ balance: 1000 }).where(eq(schema.athlete.id, id));
    await generateForDay(handle.db, id, 100, 'seed');
    const [first] = await readDecisionLog(handle.db, id);
    await answerDecision(handle.db, id, first!.id, templateById(first!.templateId)!.options[0]!.id);
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

  it('opção inválida → erro genérico; decisão já resolvida → erro', async () => {
    const id = await newAthlete();
    await generateForDay(handle.db, id, 100, 'seed');
    const [first] = await readDecisionLog(handle.db, id);
    await expect(answerDecision(handle.db, id, first!.id, 'opcao-fantasma')).rejects.toThrow(
      /inválida/i,
    );
    await answerDecision(handle.db, id, first!.id, templateById(first!.templateId)!.options[0]!.id);
    await expect(
      answerDecision(handle.db, id, first!.id, templateById(first!.templateId)!.options[0]!.id),
    ).rejects.toThrow(/já resolvida/i);
  });

  it('idempotência com CONTEXTO MUDADO: a 1ª geração vence (muda o estado, não regenera)', async () => {
    const id = await newAthlete();
    const d1 = await generateForDay(handle.db, id, 100, 'seed');
    // muda o estado (saldo alto habilitaria mais candidatos se regenerasse)
    await handle.db
      .update(schema.athlete)
      .set({ balance: 100000 })
      .where(eq(schema.athlete.id, id));
    const d2 = await generateForDay(handle.db, id, 100, 'seed');
    expect(d2.map((d) => d.templateId)).toEqual(d1.map((d) => d.templateId)); // mesmo conjunto E ordem
    expect(await readDecisionLog(handle.db, id)).toHaveLength(d1.length); // não regenerou
  });

  it('concorrência responder×resolver: o agente NÃO atropela a escolha do jogador', async () => {
    const id = await newAthlete();
    await generateForDay(handle.db, id, 100, 'seed');
    const [first] = await readDecisionLog(handle.db, id);
    const opt = templateById(first!.templateId)!.options[0]!;
    await Promise.allSettled([
      answerDecision(handle.db, id, first!.id, opt.id),
      resolveDeadline(handle.db, id, 100),
    ]);
    const after = (await readDecisionLog(handle.db, id)).find((e) => e.id === first!.id)!;
    // estado final consistente: OU answered/player OU resolved/agent — nunca corrompido
    expect(['answered', 'resolved']).toContain(after.status);
    expect(after.resolvedBy === 'player' || after.resolvedBy === 'agent').toBe(true);
    if (after.resolvedBy === 'player') expect(after.chosenOption).toBe(opt.id);
  });

  it('auth: um atleta NÃO responde a decisão de outro (OP-09)', async () => {
    const a = await newAthlete();
    const b = await newAthlete();
    await generateForDay(handle.db, a, 100, 'seed');
    const [decA] = await readDecisionLog(handle.db, a);
    const opt = templateById(decA!.templateId)!.options[0]!;
    await expect(answerDecision(handle.db, b, decA!.id, opt.id)).rejects.toThrow(/não encontrada/i);
    expect((await readDecisionLog(handle.db, a)).find((e) => e.id === decA!.id)!.status).toBe(
      'pending',
    );
  });

  it('seam da idade: generateForDay com age habilita o veterano', async () => {
    const id = await newAthlete();
    const ctx = { overall: 34, balance: 0, lifestyleTier: 0, age: 40 };
    let day = 0;
    while (
      day < 100 &&
      !generateDailyDecisions('age-seed', day, id, ctx).some((d) => d.templateId === 'veterano')
    ) {
      day += 1;
    }
    expect(day).toBeLessThan(100);
    const gen = await generateForDay(handle.db, id, day, 'age-seed', { age: 40 });
    expect(gen.map((d) => d.templateId)).toContain('veterano');
  });

  it('transferência REGISTRADA: aceitar grava outcome.transfer (só-player-store, nada move)', async () => {
    const id = await newAthlete();
    await setOverall(id, 60); // habilita a proposta-salario (overall ≥ 55)
    const ctx = { overall: 60, balance: 0, lifestyleTier: 0 };
    let day = 0;
    while (
      day < 200 &&
      !generateDailyDecisions('t-seed', day, id, ctx).some(
        (d) => d.templateId === 'proposta-salario',
      )
    ) {
      day += 1;
    }
    expect(day).toBeLessThan(200); // achou um dia determinístico com a proposta
    await generateForDay(handle.db, id, day, 't-seed');
    const proposta = (await readDecisionLog(handle.db, id)).find(
      (e) => e.templateId === 'proposta-salario',
    )!;
    await answerDecision(handle.db, id, proposta.id, 'aceitar');
    const after = (await readDecisionLog(handle.db, id)).find((e) => e.id === proposta.id)!;
    expect(after.outcome).toEqual({ transfer: 'rival' }); // registrado; o card 1.4 executa
  });
});
