// Forma & Moral — as barras (SPEC-027) — testes puros: o clamp, o passo monotônico rumo ao alvo,
// o bump de evento, o offset limitado do estilo de vida e os alvos de decay (moral com offset,
// forma com o drag da lesão).
import { describe, expect, it } from 'vitest';
import {
  MOOD,
  bumpBar,
  clampBar,
  lifestyleMoralOffset,
  nextForma,
  nextMoral,
  stepToward,
} from './mood.js';

describe('mood — as barras (puro)', () => {
  it('clampBar prende em [0,100]', () => {
    expect(clampBar(-5)).toBe(0);
    expect(clampBar(150)).toBe(100);
    expect(clampBar(50)).toBe(50);
  });

  it('stepToward dá UM passo rumo ao alvo, sem ultrapassar (monotônico, ambas as direções)', () => {
    expect(stepToward(50, 80, 5)).toBe(55); // sobe um passo
    expect(stepToward(50, 20, 5)).toBe(45); // desce um passo
    expect(stepToward(52, 50, 5)).toBe(50); // descendo: não ultrapassa o alvo
    expect(stepToward(48, 50, 5)).toBe(50); // subindo: não ultrapassa o alvo (anti-overshoot ↑)
    expect(stepToward(50, 50, 5)).toBe(50); // já no alvo → estável
  });

  it('bumpBar aplica o delta de evento, clampeado', () => {
    expect(bumpBar(50, 12)).toBe(62);
    expect(bumpBar(95, 12)).toBe(100); // teto
    expect(bumpBar(3, -10)).toBe(0); // piso
  });

  it('lifestyleMoralOffset extrai o moral e LIMITA a ±lifestyleClamp', () => {
    expect(lifestyleMoralOffset({ moral: 10, fama: 8 })).toBe(10);
    expect(lifestyleMoralOffset({ moral: -10 })).toBe(-10); // negativo dentro da faixa passa
    expect(lifestyleMoralOffset({ moral: MOOD.lifestyleClamp })).toBe(MOOD.lifestyleClamp); // borda +
    expect(lifestyleMoralOffset({ moral: -MOOD.lifestyleClamp })).toBe(-MOOD.lifestyleClamp); // borda −
    expect(lifestyleMoralOffset({ moral: 999 })).toBe(MOOD.lifestyleClamp); // teto
    expect(lifestyleMoralOffset({ moral: -999 })).toBe(-MOOD.lifestyleClamp); // piso
    expect(lifestyleMoralOffset({ fama: 8 })).toBe(0); // sem moral
  });

  it('nextMoral decai rumo a baseline + offset do estilo de vida', () => {
    // sem offset: puxa rumo a 50
    expect(nextMoral(62, 0)).toBe(62 - MOOD.decayStep);
    expect(nextMoral(40, 0)).toBe(40 + MOOD.decayStep);
    // offset +30: alvo 80 → sobe rumo a 80
    expect(nextMoral(50, 30)).toBe(50 + MOOD.decayStep);
  });

  it('nextForma decai rumo a baseline, rebaixado enquanto recuperando', () => {
    expect(nextForma(60, false)).toBe(60 - MOOD.decayStep); // rumo a 50
    // recuperando: alvo 50 − drag = 30 → desce rumo a 30
    const alvo = MOOD.baseline - MOOD.injuryFormaDrag;
    expect(nextForma(50, true)).toBe(50 - MOOD.decayStep);
    expect(nextForma(alvo, true)).toBe(alvo); // já no alvo rebaixado → estável
  });

  it('convergência: iterar o passe NÃO oscila (estabiliza no alvo)', () => {
    let m = 20;
    for (let i = 0; i < 50; i++) m = nextMoral(m, 0);
    expect(m).toBe(MOOD.baseline); // converge ao baseline e para
    let f = 90;
    for (let i = 0; i < 50; i++) f = nextForma(f, false);
    expect(f).toBe(MOOD.baseline);
  });
});
