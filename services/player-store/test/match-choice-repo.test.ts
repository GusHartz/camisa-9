// Escolhas de partida (SPEC-050) contra Postgres REAL: a resposta persiste 1× (a PK composta é a
// idempotência — o INSERT ... ON CONFLICT decide toda corrida), aplica o moral NA MESMA tx
// (evento-na-fonte, SPEC-027), seta o viés de treino SÓ quando o JOGADOR escolhe; a via do resolver
// (`resolveConservative`) é sem-throw (conflito benigno); responder NUNCA toca os 4 focos (a trava
// nunca-loja-de-stats). Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete } from '@camisa-9/player';
import {
  answerMatchChoice,
  createAccountWithAthlete,
  createDb,
  readMatchChoices,
  readMood,
  resolveConservative,
  schema,
  type DbHandle,
  type MatchChoiceAnswer,
} from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)('match-choice-repo — escolhas de partida contra Postgres real', () => {
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
      name: 'Craque',
      position: 'FWD',
      appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
      attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
    });
    if (!draft.ok) throw new Error(`draft inválido: ${draft.reason}`);
    const { athleteId } = await createAccountWithAthlete(handle.db, {
      email: `mc${seq}@x.com`,
      password: PASSWORD,
      draft: draft.value,
    });
    return athleteId;
  }

  function answer(over: Partial<MatchChoiceAnswer> = {}): MatchChoiceAnswer {
    return {
      seasonId: '2026',
      round: 3,
      templateId: 'ajuste-intervalo',
      chosenOption: 'puxar',
      result: 'na',
      effect: { moral: 6 },
      day: 20_002,
      resolvedBy: 'player',
      ...over,
    };
  }

  async function biasOf(athleteId: string): Promise<string | null> {
    const [row] = await handle.db
      .select({ bias: schema.athlete.nextTrainFocus })
      .from(schema.athlete)
      .where(eq(schema.athlete.id, athleteId));
    return row?.bias ?? null;
  }

  it('responder grava a linha, aplica o moral NA MESMA tx e snapshota o effect (auditável)', async () => {
    const id = await newAthlete();
    await answerMatchChoice(handle.db, id, answer());
    const rows = await readMatchChoices(handle.db, id, '2026', 3);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      templateId: 'ajuste-intervalo',
      chosenOption: 'puxar',
      result: 'na',
      resolvedBy: 'player',
      day: 20_002,
      effect: { moral: 6 },
    });
    expect((await readMood(handle.db, id))!.moral).toBe(56); // 50 + 6, na mesma tx
  });

  it('idempotência pela PK: a 2ª resposta (mesmo com OUTRA opção) → choice_resolved, nenhum bump duplo', async () => {
    const id = await newAthlete();
    await answerMatchChoice(handle.db, id, answer());
    await expect(
      answerMatchChoice(
        handle.db,
        id,
        answer({ chosenOption: 'poupar', effect: { focusBias: 'fisico' } }),
      ),
    ).rejects.toMatchObject({ code: 'choice_resolved' });
    expect((await readMood(handle.db, id))!.moral).toBe(56); // segue 1 bump
    const rows = await readMatchChoices(handle.db, id, '2026', 3);
    expect(rows[0]!.chosenOption).toBe('puxar'); // o vencedor do INSERT fica
    expect(await biasOf(id)).toBeNull(); // o perdedor não setou o viés
  });

  it('focusBias do JOGADOR → next_train_focus; e um fail de arriscada (moral < 0) DERRUBA a moral', async () => {
    const id = await newAthlete();
    await answerMatchChoice(
      handle.db,
      id,
      answer({
        templateId: 'pressao-tecnico',
        chosenOption: 'obedecer',
        effect: { focusBias: 'tatico' },
      }),
    );
    expect(await biasOf(id)).toBe('tatico');
    await answerMatchChoice(
      handle.db,
      id,
      answer({
        templateId: 'chance-clara',
        chosenOption: 'arriscar',
        result: 'fail',
        effect: { moral: -4 },
      }),
    );
    expect((await readMood(handle.db, id))!.moral).toBe(46); // 50 − 4 (o risco custou)
  });

  it('o AGENTE nunca seta o viés; resolveConservative é sem-throw ({inserted:false} no conflito)', async () => {
    const id = await newAthlete();
    const first = await resolveConservative(
      handle.db,
      id,
      answer({
        templateId: 'pressao-tecnico',
        chosenOption: 'obedecer',
        effect: { focusBias: 'tatico' },
        resolvedBy: 'agent',
      }),
    );
    expect(first.inserted).toBe(true);
    expect(await biasOf(id)).toBeNull(); // viés de treino é agência do JOGADOR
    const second = await resolveConservative(
      handle.db,
      id,
      answer({
        templateId: 'pressao-tecnico',
        chosenOption: 'obedecer',
        effect: { moral: 99 },
        resolvedBy: 'agent',
      }),
    );
    expect(second.inserted).toBe(false); // conflito BENIGNO — sem throw, o loop do resolver continua
    expect((await readMood(handle.db, id))!.moral).toBe(50); // e o perdedor não aplicou NADA
  });

  it('TRAVA: responder escolhas NUNCA toca os 4 focos (análogo economy-repo.test.ts:115)', async () => {
    const id = await newAthlete();
    await answerMatchChoice(
      handle.db,
      id,
      answer({ effect: { moral: 6, focusBias: 'tecnico', fama: 8, risco: 3 } }),
    );
    const [row] = await handle.db
      .select({
        fisico: schema.athlete.fisico,
        tecnico: schema.athlete.tecnico,
        tatico: schema.athlete.tatico,
        mental: schema.athlete.mental,
      })
      .from(schema.athlete)
      .where(eq(schema.athlete.id, id));
    // o focusBias muda o RITMO do treino de amanhã, nunca escreve atributo (Model A intacto)
    expect(row).toEqual({ fisico: 34, tecnico: 34, tatico: 34, mental: 34 });
  });

  it('corrida responder×resolver: quem inseriu primeiro venceu — exatamente 1 linha, 1 bump', async () => {
    const id = await newAthlete();
    await answerMatchChoice(handle.db, id, answer({ effect: { moral: 6 } })); // o jogador primeiro
    const r = await resolveConservative(
      handle.db,
      id,
      answer({ chosenOption: 'poupar', effect: { moral: 3 }, resolvedBy: 'agent' }),
    );
    expect(r.inserted).toBe(false);
    expect((await readMood(handle.db, id))!.moral).toBe(56); // só o bump do jogador
    expect(await readMatchChoices(handle.db, id, '2026', 3)).toHaveLength(1);
  });

  it('chaves distintas da PK convivem: outra rodada/temporada/template = linhas independentes', async () => {
    const id = await newAthlete();
    await answerMatchChoice(handle.db, id, answer());
    await answerMatchChoice(handle.db, id, answer({ round: 4, effect: {} }));
    await answerMatchChoice(handle.db, id, answer({ seasonId: '2027', effect: {} }));
    await answerMatchChoice(handle.db, id, answer({ templateId: 'chance-clara', effect: {} }));
    expect(await readMatchChoices(handle.db, id, '2026', 3)).toHaveLength(2); // template distinto
    expect(await readMatchChoices(handle.db, id, '2026', 4)).toHaveLength(1);
    expect(await readMatchChoices(handle.db, id, '2027', 3)).toHaveLength(1);
  });
});
