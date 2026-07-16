import { describe, expect, it } from 'vitest';
import { validateName } from './name-filter.js';

describe('validateName', () => {
  it('aceita e normaliza (trim + colapsa espaços)', () => {
    const r = validateName('  Zé   da  Várzea  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('Zé da Várzea');
  });

  it('rejeita muito curto (<2)', () => {
    expect(validateName('A').ok).toBe(false);
  });

  it('rejeita muito longo (>20)', () => {
    expect(validateName('a'.repeat(21)).ok).toBe(false);
  });

  it('rejeita dígitos e símbolos', () => {
    expect(validateName('Ze123').ok).toBe(false);
    expect(validateName('Ze_Silva').ok).toBe(false);
  });

  it('rejeita a blocklist (insensível a caixa e leet)', () => {
    expect(validateName('admin').ok).toBe(false);
    expect(validateName('Adm1n').ok).toBe(false);
    expect(validateName('ADMIN').ok).toBe(false);
  });

  it('aceita nome legítimo com acento e hífen', () => {
    expect(validateName('João-Pedro').ok).toBe(true);
  });
});
