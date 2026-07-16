import { describe, expect, it } from 'vitest';
import { createAthlete } from './create.js';
import type { CreateAthleteInput } from './types.js';

const BASE: CreateAthleteInput = {
  name: 'Zé da Várzea',
  position: 'FWD',
  appearance: { skinTone: 2, hairStyle: 1, hairColor: 3 },
  attributes: { fisico: 34, tecnico: 34, tatico: 34, mental: 34 },
};

describe('createAthlete', () => {
  it('cria uma identidade válida (draft sem id/timestamps)', () => {
    const r = createAthlete(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Zé da Várzea');
      expect(r.value.position).toBe('FWD');
      expect(r.value.attributes.fisico).toBe(34);
      expect(r.value.appearance.skinTone).toBe(2);
    }
  });

  it('propaga a falha do nome (blocklist)', () => {
    expect(createAthlete({ ...BASE, name: 'admin' }).ok).toBe(false);
  });

  it('propaga a falha dos atributos (teto/soma)', () => {
    const bad = { fisico: 99, tecnico: 20, tatico: 20, mental: 20 };
    expect(createAthlete({ ...BASE, attributes: bad }).ok).toBe(false);
  });

  it('propaga a falha do visual (índice fora da faixa)', () => {
    const bad = { skinTone: 9, hairStyle: 0, hairColor: 0 };
    expect(createAthlete({ ...BASE, appearance: bad }).ok).toBe(false);
  });
});
