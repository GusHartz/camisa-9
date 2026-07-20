// entryOccupancyRate (R13, SPEC-036) — PURA (do snapshot + ocupações), sem DB → sempre roda.
// = nº de humanos em clubes da entrada / nº de clubes da entrada (grupos × clubsPerLeague).
import { describe, expect, it } from 'vitest';
import { seedWorld } from '@camisa-9/world-engine';
import { entryOccupancyRate } from '../src/store/turnover-repo.js';

const world = seedWorld('occ');
const entry = world.tiers[world.tiers.length - 1]!;
const entryClubIds = entry.leagues.flatMap((l) => l.clubs.map((c) => c.id));
const otherClubId = world.tiers[0]!.leagues[0]!.clubs[0]!.id; // um clube de OUTRO andar

describe('entryOccupancyRate', () => {
  it('0 sem ocupações', () => {
    expect(entryOccupancyRate(world, [])).toBe(0);
  });

  it('conta só os humanos em clubes da ENTRADA (ignora outros andares)', () => {
    const occ = [{ clubId: entryClubIds[0]! }, { clubId: otherClubId }];
    expect(entryOccupancyRate(world, occ)).toBe(1 / entryClubIds.length);
  });

  it('14/20 = 0.70 (o gatilho de expansão)', () => {
    const occ = entryClubIds.slice(0, 14).map((clubId) => ({ clubId }));
    expect(entryOccupancyRate(world, occ)).toBeCloseTo(0.7, 10);
  });

  it('conta MÚLTIPLOS humanos no mesmo clube (numerador = humanos, não clubes)', () => {
    const occ = [{ clubId: entryClubIds[0]! }, { clubId: entryClubIds[0]! }];
    expect(entryOccupancyRate(world, occ)).toBe(2 / entryClubIds.length);
  });
});
