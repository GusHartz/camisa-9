// Progressão por treino (SPEC-017) — testes PUROS: a curva de 3 zonas, o determinismo, a
// cascata de pontos, os seams (DLC/idade) e o teto 99 do gasto. Sem banco, sempre rodam.
import { describe, expect, it } from 'vitest';
import { CREATION_TOTAL, TRAINING } from './constants.js';
import { applyPoint, nextThreshold, pointsEarnedTotal, trainSession } from './training.js';
import type { Attributes, Focus } from './types.js';

/** Um estado com atributos dados (default: recém-criado, tudo 34 → soma 136 = CREATION_TOTAL). */
function attrs(fisico = 34, tecnico = 34, tatico = 34, mental = 34): Attributes {
  return { fisico, tecnico, tatico, mental };
}

describe('pointsEarnedTotal', () => {
  it('recém-criado (soma = CREATION_TOTAL) e sem pontos livres → 0', () => {
    expect(pointsEarnedTotal(attrs(), 0)).toBe(0);
    expect(CREATION_TOTAL).toBe(136);
  });

  it('conta os pontos gastos (soma acima de 136) E os livres não gastos', () => {
    expect(pointsEarnedTotal(attrs(40, 34, 34, 34), 0)).toBe(6); // +6 no físico
    expect(pointsEarnedTotal(attrs(40, 34, 34, 34), 2)).toBe(8); // +2 livres
  });
});

describe('nextThreshold — curva de 3 zonas', () => {
  it('as zonas batem o feeling do design record (~3 / ~8 / ~15+ treinos/ponto)', () => {
    // sessionXp = 100 → limiar/sessionXp = treinos por ponto.
    expect(nextThreshold(0) / TRAINING.sessionXp).toBe(3); // várzea
    expect(nextThreshold(150) / TRAINING.sessionXp).toBe(8); // meio
    expect(nextThreshold(204) / TRAINING.sessionXp).toBe(15); // início da cauda elite
  });

  it('as fronteiras das zonas são exatas (104 e 204)', () => {
    expect(nextThreshold(103)).toBe(TRAINING.zone1Xp);
    expect(nextThreshold(104)).toBe(TRAINING.zone2Xp);
    expect(nextThreshold(203)).toBe(TRAINING.zone2Xp);
    expect(nextThreshold(204)).toBe(TRAINING.zone3BaseXp);
  });

  it('a cauda elite tem ramp crescente (grind orgulhoso)', () => {
    expect(nextThreshold(205)).toBe(TRAINING.zone3BaseXp + TRAINING.zone3RampXp);
    expect(nextThreshold(260)).toBe(TRAINING.zone3BaseXp + 56 * TRAINING.zone3RampXp); // overall 99
    expect(nextThreshold(260)).toBeGreaterThan(nextThreshold(204));
  });
});

