import { describe, expect, it } from 'vitest';
import { validateAppearance } from './appearance.js';
import { validatePassword } from './password-policy.js';

describe('validateAppearance', () => {
  it('aceita índices na faixa (0..5)', () => {
    expect(validateAppearance({ skinTone: 0, hairStyle: 5, hairColor: 3 }).ok).toBe(true);
  });

  it('rejeita índice fora da faixa', () => {
    expect(validateAppearance({ skinTone: 6, hairStyle: 0, hairColor: 0 }).ok).toBe(false);
    expect(validateAppearance({ skinTone: -1, hairStyle: 0, hairColor: 0 }).ok).toBe(false);
  });
});

describe('validatePassword', () => {
  it('rejeita senha curta (<10)', () => {
    expect(validatePassword('curta').ok).toBe(false);
  });

  it('aceita senha com ≥10 caracteres', () => {
    expect(validatePassword('senhaforte123').ok).toBe(true);
  });
});
