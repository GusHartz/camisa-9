// Gerador determinístico de tabela turno-returno (double round-robin).
// 10 clubes → 18 rodadas, 5 partidas/rodada, 90 partidas. Método do círculo.

import type { Club, Fixture } from '../types.js';

export function generateFixtures(clubs: readonly Club[]): Fixture[] {
  const n = clubs.length;
  if (n < 2 || n % 2 !== 0) {
    throw new RangeError('generateFixtures: número de clubes deve ser par e ≥ 2.');
  }
  const firstLeg = buildSingleRoundRobin(clubs.map((c) => c.id));
  const roundsPerLeg = n - 1;
  const secondLeg = firstLeg.map((f): Fixture => ({
    round: f.round + roundsPerLeg,
    homeId: f.awayId,
    awayId: f.homeId,
  }));
  return [...firstLeg, ...secondLeg];
}

/** Turno (single round-robin) pelo método do círculo: n-1 rodadas, n/2 partidas cada. */
function buildSingleRoundRobin(ids: readonly string[]): Fixture[] {
  const n = ids.length;
  const wheel = [...ids];
  const half = n / 2;
  const fixtures: Fixture[] = [];
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < half; i++) {
      const a = wheel[i];
      const b = wheel[n - 1 - i];
      if (a === undefined || b === undefined) continue;
      // Alterna o mando a cada rodada para equilibrar casa/fora.
      const home = r % 2 === 0 ? a : b;
      const away = r % 2 === 0 ? b : a;
      fixtures.push({ round: r + 1, homeId: home, awayId: away });
    }
    rotate(wheel);
  }
  return fixtures;
}

/** Fixa a posição 0 e rotaciona as demais uma casa (método do círculo). */
function rotate(wheel: string[]): void {
  const last = wheel.pop();
  if (last !== undefined) {
    wheel.splice(1, 0, last);
  }
}
