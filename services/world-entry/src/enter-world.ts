// A costura player↔world (SPEC-020, card 21): coloca o atleta HUMANO numa vaga NPC da divisão
// de entrada. Borda IMPURA. SEM transação cross-schema — o `ability` é uma FOTO CONGELADA da
// temporada: (1) lê a identidade do humano (player-store), (2) projeta focos→ability (lib PURA),
// (3) ocupa a vaga (world-store, transação só-no-mundo). A regra de projeção e a de ocupação
// vivem nas suas camadas (OP-17); aqui só orquestra. Erros GENÉRICOS (OP-11).
import { abilityFromFocos, isPosition } from '@camisa-9/player';
import { occupyNpcSlot, type Db as WorldDb, type OccupyResult } from '@camisa-9/world-store';
import { readAthleteIdentity, type Db as PlayerDb } from '@camisa-9/player-store';

export interface EnterWorldInput {
  readonly humanAthleteId: string;
  readonly worldSeed: string;
  readonly clubId: string;
}

/** Falha da costura — mensagem já genérica/segura (OP-11). */
export class EnterWorldError extends Error {}

/**
 * Coloca o atleta humano numa vaga NPC do clube alvo. `worldDb` e `playerDb` compartilham o
 * mesmo Postgres (schemas `public`/`player`), mas a única transação é a da ocupação (mundo).
 */
export async function enterWorld(
  worldDb: WorldDb,
  playerDb: PlayerDb,
  input: EnterWorldInput,
): Promise<OccupyResult> {
  const identity = await readAthleteIdentity(playerDb, input.humanAthleteId);
  if (!identity || !identity.active) throw new EnterWorldError('atleta não encontrado');
  if (!isPosition(identity.position)) throw new EnterWorldError('atleta inválido');
  const ability = abilityFromFocos(identity.attributes, identity.position);
  return occupyNpcSlot(worldDb, {
    worldSeed: input.worldSeed,
    clubId: input.clubId,
    position: identity.position,
    humanAthleteId: input.humanAthleteId,
    humanName: identity.name,
    ability,
  });
}
