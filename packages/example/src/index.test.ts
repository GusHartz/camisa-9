import { describe, expect, it } from 'vitest';
import { clamp, FOUNDATION_VERSION } from './index.js';

describe('clamp', () => {
  it('mantém valores já dentro do intervalo', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('satura no mínimo e no máximo', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('é determinístico (mesma entrada → mesma saída)', () => {
    expect(clamp(7, 0, 10)).toBe(clamp(7, 0, 10));
  });

  it('lança RangeError quando min > max', () => {
    expect(() => clamp(1, 10, 0)).toThrow(RangeError);
  });
});

describe('FOUNDATION_VERSION', () => {
  it('é a versão placeholder da fundação', () => {
    expect(FOUNDATION_VERSION).toBe('0.0.0');
  });
});
