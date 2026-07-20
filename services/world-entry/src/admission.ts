// A admissão de entrada (SPEC-034 — a waiting-list). `admitOrEnqueue`: sob o teto E com vaga, o solo
// entra IMEDIATO (mid-season); senão vai pra fila. `runAdmissionPass`: DIÁRIO (o scheduler chama),
// drena a fila FIFO-com-skip até o teto — herda as vagas que a inatividade/transferência liberam.
// Borda IMPURA; isolamento por candidato. A entrada de TIME é a SPEC-035.
import { isPosition } from '@camisa-9/player';
import {
  WAITINGLIST,
  countEntryHumans,
  dequeue,
  enqueue,
  findEntryClubWithSlot,
  readOccupation,
  readQueue,
  type Db as WorldDb,
} from '@camisa-9/world-store';

// ⚠️ Teto NÃO-atômico sob concorrência (revisão): `admitOrEnqueue`/`admitOne` fazem check-then-act
// (countEntryHumans → occupy) sem lock que atravesse os dois → duas ENTRADAS concorrentes podem exceder
// o teto por alguns. Money-path-neutro (soft cap). NÃO alcançável no sistema atual: o passe diário é
// SEQUENCIAL (re-checa a cada admissão) e não há rota HTTP concorrente ainda — a fonte de concorrência
// (a rota de entrada) é o card futuro que deve trazer o guard atômico (lock exclusivo por-mundo).
import { readAthleteIdentity, type Db as PlayerDb } from '@camisa-9/player-store';
import { enterWorld, EnterWorldError } from './enter-world.js';

export interface AdmitInput {
  readonly humanAthleteId: string;
  readonly worldSeed: string;
}

/** Entra IMEDIATO (sob o teto + com vaga) ou vai pra FILA. Idempotente (já-ocupa → no-op). */
export async function admitOrEnqueue(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  input: AdmitInput,
  cap: number = WAITINGLIST.entryCap,
): Promise<{ admitted: boolean }> {
  if (await readOccupation(worldDb, input.worldSeed, input.humanAthleteId)) {
    return { admitted: true }; // já está no mundo
  }
  const identity = await readAthleteIdentity(playerDb, input.humanAthleteId);
  if (!identity || !identity.active) throw new EnterWorldError('atleta não encontrado');
  if (!isPosition(identity.position)) throw new EnterWorldError('atleta inválido');
  // FIFO: se JÁ há alguém na fila para a MESMA posição, não fura — entra na fila atrás dele (revisão).
  const queue = await readQueue(worldDb, input.worldSeed);
  const contested = queue.some((q) => q.position === identity.position);
  const under = !contested && (await countEntryHumans(worldDb, input.worldSeed)) < cap;
  const clubId = under
    ? await findEntryClubWithSlot(worldDb, input.worldSeed, identity.position)
    : null;
  if (clubId !== null) {
    await enterWorld(worldDb, playerDb, {
      humanAthleteId: input.humanAthleteId,
      worldSeed: input.worldSeed,
      clubId,
    });
    return { admitted: true };
  }
  await enqueue(worldDb, input.worldSeed, input.humanAthleteId, identity.position);
  return { admitted: false };
}

/** O passe diário: drena a fila FIFO até o teto; pula quem não tem vaga na posição (não bloqueia a
 *  fila). Devolve quantos admitiu. Idempotente (já-ocupa → só sai da fila; `dequeue` ao admitir). */
export async function runAdmissionPass(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  cap: number = WAITINGLIST.entryCap,
): Promise<number> {
  const queue = await readQueue(worldDb, seed);
  let admitted = 0;
  for (const entry of queue) {
    try {
      if (await admitOne(worldDb, playerDb, seed, entry.humanAthleteId, entry.position, cap)) {
        admitted += 1;
      }
    } catch {
      console.error(`admissão adiada (world=${seed}) — admission_failed`); // OP-11
    }
  }
  return admitted;
}

/** Admite UM da fila: já-ocupa → sai da fila (recupera crash); teto → não (fica); sem vaga → pula. */
async function admitOne(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  seed: string,
  humanAthleteId: string,
  position: string,
  cap: number,
): Promise<boolean> {
  if (await readOccupation(worldDb, seed, humanAthleteId)) {
    await dequeue(worldDb, seed, humanAthleteId); // já entrou (crash anterior) → só sai da fila
    return false;
  }
  if ((await countEntryHumans(worldDb, seed)) >= cap) return false; // teto → fica na fila
  const clubId = await findEntryClubWithSlot(worldDb, seed, position);
  if (clubId === null) return false; // sem vaga na posição → PULA (FIFO-com-skip)
  await enterWorld(worldDb, playerDb, { humanAthleteId, worldSeed: seed, clubId });
  await dequeue(worldDb, seed, humanAthleteId);
  return true;
}
