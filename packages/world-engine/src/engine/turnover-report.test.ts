import { describe, expect, it } from 'vitest';
import { WORLD } from '../constants.js';
import { seedWorld } from '../data/world-seed.js';
import { simulateWorldSeason } from './world-season.js';
import { advanceWorld } from './world-turnover.js';
import { turnoverReport } from './turnover-report.js';

describe('turnoverReport — diff da viragem', () => {
  const before = seedWorld('rel');
  const after = advanceWorld(before, simulateWorldSeason(before, 'rel'), 'rel');
  const report = turnoverReport(before, after);

  it('registra a temporada de origem e destino', () => {
    expect(report.fromSeasonId).toBe('2026');
    expect(report.toSeasonId).toBe('2027');
  });

  it('promovidos sobem (toTier < fromTier) e rebaixados descem (toTier > fromTier)', () => {
    for (const m of report.promoted) expect(m.toTier).toBeLessThan(m.fromTier);
    for (const m of report.relegated) expect(m.toTier).toBeGreaterThan(m.fromTier);
  });

  it('conserva o fluxo por fronteira: promovidos == rebaixados == 3 fronteiras × k', () => {
    const k = WORLD.promoteRelegate.reduce((s, n) => s + n, 0); // 3+3+3
    expect(report.promoted).toHaveLength(k);
    expect(report.relegated).toHaveLength(k);
  });

  it('nascidos repõem exatamente os aposentados (elenco total conservado)', () => {
    expect(report.born.length).toBe(report.retired.length);
    expect(report.born.length).toBeGreaterThan(0);
  });

  it('transferidos mudaram de clube mas continuam vivos (id preservado)', () => {
    for (const m of report.transferred) expect(m.fromClubId).not.toBe(m.toClubId);
    expect(report.transferred.length).toBeGreaterThan(0);
  });

  it('é determinístico', () => {
    const after2 = advanceWorld(before, simulateWorldSeason(before, 'rel'), 'rel');
    expect(turnoverReport(before, after2)).toEqual(report);
  });
});
