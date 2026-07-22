// A campanha da temporada (SPEC-053) contra Postgres REAL. O risco nº 1 desta fatia é somar o mesmo
// dia duas vezes — o catch-up do scheduler replaya dias perdidos, uma rodada pode ser republicada, e
// um dia deferido é retentado. O claim `'season'` no `daily_ledger` é o que impede isso, e o teste
// de idempotência abaixo QUEBRA se ele for removido (verificado revertendo o claim).
//
// Também crava o que a pré-mortem pegou: a leitura é por CONTA, não por atleta — depois do regen o
// atleta ativo é outro, e a campanha que o card quer contar é a do anterior.
// Gated por DATABASE_URL. Serial (SPEC-015).
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAthlete } from '@camisa-9/player';
import {
  accrueSeasonMatch,
  closeSeason,
  countCareerSeasons,
  createAccountWithAthlete,
  createDb,
  readLastClosedSeason,
  readOpenSeasonsBefore,
  schema,
  type DbHandle,
  type SeasonMatchInput,
} from '../src/index.js';

const DB_URL = process.env.DATABASE_URL;
const PASSWORD = 'senha-bem-forte-123';
let seq = 0;

describe.skipIf(!DB_URL)(
  'season-summary-repo — a campanha da temporada contra Postgres real',
  () => {
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
      await handle.db.delete(schema.seasonSummary);
      await handle.db.delete(schema.matchChoice);
      await handle.db.delete(schema.athlete);
      await handle.db.delete(schema.team);
      await handle.db.delete(schema.account);
    });

    /** Cria conta + atleta. `email` fixo permite criar um SEGUNDO atleta na MESMA conta (o regen). */
    async function newAthlete(email?: string): Promise<{ athleteId: string; accountId: string }> {
      seq += 1;
      const draft = createAthlete({
        name: 'Craque',
        position: 'FWD',
        appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
        attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
      });
      if (!draft.ok) throw new Error(`draft inválido: ${draft.reason}`);
      const created = await createAccountWithAthlete(handle.db, {
        email: email ?? `ss${seq}@x.com`,
        password: PASSWORD,
        draft: draft.value,
      });
      return { athleteId: created.athleteId, accountId: created.accountId };
    }

    /** Um segundo atleta ATIVO na mesma conta — o que o regen produz (o velho vira inativo). */
    async function rebornOn(accountId: string, oldAthleteId: string): Promise<string> {
      await handle.db
        .update(schema.athlete)
        .set({ active: false })
        .where(eq(schema.athlete.id, oldAthleteId));
      const [row] = await handle.db
        .insert(schema.athlete)
        .values({
          accountId,
          name: 'Craque II',
          position: 'FWD',
          appearance: { skinTone: 1, hairStyle: 1, hairColor: 1 },
          fisico: 34,
          tecnico: 34,
          tatico: 34,
          mental: 34,
          active: true,
        })
        .returning({ id: schema.athlete.id });
      if (!row) throw new Error('renascido não criado');
      return row.id;
    }

    function match(over: Partial<SeasonMatchInput> = {}): SeasonMatchInput {
      return {
        seasonId: '2026',
        round: 1,
        day: 20_001,
        clubId: 'c-1',
        clubName: 'Guarani do Bairro',
        leagueId: 'l-1',
        tier: 3,
        position: 'FWD',
        goals: 1,
        assists: 0,
        rating: 72,
        overall: 41,
        ...over,
      };
    }

    async function rowOf(athleteId: string, seasonId = '2026') {
      const [r] = await handle.db
        .select()
        .from(schema.seasonSummary)
        .where(eq(schema.seasonSummary.athleteId, athleteId));
      if (!r || r.seasonId !== seasonId) return null;
      return r;
    }

    it('grava a estreia com o snapshot do mundo e o overall do dia', async () => {
      const { athleteId } = await newAthlete();
      const r0 = await accrueSeasonMatch(handle.db, athleteId, match());
      expect(r0.counted).toBe(true);

      const row = await rowOf(athleteId);
      expect(row).not.toBeNull();
      expect(row?.matches).toBe(1);
      expect(row?.goals).toBe(1);
      expect(row?.clubName).toBe('Guarani do Bairro'); // snapshot: a viragem apagaria o original
      expect(row?.tier).toBe(3);
      expect(row?.position).toBe('FWD');
      expect(row?.firstRound).toBe(1);
      expect(row?.ratingFirst).toBe(72);
      expect(row?.ratingLast).toBe(72);
      expect(row?.startOverall).toBe(41);
      expect(row?.endOverall).toBe(41);
      expect(row?.closedAt).toBeNull();
    });

    it('IDEMPOTÊNCIA: o mesmo dia processado 2× não soma nada', async () => {
      const { athleteId } = await newAthlete();
      await accrueSeasonMatch(handle.db, athleteId, match({ goals: 2, rating: 80 }));
      const again = await accrueSeasonMatch(handle.db, athleteId, match({ goals: 2, rating: 80 }));

      expect(again.counted).toBe(false); // o claim do dia já estava tomado
      const row = await rowOf(athleteId);
      expect(row?.matches).toBe(1);
      expect(row?.goals).toBe(2); // não 4
      expect(row?.ratingSum).toBe(80); // não 160
    });

    it('acumula ao longo da temporada e guarda o RECORDE com a rodada dele', async () => {
      const { athleteId } = await newAthlete();
      await accrueSeasonMatch(
        handle.db,
        athleteId,
        match({ round: 1, day: 1, rating: 64, goals: 0 }),
      );
      await accrueSeasonMatch(
        handle.db,
        athleteId,
        match({ round: 2, day: 2, rating: 83, goals: 2 }),
      );
      await accrueSeasonMatch(
        handle.db,
        athleteId,
        match({ round: 3, day: 3, rating: 71, goals: 1 }),
      );

      const row = await rowOf(athleteId);
      expect(row?.matches).toBe(3);
      expect(row?.goals).toBe(3);
      expect(row?.ratingSum).toBe(64 + 83 + 71);
      expect(row?.ratingBest).toBe(83);
      expect(row?.ratingBestRound).toBe(2); // a rodada do recorde, não a última
      expect(row?.ratingFirst).toBe(64); // primeira escrita, nunca sobrescrita
      expect(row?.ratingLast).toBe(71);
      expect(row?.firstRound).toBe(1);
      expect(row?.lastRound).toBe(3);
    });

    it('EVOLUÇÃO: o overall da estreia é preservado e o do fim acompanha o treino', async () => {
      const { athleteId } = await newAthlete();
      await accrueSeasonMatch(handle.db, athleteId, match({ round: 1, day: 1, overall: 41 }));
      await accrueSeasonMatch(handle.db, athleteId, match({ round: 2, day: 2, overall: 47 }));

      const row = await rowOf(athleteId);
      expect(row?.startOverall).toBe(41); // NÃO é reescrito
      expect(row?.endOverall).toBe(47); // é reescrito a cada dia de jogo
    });

    it('o snapshot do mundo NÃO é reescrito por uma partida posterior', async () => {
      const { athleteId } = await newAthlete();
      await accrueSeasonMatch(handle.db, athleteId, match({ round: 1, day: 1 }));
      // Uma transferência mid-season mudaria o clube na ocupação; a campanha guarda onde ela COMEÇOU.
      await accrueSeasonMatch(
        handle.db,
        athleteId,
        match({ round: 2, day: 2, clubName: 'Outro FC', tier: 2 }),
      );

      const row = await rowOf(athleteId);
      expect(row?.clubName).toBe('Guarani do Bairro');
      expect(row?.tier).toBe(3);
    });

    it('fecha uma vez só (o segundo fecho é no-op)', async () => {
      const { athleteId } = await newAthlete();
      await accrueSeasonMatch(handle.db, athleteId, match());

      const first = await closeSeason(handle.db, athleteId, '2026', {
        outcome: 'promoted',
        tierAfter: 2,
      });
      const second = await closeSeason(handle.db, athleteId, '2026', {
        outcome: 'relegated',
        tierAfter: 4,
      });

      expect(first.closed).toBe(true);
      expect(second.closed).toBe(false); // `closed_at IS NULL` é o gate
      const row = await rowOf(athleteId);
      expect(row?.outcome).toBe('promoted'); // o segundo NÃO sobrescreveu
      expect(row?.tierAfter).toBe(2);
    });

    it('a lista de trabalho do fecho exclui a temporada CORRENTE e as já fechadas', async () => {
      const { athleteId } = await newAthlete();
      await accrueSeasonMatch(handle.db, athleteId, match({ seasonId: '2026', day: 1 }));
      await accrueSeasonMatch(handle.db, athleteId, match({ seasonId: '2027', day: 2 }));

      const open = await readOpenSeasonsBefore(handle.db, '2027');
      expect(open.map((o) => o.seasonId)).toEqual(['2026']);

      await closeSeason(handle.db, athleteId, '2026', { outcome: 'stayed', tierAfter: null });
      expect(await readOpenSeasonsBefore(handle.db, '2027')).toHaveLength(0);
    });

    it('a carreira é da CONTA: o renascido enxerga a temporada do atleta anterior', async () => {
      const { athleteId, accountId } = await newAthlete();
      await accrueSeasonMatch(handle.db, athleteId, match({ goals: 22, rating: 78 }));
      await closeSeason(handle.db, athleteId, '2026', { outcome: 'promoted', tierAfter: 2 });

      // O regen: o velho vira inativo, nasce outro atleta ATIVO na mesma conta.
      const rebornId = await rebornOn(accountId, athleteId);
      expect(rebornId).not.toBe(athleteId);

      const last = await readLastClosedSeason(handle.db, accountId);
      expect(last?.seasonId).toBe('2026');
      expect(last?.goals).toBe(22);
      expect(last?.outcome).toBe('promoted');
      expect(await countCareerSeasons(handle.db, accountId)).toBe(1);
    });

    it('LAST: com duas temporadas fechadas, devolve a MAIS RECENTE (não a primeira)', async () => {
      // Sem este caso o `orderBy(desc(closedAt))` podia virar ASC sem quebrar nada — a revisão
      // adversarial provou isso por mutação, com 47/47 verdes.
      const { athleteId, accountId } = await newAthlete();
      await accrueSeasonMatch(handle.db, athleteId, match({ seasonId: '2025', day: 1, goals: 3 }));
      await closeSeason(handle.db, athleteId, '2025', { outcome: 'stayed', tierAfter: null });
      await accrueSeasonMatch(handle.db, athleteId, match({ seasonId: '2026', day: 2, goals: 9 }));
      await closeSeason(handle.db, athleteId, '2026', { outcome: 'champion', tierAfter: null });

      const last = await readLastClosedSeason(handle.db, accountId);
      expect(last?.seasonId).toBe('2026');
      expect(last?.goals).toBe(9);
      expect(last?.outcome).toBe('champion');
      expect(await countCareerSeasons(handle.db, accountId)).toBe(2);
    });

    it('não vaza a campanha de outra conta', async () => {
      const a = await newAthlete();
      const b = await newAthlete();
      await accrueSeasonMatch(handle.db, a.athleteId, match());
      await closeSeason(handle.db, a.athleteId, '2026', { outcome: 'champion', tierAfter: null });

      expect(await readLastClosedSeason(handle.db, b.accountId)).toBeNull();
      expect(await countCareerSeasons(handle.db, b.accountId)).toBe(0);
    });

    it('a temporada em curso NÃO aparece como última fechada', async () => {
      const { athleteId, accountId } = await newAthlete();
      await accrueSeasonMatch(handle.db, athleteId, match());

      expect(await readLastClosedSeason(handle.db, accountId)).toBeNull();
    });
  },
);
