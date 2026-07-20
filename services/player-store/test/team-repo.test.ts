// Contrato do time do quinteto (SPEC-018, card R14) contra Postgres REAL. Prova: bifurcação
// solo/team, código gerado (forma + unicidade), vagas por posição, marcos, LOCK do capitão e a
// CORRIDA pela última vaga (FOR UPDATE serializa — lição SPEC-017). Gated por DATABASE_URL
// (sem DB a suíte é PULADA). Serial + limpeza em ordem de FK.
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete, TEAM, type AthleteDraft, type Kit, type Position } from '@camisa-9/player';
import { createDb, type DbHandle } from '../src/client.js';
import {
  account,
  athlete,
  dailyLedger,
  decision,
  injury,
  purchase,
  session,
  team,
} from '../src/schema/index.js';
import { createAccountWithAthlete } from '../src/store/player-repo.js';
import {
  createAccountWithTeam,
  joinTeamWithCode,
  lockTeam,
  readTeam,
} from '../src/store/team-repo.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
const KIT: Kit = { primaryColor: 0, secondaryColor: 1, crest: 2 };

// As 16 vagas na forma do elenco {GK:2, DEF:5, MID:5, FWD:4}; o capitão ocupa a de índice 0.
const SQUAD_SEQ: readonly Position[] = [
  'GK',
  'GK',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'DEF',
  'MID',
  'MID',
  'MID',
  'MID',
  'MID',
  'FWD',
  'FWD',
  'FWD',
  'FWD',
];

function draft(name: string, position: Position = 'FWD'): AthleteDraft {
  const r = createAthlete({
    name,
    position,
    appearance: { skinTone: 2, hairStyle: 1, hairColor: 3 },
    attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
  });
  if (!r.ok) throw new Error(`fixture inválida: ${r.reason}`);
  return r.value;
}

