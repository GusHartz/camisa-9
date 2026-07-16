// Regenera o golden da âncora (`anchor.golden.json`) após a mudança INTENCIONAL de
// cadência para DIÁRIO 7/7 (SPEC-015; era ter/qui/sáb às 15h). Lista curada de
// instantes → `resolveSlot`, com CROSS-CHECK por um ORÁCULO INDEPENDENTE (Date nativo
// deslocado -3h) que ABORTA se divergir — o golden não pode só ecoar o `resolveSlot`.
//
// Borda IMPURA (usa `fs` + `Date`) — vive em `harness/`, nunca em `packages/*/src`,
// onde o guardrail de determinismo proíbe I/O e relógio. A saída é determinística
// (instantes fixos); só o founder decide regerar.
//
// Uso: npm run build && tsx harness/regen-anchor-golden.ts
import { writeFileSync } from 'node:fs';
import { resolveSlot, type RoundSlot } from '@camisa-9/world-engine';

const BRASILIA_OFFSET_MS = -3 * 3_600_000; // UTC-3 fixo (Brasil sem DST desde 2019)

// Todos os instantes em -03:00. Os 9 primeiros = os vetores ORIGINAIS (conteúdo
// preservado — nenhum muda: todo `true` já é 15h, todo `false` cai pela HORA). Os 4
// últimos provam o 7/7: dom/seg/qua/sex às 15h — sob ter/qui/sáb seriam `false`.
const ISOS: readonly string[] = [
  '2026-07-11T15:00:00-03:00', // sáb 15h  (janela)
  '2026-07-07T15:00:00-03:00', // ter 15h  (janela)
  '2026-07-09T15:00:00-03:00', // qui 15h  (janela)
  '2026-07-06T10:00:00-03:00', // seg 10h  (fora — hora)
  '2026-07-11T14:59:00-03:00', // sáb 14:59 (fora — hora)
  '2026-07-11T23:30:00-03:00', // sáb 23:30 (fora — hora)
  '1969-12-27T15:00:00-03:00', // sáb 15h pré-1970 (janela; guarda módulo negativo)
  '1969-12-27T00:00:00-03:00', // sáb 00h pré-1970 (fora)
  '1969-12-25T10:30:00-03:00', // qui 10:30 pré-1970 (fora)
  '2026-07-12T15:00:00-03:00', // NOVO: dom 15h → janela (prova 7/7)
  '2026-07-06T15:00:00-03:00', // NOVO: seg 15h → janela (prova 7/7)
  '2026-07-08T15:00:00-03:00', // NOVO: qua 15h → janela (prova 7/7)
  '2026-07-10T15:00:00-03:00', // NOVO: sex 15h → janela (prova 7/7)
];

interface OracleSlot {
  readonly dayOfWeek: number;
  readonly hour: number;
  readonly minute: number;
  readonly isMatchWindow: boolean;
}

/** Oráculo independente do `resolveSlot`: campos de Brasília via Date nativo deslocado. */
function oracle(epochMs: number): OracleSlot {
  const d = new Date(epochMs + BRASILIA_OFFSET_MS); // campos UTC = relógio de Brasília
  const hour = d.getUTCHours();
  return { dayOfWeek: d.getUTCDay(), hour, minute: d.getUTCMinutes(), isMatchWindow: hour === 15 };
}

interface Vector {
  readonly iso: string;
  readonly epochMs: number;
  readonly slot: RoundSlot;
}

function buildVectors(): Vector[] {
  return ISOS.map((iso) => {
    const epochMs = Date.parse(iso);
    const slot = resolveSlot(epochMs);
    const o = oracle(epochMs);
    if (
      o.dayOfWeek !== slot.dayOfWeek ||
      o.hour !== slot.hour ||
      o.minute !== slot.minute ||
      o.isMatchWindow !== slot.isMatchWindow
    ) {
      throw new Error(
        `divergência do oráculo em ${iso}: resolveSlot=${JSON.stringify(slot)} oráculo=${JSON.stringify(o)}`,
      );
    }
    return { iso, epochMs, slot };
  });
}

const golden = { vectors: buildVectors() };
const target = new URL(
  '../packages/world-engine/src/__fixtures__/anchor.golden.json',
  import.meta.url,
);
writeFileSync(target, `${JSON.stringify(golden, null, 2)}\n`, 'utf8');
const janelas = golden.vectors.filter((v) => v.slot.isMatchWindow).length;
console.log(`anchor.golden.json regenerado: ${golden.vectors.length} vetores, ${janelas} janelas.`);