describe('trainSession', () => {
  it('é determinístico: mesmo estado/foco/opts → mesmo resultado', () => {
    const s = { attributes: attrs(), trainingXp: 40, freePoints: 0 };
    expect(trainSession(s, 'fisico')).toEqual(trainSession(s, 'fisico'));
  });

  it('uma sessão neutra deposita sessionXp na barra (sem ganhar ponto ainda)', () => {
    const r = trainSession({ attributes: attrs(), trainingXp: 0, freePoints: 0 }, 'tecnico');
    expect(r).toEqual({ trainingXp: 100, freePoints: 0, freePointsGained: 0 });
  });

  it('enche a barra e ganha o ponto, carregando o resto', () => {
    // barra 250 + 100 = 350 ≥ 300 (zona 1) → 1 ponto, resto 50.
    const r = trainSession({ attributes: attrs(), trainingXp: 250, freePoints: 0 }, 'fisico');
    expect(r).toEqual({ trainingXp: 50, freePoints: 1, freePointsGained: 1 });
  });

  it('estoura EM CASCATA múltiplos pontos com o limiar recomputando a cada um', () => {
    // barra 950 + 100 = 1050; zona 1 (limiar 300): 1050→750→450→150 = 3 pontos, resto 150.
    const r = trainSession({ attributes: attrs(), trainingXp: 950, freePoints: 0 }, 'fisico');
    expect(r).toEqual({ trainingXp: 150, freePoints: 3, freePointsGained: 3 });
  });

  it('a cascata PARA ao cruzar a fronteira de zona (o limiar sobe no meio da sessão)', () => {
    // atributos somando 238 → p-de-atributos = 102 (borda da zona 1). barra 1000 + 100 = 1100.
    // p=102→300: 1100→800 (fp1, p103); p=103→300: 800→500 (fp2, p104); p=104→800 (ZONA 2): 500<800 PARA.
    // Sem o recomputo do limiar, o 3º ponto sairia a 300 (500≥300) — a parada prova o cruzamento.
    const r = trainSession(
      { attributes: attrs(70, 70, 70, 28), trainingXp: 1000, freePoints: 0 },
      'fisico',
    );
    expect(r).toEqual({ trainingXp: 500, freePoints: 2, freePointsGained: 2 });
  });

  it('seam DLC (speedMultiplierPct=200) deposita o dobro — prova o gancho', () => {
    const base = trainSession({ attributes: attrs(), trainingXp: 0, freePoints: 0 }, 'fisico');
    const fast = trainSession({ attributes: attrs(), trainingXp: 0, freePoints: 0 }, 'fisico', {
      speedMultiplierPct: 200,
    });
    expect(base.trainingXp).toBe(100);
    expect(fast.trainingXp).toBe(200);
  });

  it('seam idade (ageFactorPct=50) deposita a metade', () => {
    const r = trainSession({ attributes: attrs(), trainingXp: 0, freePoints: 0 }, 'fisico', {
      ageFactorPct: 50,
    });
    expect(r.trainingXp).toBe(50);
  });

  it('seams combinados (speed × age) compõem por % inteira', () => {
    // 100 × 300% × 50% = 150 (dois floors sequenciais, valores limpos).
    const combined = trainSession({ attributes: attrs(), trainingXp: 0, freePoints: 0 }, 'fisico', {
      speedMultiplierPct: 300,
      ageFactorPct: 50,
    });
    expect(combined.trainingXp).toBe(150);
  });

  it('a composição TRUNCA (floor), nunca arredonda', () => {
    // 100 → speed 150 = 150 → age 133 = floor(150*133/100) = floor(199,5) = 199 (não 200).
    const r = trainSession({ attributes: attrs(), trainingXp: 0, freePoints: 0 }, 'fisico', {
      speedMultiplierPct: 150,
      ageFactorPct: 133,
    });
    expect(r.trainingXp).toBe(199);
  });

  it('anti-hoarding: pontos livres acumulados encarecem o próximo (cruzam a zona)', () => {
    // atributos somando 236 → parte-de-atributos = 100 (< 104, zona 1).
    const a = attrs(80, 80, 42, 34); // soma 236
    expect(pointsEarnedTotal(a, 0)).toBe(100);
    expect(nextThreshold(pointsEarnedTotal(a, 0))).toBe(TRAINING.zone1Xp); // 300
    // com 5 pontos guardados → p=105 (≥104) → já é zona 2 (mais caro).
    expect(nextThreshold(pointsEarnedTotal(a, 5))).toBe(TRAINING.zone2Xp); // 800
  });
});

describe('applyPoint — gasto do ponto livre', () => {
  it('aplica +1 no foco escolhido; a soma cresce além de 136 (não é trava de criação)', () => {
    const r = applyPoint(attrs(), 'fisico');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fisico).toBe(35);
      expect(sum(r.value)).toBe(137);
    }
  });

  it('rejeita foco já no teto (99)', () => {
    const r = applyPoint(attrs(99, 34, 34, 34), 'fisico');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/máximo/i);
  });

  it('não muta a entrada (retorna um novo objeto)', () => {
    const a = attrs();
    applyPoint(a, 'mental');
    expect(a.mental).toBe(34);
  });
});

function sum(a: Attributes): number {
  const foci: Focus[] = ['fisico', 'tecnico', 'tatico', 'mental'];
  return foci.reduce((s, f) => s + a[f], 0);
}
