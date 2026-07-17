// Progressão persistida (SPEC-017) contra Postgres REAL. Prova: treino deposita XP e persiste,
// o ponto livre é gasto (+1 no foco) atomicamente, o teto 99 e "sem ponto" são rejeitados sem
// mutação parcial, e o store reconcilia byte-a-byte com a lib pura. Gated por DATABASE_URL.
// Serial + limpeza em ordem de FK (invariante SPEC-015).
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAthlete,
  repeatPenaltyPct,
  resolveFocusStreak,
  TRAINING,
  trainSession,
  type AthleteDraft,
} from '@camisa-9/player';
import { createDb, type DbHandle } from '../src/client.js';
import { account, athlete, purchase } from '../src/schema/index.js';
import { createAccountWithAthlete } from '../src/store/player-repo.js';
import { applyTraining, readAthleteProgress, spendFreePoint } from '../src/store/training-repo.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

function draft(): AthleteDraft {
  const r = createAthlete({
    name: 'Zé da Várzea',
    position: 'FWD',
    appearance: { skinTone: 2, hairStyle: 1, hairColor: 3 },
    attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
  });
  if (!r.ok) throw new Error(`fixture inválida: ${r.reason}`);
  return r.value;
}

describe.skipIf(!DB_URL)('training-repo — progressão contra Postgres real', () => {
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
    await handle.db.delete(purchase); // neto (FK → athlete, SPEC-024) antes do atleta
    await handle.db.delete(athlete); // filho antes do pai (FK)
    await handle.db.delete(account);
  });

  /** Cria uma conta+atleta (e-mail único por chamada) e devolve o athleteId. */
  async function newAthlete(): Promise<string> {
    seq += 1;
    const { athleteId } = await createAccountWithAthlete(handle.db, {
      email: `t${seq}@x.com`,
      password: PASSWORD,
      draft: draft(),
    });
    return athleteId;
  }

  it('treino neutro deposita sessionXp na barra e persiste (sem ponto ainda)', async () => {
    const id = await newAthlete();
    const p = await applyTraining(handle.db, id, 'fisico');
    expect(p.trainingXp).toBe(100);
    expect(p.freePoints).toBe(0);
    expect(p.overall).toBe(34); // atributos intactos
    const reread = await readAthleteProgress(handle.db, id);
    expect(reread?.trainingXp).toBe(100);
  });

  it('acumula ao longo de sessões e reconcilia byte-a-byte com a lib (com penalidade de repetição)', async () => {
    const id = await newAthlete();
    let expected = { attributes: draft().attributes, trainingXp: 0, freePoints: 0 };
    let lastFocus: string | null = null;
    let focusStreak = 0;
    // 5 sessões no MESMO foco → a penalidade de repetição cresce; o store deve espelhar a lib.
    for (let i = 0; i < 5; i++) {
      await applyTraining(handle.db, id, 'tecnico');
      const s = resolveFocusStreak(lastFocus, focusStreak, 'tecnico');
      const r = trainSession(expected, 'tecnico', { focusRepeatPct: repeatPenaltyPct(s.repeats) });
      expected = { ...expected, trainingXp: r.trainingXp, freePoints: r.freePoints };
      lastFocus = s.lastFocus;
      focusStreak = s.focusStreak;
    }
    const p = await readAthleteProgress(handle.db, id);
    expect(p?.trainingXp).toBe(expected.trainingXp);
    expect(p?.freePoints).toBe(expected.freePoints);
    expect(p?.focusStreak).toBe(5); // 5 sessões consecutivas persistidas
    expect(p?.lastFocus).toBe('tecnico');
  });

  it('repetir o mesmo foco decai o depósito (rendimento decrescente persistido)', async () => {
    const id = await newAthlete();
    const first = await applyTraining(handle.db, id, 'fisico'); // fresco = 100%
    expect(first.trainingXp).toBe(100);
    expect(first.focusStreak).toBe(1);
    expect(first.nextFocusPenaltyPct).toBe(100 - TRAINING.focusRepeatStepPct); // repetir → 80%
    const second = await applyTraining(handle.db, id, 'fisico'); // repeats 1 → 80%
    expect(second.trainingXp).toBe(100 + (100 - TRAINING.focusRepeatStepPct)); // 180
    expect(second.focusStreak).toBe(2);
  });

  it('trocar de foco reseta o streak (volta a 100%)', async () => {
    const id = await newAthlete();
    await applyTraining(handle.db, id, 'fisico'); // 100
    await applyTraining(handle.db, id, 'fisico'); // +80 → 180 (streak 2)
    const switched = await applyTraining(handle.db, id, 'tecnico'); // fresco → +100
    expect(switched.lastFocus).toBe('tecnico');
    expect(switched.focusStreak).toBe(1);
    expect(switched.trainingXp).toBe(180 + 100); // 280 (sem cruzar o limiar de 300)
  });

  it('sem escolha → o técnico treina o foco mais baixo (coach default)', async () => {
    const id = await newAthlete();
    await applyTraining(handle.db, id, 'fisico', { speedMultiplierPct: 500 }); // ganha 1 ponto
    await spendFreePoint(handle.db, id, 'fisico'); // fisico 34→35 (não é mais o mais baixo)
    const p = await applyTraining(handle.db, id, null); // técnico decide o mais baixo
    expect(p.lastFocus).toBe('tecnico'); // empate 34 (tec/tat/men) → primeiro na ordem FOCI
  });

  it('a penalidade é AUTORIDADE do servidor: um focusRepeatPct do caller é ignorado', async () => {
    const id = await newAthlete();
    await applyTraining(handle.db, id, 'fisico'); // 100
    await applyTraining(handle.db, id, 'fisico'); // +80 → 180 (streak 2)
    // caller tenta burlar com 100% num foco já repetido; o store computa 60% (repeats 2) e VENCE.
    const p = await applyTraining(handle.db, id, 'fisico', { focusRepeatPct: 100 });
    expect(p.trainingXp).toBe(180 + repeatPenaltyPct(2)); // 240 (60%), não 280 (100% do caller)
    expect(p.focusStreak).toBe(3);
  });

  it('o piso da penalidade é aplicado ao repetir muito (rendimento decrescente com piso)', async () => {
    const id = await newAthlete();
    for (let i = 0; i < 3; i++) await applyTraining(handle.db, id, 'fisico'); // 100+80+60 = 240
    const p3 = await readAthleteProgress(handle.db, id);
    expect(p3?.focusStreak).toBe(3);
    expect(p3?.nextFocusPenaltyPct).toBe(TRAINING.focusRepeatFloorPct); // 40 = piso
    const p4 = await applyTraining(handle.db, id, 'fisico'); // 4ª sessão = piso (40%)
    expect(p4.trainingXp).toBe(240 + TRAINING.focusRepeatFloorPct); // 280
  });

  it('FOR UPDATE serializa dois treinos simultâneos (sem lost update)', async () => {
    const id = await newAthlete();
    const results = await Promise.allSettled([
      applyTraining(handle.db, id, 'fisico'),
      applyTraining(handle.db, id, 'fisico'),
    ]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const p = await readAthleteProgress(handle.db, id);
    // serializado: 100 (fresco) + 80 (repeat 1) = 180, streak 2. Sem o lock: lost update → 100/streak 1.
    expect(p?.trainingXp).toBe(180);
    expect(p?.focusStreak).toBe(2);
  });

  it('ganha ponto (seam DLC), gasta +1 no foco escolhido e persiste atômico', async () => {
    const id = await newAthlete();
    // 1 treino acelerado (500%) → depósito 500 ≥ 300 → 1 ponto, resto 200.
    const trained = await applyTraining(handle.db, id, 'fisico', { speedMultiplierPct: 500 });
    expect(trained.freePoints).toBe(1);
    expect(trained.trainingXp).toBe(200);

    const spent = await spendFreePoint(handle.db, id, 'tecnico'); // gasta em OUTRO foco (é livre)
    expect(spent.freePoints).toBe(0);
    expect(spent.attributes.tecnico).toBe(35);
    expect(spent.attributes.fisico).toBe(34);
    const reread = await readAthleteProgress(handle.db, id);
    expect(reread?.attributes.tecnico).toBe(35);
    expect(reread?.freePoints).toBe(0);
  });

  it('overall trunca (Math.floor), não arredonda, em somas não múltiplas de 4', async () => {
    const id = await newAthlete();
    // muitos pontos numa tacada (5000%) → depósito 5000 → 16 pontos na zona 1 (300 cada).
    const trained = await applyTraining(handle.db, id, 'fisico', { speedMultiplierPct: 5000 });
    expect(trained.freePoints).toBeGreaterThanOrEqual(2);
    // gasta 2 → soma 138; 138/4 = 34,5 → floor = 34 (arredondar daria 35).
    await spendFreePoint(handle.db, id, 'fisico');
    const p = await spendFreePoint(handle.db, id, 'tecnico');
    const soma =
      p.attributes.fisico + p.attributes.tecnico + p.attributes.tatico + p.attributes.mental;
    expect(soma).toBe(138);
    expect(p.overall).toBe(34);
  });

  it('sem ponto disponível → erro genérico, nada muda', async () => {
    const id = await newAthlete();
    await expect(spendFreePoint(handle.db, id, 'fisico')).rejects.toThrow(
      'sem ponto de treino disponível',
    );
    const p = await readAthleteProgress(handle.db, id);
    expect(p?.freePoints).toBe(0);
    expect(p?.attributes.fisico).toBe(34);
  });

  it('foco já em 99 → rejeita e NÃO consome o ponto (sem mutação parcial)', async () => {
    const id = await newAthlete();
    // dá 1 ponto livre e força o físico a 99 direto no banco.
    await applyTraining(handle.db, id, 'fisico', { speedMultiplierPct: 500 });
    await handle.db.update(athlete).set({ fisico: 99 }).where(eq(athlete.id, id));

    await expect(spendFreePoint(handle.db, id, 'fisico')).rejects.toThrow(/máximo/i);
    const p = await readAthleteProgress(handle.db, id);
    expect(p?.attributes.fisico).toBe(99); // inalterado
    expect(p?.freePoints).toBe(1); // ponto NÃO consumido
  });

  it('atleta inexistente → erro genérico', async () => {
    await expect(
      applyTraining(handle.db, '00000000-0000-0000-0000-000000000000', 'fisico'),
    ).rejects.toThrow('atleta não encontrado');
  });
});
