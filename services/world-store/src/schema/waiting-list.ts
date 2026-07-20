// Fila de espera de entrada (SPEC-034 — a waiting-list). Quando a divisão de entrada atinge o TETO
// de humanos solo, o novo solo entra AQUI (FIFO) em vez de ocupar; o passe diário de admissão puxa
// o próximo quando abre vaga (a vaga que a inatividade/transferência libera). `ord` = ordem de
// chegada (FIFO). PK `(world_seed, human_athlete_id)` = 1 entrada por humano (não fila em dobro).
// `position` = a vaga que ele quer (lida do player no enfileiramento) — o passe só admite se há vaga
// NPC livre nessa posição (FIFO-com-skip). World-scoped (a fila é do mundo).
import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { world } from './world.js';

export const waitingList = pgTable(
  'waiting_list',
  {
    worldSeed: text('world_seed')
      .notNull()
      .references(() => world.seed),
    humanAthleteId: text('human_athlete_id').notNull(),
    position: text('position').notNull(),
    ord: integer('ord').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.worldSeed, t.humanAthleteId] }) }),
);
