// Filtro de nome do jogador (SPEC-016) — normaliza + valida forma + blocklist mínima.
// Puro/determinístico: `toLowerCase`/`normalize('NFD')` são spec-ECMAScript (não ICU/locale),
// permitidos pelo guardrail; nada de Intl/Date/random.
import { PLAYER } from './constants.js';
import { NAME_BLOCKLIST } from './data/name-blocklist.js';
import type { Result } from './types.js';

// Começa com letra; depois letras (com acento), espaço, apóstrofo e hífen.
const ALLOWED = /^\p{L}[\p{L} '-]*$/u;
// Diacríticos combinantes U+0300..U+036F (removidos após NFD para tirar o acento).
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');

const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** Valida e normaliza o nome (trim + colapsa espaços). Rejeita forma inválida ou blocklist. */
export function validateName(raw: string): Result<string> {
  const value = raw.trim().replace(/\s+/g, ' ');
  const { minLen, maxLen } = PLAYER.name;
  if (value.length < minLen) return fail('nome muito curto');
  if (value.length > maxLen) return fail('nome muito longo');
  if (!ALLOWED.test(value)) return fail('nome com caracteres inválidos');
  if (isBlocked(value)) return fail('nome não permitido');
  return { ok: true, value };
}

function isBlocked(name: string): boolean {
  const norm = canonical(name);
  return NAME_BLOCKLIST.some((bad) => norm.includes(bad));
}

/** minúscula → sem acento → sem leet → só letras: forma canônica p/ casar a blocklist. */
function canonical(s: string): string {
  const bare = s.toLowerCase().normalize('NFD').replace(COMBINING, '');
  const deleet = Array.from(bare, (ch) => LEET[ch] ?? ch).join('');
  return deleet.replace(/[^a-z]/g, '');
}

function fail(reason: string): Result<never> {
  return { ok: false, reason };
}
