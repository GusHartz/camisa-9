// A lógica dos scripts de operador (SPEC-039), separada do `main()` para ser TESTÁVEL.
//
// Os scripts (`seed-world.ts`, `set-anchor.ts`) são cascas finas: leem env, chamam daqui, imprimem.
// A regra que importa — "semear NUNCA sobrescreve" — precisa de teste de verdade, e um `main()` que
// lê `process.env` e chama `process.exit` não é testável.
import {
  readSeasonAnchor,
  readWorld,
  setSeasonAnchor,
  writeWorld,
  type Db,
} from '@camisa-9/world-store';
import { dayIndexFromDate } from './ops-date.js';

export class OpsError extends Error {}

export interface SeedReport {
  readonly seasonId: string;
  readonly tiers: number;
  readonly leagues: number;
  readonly clubs: number;
}

/**
 * Semeia o mundo da seed — **e recusa se já existir**.
 *
 * ⚠️ A recusa é a razão de ser desta função. `writeWorld` sobre uma seed viva apagaria clubes,
 * elencos, ocupações humanas e rodadas publicadas: a carreira de todos os jogadores dela. Não há
 * `--force` de propósito — a operação mais destrutiva do projeto não pode caber num typo.
 * A checagem acontece ANTES de qualquer escrita, então uma seed existente sai daqui intacta.
 */
export async function seedWorldOnce(db: Db, seed: string): Promise<SeedReport> {
  const existente = await readWorld(db, seed);
  if (existente) {
    throw new OpsError(
      `a seed "${seed}" JÁ TEM mundo (temporada ${existente.seasonId}) — nada foi escrito.\n` +
        '  Semear de novo apagaria clubes, elencos, ocupações humanas e rodadas publicadas.\n' +
        '  Se a intenção é mesmo recomeçar, apague o mundo explicitamente no banco antes.',
    );
  }
  await writeWorld(db, seed);
  const mundo = await readWorld(db, seed);
  if (!mundo) throw new OpsError('o mundo não foi encontrado após semear');
  return {
    seasonId: mundo.seasonId,
    tiers: mundo.tiers.length,
    leagues: mundo.tiers.reduce((n, t) => n + t.leagues.length, 0),
    clubs: mundo.tiers.reduce((n, t) => n + t.leagues.reduce((m, l) => m + l.clubs.length, 0), 0),
  };
}

export interface AnchorReport {
  readonly seasonId: string;
  readonly startDate: string;
  readonly startDayIndex: number;
}

/**
 * Ancora a temporada na data informada. O `seasonId` é **derivado do mundo** (nunca perguntado —
 * assim é impossível ancorar a temporada errada) e a data vira `dayIndex` via o `resolveSlot` do
 * engine. Sem mundo, falha apontando o `seed-world`.
 */
export async function anchorSeason(db: Db, seed: string, startDate: string): Promise<AnchorReport> {
  const startDayIndex = dayIndexFromDate(startDate); // valida antes de tocar o banco
  const mundo = await readWorld(db, seed);
  if (!mundo) {
    throw new OpsError(
      `não existe mundo semeado para a seed "${seed}" — a âncora não faz sentido sozinha.\n` +
        `  Rode primeiro: SEED="${seed}" npx tsx harness/seed-world.ts`,
    );
  }
  await setSeasonAnchor(db, seed, mundo.seasonId, startDayIndex);
  const gravado = await readSeasonAnchor(db, seed, mundo.seasonId);
  if (gravado !== startDayIndex) throw new OpsError('a âncora não foi gravada como esperado');
  return { seasonId: mundo.seasonId, startDate, startDayIndex };
}