describe.skipIf(!DB_URL)('player-store — time do quinteto contra Postgres real', () => {
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
    await handle.db.delete(injury); // neto (FK → athlete, SPEC-026)
    await handle.db.delete(decision); // neto (FK → athlete, SPEC-025) antes do atleta
    await handle.db.delete(purchase); // neto (FK → athlete, SPEC-024) antes do atleta
    await handle.db.delete(dailyLedger);
    await handle.db.delete(athlete); // filho (FK p/ account E team)
    await handle.db.delete(team); // depois o time (FK p/ account)
    await handle.db.delete(session); // SPEC-037: filha de account (FK)
    await handle.db.delete(account); // por fim a conta
  });

  function makeTeam(name = 'Os Cracks', captainPosition: Position = 'GK') {
    return createAccountWithTeam(handle.db, {
      email: `cap-${name}@x.com`,
      password: PASSWORD,
      draft: draft('Capitão', captainPosition),
      teamName: name,
      kit: KIT,
      captainPosition,
    });
  }

  // `tag` só individualiza o e-mail; o nome do atleta é um válido fixo (não precisa ser único).
  function join(code: string, position: Position, tag: string) {
    return joinTeamWithCode(handle.db, {
      email: `${tag}@x.com`,
      password: PASSWORD,
      draft: draft('Reserva', position),
      code,
      position,
    });
  }

  // Preenche o time até `total` membros (o capitão já é o nº 1, na SQUAD_SEQ[0]).
  async function fill(code: string, total: number): Promise<void> {
    for (let i = 1; i < total; i++) await join(code, SQUAD_SEQ[i]!, `m${i}`);
  }

  it('capitão: cria conta + time + atleta na vaga, com código bem-formado', async () => {
    const r = await makeTeam('Os Cracks', 'GK');
    expect(r.teamId).toBeTruthy();
    expect(r.code).toHaveLength(TEAM.code.len);
    for (const ch of r.code) expect(TEAM.code.alphabet.includes(ch)).toBe(true);
    const view = await readTeam(handle.db, { teamId: r.teamId });
    expect(view?.name).toBe('Os Cracks');
    expect(view?.humanCount).toBe(1);
    expect(view?.members[0]?.position).toBe('GK');
    expect(view?.milestone).toBeNull();
  });

  it('bifurcação: solo nasce sem time; membro do time carrega team_id', async () => {
    const solo = await createAccountWithAthlete(handle.db, {
      email: 'solo@x.com',
      password: PASSWORD,
      draft: draft('Solo'),
    });
    const [soloRow] = await handle.db
      .select({ teamId: athlete.teamId })
      .from(athlete)
      .where(eq(athlete.id, solo.athleteId))
      .limit(1);
    expect(soloRow?.teamId).toBeNull();

    const t = await makeTeam();
    const [capRow] = await handle.db
      .select({ teamId: athlete.teamId })
      .from(athlete)
      .where(eq(athlete.teamId, t.teamId))
      .limit(1);
    expect(capRow?.teamId).toBe(t.teamId);
  });

  it('amigo entra com o código (caixa baixa aceita) e a vaga é descontada', async () => {
    const t = await makeTeam('Unidos', 'GK');
    const before = await readTeam(handle.db, { code: t.code });
    expect(before?.slotsRemaining.DEF).toBe(TEAM.squad.DEF);
    await join(t.code.toLowerCase(), 'DEF', 'zaga1'); // código normalizado p/ caixa alta
    const after = await readTeam(handle.db, { code: t.code.toLowerCase() }); // leitura idem
    expect(after?.id).toBe(t.teamId);
    expect(after?.humanCount).toBe(2);
    expect(after?.slotsRemaining.DEF).toBe(TEAM.squad.DEF - 1);
    expect(after?.members.some((m) => m.position === 'DEF')).toBe(true);
  });

  it('posição sem vaga: além do teto por posição é recusado', async () => {
    const t = await makeTeam('CheioNoGol', 'GK'); // 1 GK (capitão)
    await join(t.code, 'GK', 'gk2'); // 2/2 GK
    await expect(join(t.code, 'GK', 'gk3')).rejects.toThrow('posição sem vaga');
    const view = await readTeam(handle.db, { teamId: t.teamId });
    expect(view?.slotsRemaining.GK).toBe(0);
    expect(view?.humanCount).toBe(2);
  });

  it('marcos: null < 11, primeiro_onze em 11, elenco_completo + auto-lock em 16', async () => {
    const t = await makeTeam('Marcos', 'GK');
    await fill(t.code, 10);
    expect((await readTeam(handle.db, { teamId: t.teamId }))?.milestone).toBeNull();

    await join(t.code, SQUAD_SEQ[10]!, 'm10'); // 11º
    const at11 = await readTeam(handle.db, { teamId: t.teamId });
    expect(at11?.humanCount).toBe(11);
    expect(at11?.milestone).toBe('primeiro_onze');
    expect(at11?.locked).toBe(false); // ainda NÃO tranca antes das 16

    for (let i = 11; i < TEAM.fullSquad; i++) await join(t.code, SQUAD_SEQ[i]!, `m${i}`);
    const at16 = await readTeam(handle.db, { teamId: t.teamId });
    expect(at16?.humanCount).toBe(TEAM.fullSquad);
    expect(at16?.milestone).toBe('elenco_completo');
    expect(at16?.locked).toBe(true); // completar as 16 tranca sozinho
    await expect(join(t.code, 'FWD', 'm17')).rejects.toThrow('time indisponível'); // 17º barrado
  });

  it('corrida pela última vaga: FOR UPDATE deixa exatamente 1 entrar', async () => {
    const t = await makeTeam('Corrida', 'GK'); // 1/2 GK → 1 vaga de goleiro
    const results = await Promise.allSettled([
      join(t.code, 'GK', 'raceA'),
      join(t.code, 'GK', 'raceB'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ message: 'posição sem vaga' });
    const view = await readTeam(handle.db, { teamId: t.teamId });
    expect(view?.slotsRemaining.GK).toBe(0);
    expect(view?.humanCount).toBe(2);
  });

  it('corrida pela 16ª vaga: 1 entra, o time tranca em 16 (nunca 17)', async () => {
    const t = await makeTeam('Fechamento', 'GK');
    await fill(t.code, 15); // 15 membros; sobra 1 vaga (FWD)
    const results = await Promise.allSettled([
      join(t.code, 'FWD', 'lastA'),
      join(t.code, 'FWD', 'lastB'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const view = await readTeam(handle.db, { teamId: t.teamId });
    expect(view?.humanCount).toBe(TEAM.fullSquad); // exatamente 16, não estourou
    expect(view?.locked).toBe(true);
  });

  it('lock: só o capitão tranca; entrar em time trancado é recusado', async () => {
    const t = await makeTeam('Trancado', 'GK');
    await expect(lockTeam(handle.db, t.teamId, t.accountId)).resolves.toBeUndefined();
    expect((await readTeam(handle.db, { teamId: t.teamId }))?.locked).toBe(true);
    await expect(join(t.code, 'DEF', 'tarde')).rejects.toThrow('time indisponível');
  });

  it('lock: não-capitão não tranca', async () => {
    const t = await makeTeam('Alheio', 'GK');
    const outsider = await createAccountWithAthlete(handle.db, {
      email: 'outsider@x.com',
      password: PASSWORD,
      draft: draft('Estranho'),
    });
    await expect(lockTeam(handle.db, t.teamId, outsider.accountId)).rejects.toThrow(
      'operação não permitida',
    );
    expect((await readTeam(handle.db, { teamId: t.teamId }))?.locked).toBe(false);
  });

  it('código inválido (forma) e inexistente são recusados', async () => {
    await expect(join('curto', 'GK', 'x')).rejects.toThrow('código inválido'); // forma errada
    await expect(join('ZZZZZZ', 'GK', 'y')).rejects.toThrow('código inválido'); // forma ok, sem time
  });

  it('posição fora do enum é recusada (guarda do override da borda)', async () => {
    const t = await makeTeam('Guarda', 'GK');
    await expect(
      joinTeamWithCode(handle.db, {
        email: 'badpos@x.com',
        password: PASSWORD,
        draft: draft('Reserva', 'DEF'), // draft válido…
        code: t.code,
        position: 'ATA' as unknown as Position, // …mas o override de posição é inválido
      }),
    ).rejects.toThrow('posição inválida');
    expect((await readTeam(handle.db, { teamId: t.teamId }))?.humanCount).toBe(1);
  });

  it('cada time recebe um código distinto', async () => {
    const a = await makeTeam('Time A', 'GK');
    const b = await makeTeam('Time B', 'GK');
    expect(a.code).not.toBe(b.code);
  });

  it('e-mail duplicado no fluxo de time-create → erro genérico + rollback', async () => {
    await createAccountWithAthlete(handle.db, {
      email: 'dup@x.com',
      password: PASSWORD,
      draft: draft('Joao'),
    });
    await expect(
      createAccountWithTeam(handle.db, {
        email: 'dup@x.com',
        password: PASSWORD,
        draft: draft('Cap'),
        teamName: 'Fantasma',
        kit: KIT,
        captainPosition: 'GK',
      }),
    ).rejects.toThrow('e-mail já em uso');
    expect(await handle.db.select({ id: team.id }).from(team)).toHaveLength(0);
  });

  it('e-mail duplicado no JOIN → erro genérico; roster do time intacto', async () => {
    const t = await makeTeam('Intacto', 'GK');
    await join(t.code, 'DEF', 'j1'); // j1@x.com entra (humanCount 2)
    await expect(join(t.code, 'MID', 'j1')).rejects.toThrow('e-mail já em uso'); // mesmo e-mail
    expect((await readTeam(handle.db, { teamId: t.teamId }))?.humanCount).toBe(2); // sem órfão
  });

  it('falha DEPOIS de inserir o time (CHECK do atleta) → ROLLBACK total (atomicidade real)', async () => {
    // Draft com foco fora de 0..99: passa a validação de nome/camisa (createTeam) mas o INSERT do
    // atleta viola o CHECK do banco — DEPOIS de account+team já inseridos. Sem transação, sobrariam.
    const badDraft = {
      ...draft('Cap'),
      attributes: { fisico: 200, tecnico: 34, tatico: 34, mental: 34 },
    };
    await expect(
      createAccountWithTeam(handle.db, {
        email: 'atomic@x.com',
        password: PASSWORD,
        draft: badDraft,
        teamName: 'AtomicoFC',
        kit: KIT,
        captainPosition: 'GK',
      }),
    ).rejects.toThrow('não foi possível criar o time');
    expect(await handle.db.select({ id: team.id }).from(team)).toHaveLength(0); // time revertido
    expect(await handle.db.select({ id: account.id }).from(account)).toHaveLength(0); // conta revertida
  });
});
