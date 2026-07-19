import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { dueDayIndex, resolveSlot, type RoundSlot } from './anchor.js';

const golden = JSON.parse(
  readFileSync(new URL('../__fixtures__/anchor.golden.json', import.meta.url), 'utf8'),
) as { vectors: { iso: string; epochMs: number; slot: RoundSlot }[] };

describe('resolveSlot — fuso Brasília (offset fixo UTC-3)', () => {
  it('bate com os vetores golden (positivos e negativos)', () => {
    for (const v of golden.vectors) {
      expect(resolveSlot(v.epochMs)).toEqual(v.slot);
    }
  });

  it('qualquer dia às 15h é janela de rodada (diário 7/7); fora das 15h não', () => {
    const windows = golden.vectors.filter((v) => v.slot.isMatchWindow);
    const nonWindows = golden.vectors.filter((v) => !v.slot.isMatchWindow);
    expect(windows.length).toBeGreaterThan(0);
    expect(nonWindows.length).toBeGreaterThan(0);
    // janela ⇔ 15h; o dia da semana é irrelevante (era ter/qui/sáb, agora 7/7).
    for (const v of windows) expect(v.slot.hour).toBe(15);
    for (const v of nonWindows) expect(v.slot.hour).not.toBe(15);
    // prova o 7/7: há janelas FORA de ter/qui/sáb (dom/seg/qua/sex às 15h).
    expect(windows.some((v) => ![2, 4, 6].includes(v.slot.dayOfWeek))).toBe(true);
  });

  it('14:59 no sábado NÃO é janela (limiar exato de hora)', () => {
    const almost = golden.vectors.find((v) => v.iso === '2026-07-11T14:59:00-03:00');
    expect(almost?.slot.isMatchWindow).toBe(false);
    expect(almost?.slot.hour).toBe(14);
    expect(almost?.slot.minute).toBe(59);
  });

  it('cobre epochMs NEGATIVO (pré-1970) — guarda a normalização de módulo negativo', () => {
    // Sem um vetor negativo, uma regressão em ((...)%7 + 7) % 7 (anchor.ts) passaria no
    // CI: os positivos têm dayIndex ≥ 0 e nunca exercitam o ramo de módulo negativo.
    const negativos = golden.vectors.filter((v) => v.epochMs < 0);
    expect(negativos.length).toBeGreaterThanOrEqual(2);
    for (const v of negativos) {
      expect(v.slot.dayIndex).toBeLessThan(0);
      expect(resolveSlot(v.epochMs)).toEqual(v.slot);
      expect(v.slot.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(v.slot.dayOfWeek).toBeLessThanOrEqual(6);
    }
    // Ambos os ramos de janela cobertos também no passado.
    expect(negativos.some((v) => v.slot.isMatchWindow)).toBe(true);
    expect(negativos.some((v) => !v.slot.isMatchWindow)).toBe(true);
  });

  describe('dueDayIndex — teto do catch-up (SPEC-032)', () => {
    it('coerente com os vetores golden: ≥15h → hoje, <15h → ontem', () => {
      for (const v of golden.vectors) {
        const expected = v.slot.hour >= 15 ? v.slot.dayIndex : v.slot.dayIndex - 1;
        expect(dueDayIndex(v.epochMs)).toBe(expected);
      }
    });

    it('14:59 (antes da janela) → o dia vencido é ONTEM', () => {
      const almost = golden.vectors.find((v) => v.iso === '2026-07-11T14:59:00-03:00');
      expect(almost).toBeDefined();
      expect(dueDayIndex(almost!.epochMs)).toBe(almost!.slot.dayIndex - 1);
    });

    it('15:00 exato (abre a janela) → o dia vencido é HOJE', () => {
      const at15 = golden.vectors.find((v) => v.slot.hour === 15);
      expect(at15).toBeDefined();
      expect(dueDayIndex(at15!.epochMs)).toBe(at15!.slot.dayIndex);
    });

    it('das 15h à meia-noite: qualquer hora ≥15 do MESMO dia → o mesmo dia vencido', () => {
      const h = 3_600_000;
      const day = resolveSlot(18 * h).dayIndex; // 18h UTC = 15h BRT → dia BRT de referência
      // 15:00, 16:00, 20:00, 23:00 do dia BRT de referência — epoch = 18:00..02:00 UTC.
      for (const localHour of [15, 16, 20, 23]) {
        const epoch = (localHour + 3) * h; // +3 = desfaz o offset UTC-3 (BRT→UTC)
        expect(dueDayIndex(epoch)).toBe(day);
      }
      // 00:30 BRT do dia SEGUINTE (03:30 UTC) → hora 0 <15 → o dia vencido volta ao dia de ref.
      expect(dueDayIndex(3 * h + 30 * 60_000 + 24 * h)).toBe(day);
    });
  });

  describe('independência do fuso do host', () => {
    const original = process.env.TZ;
    afterEach(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    it('resultado idêntico mesmo com TZ do processo em UTC+14', () => {
      process.env.TZ = 'Pacific/Kiritimati';
      for (const v of golden.vectors) {
        expect(resolveSlot(v.epochMs)).toEqual(v.slot);
      }
    });
  });
});
