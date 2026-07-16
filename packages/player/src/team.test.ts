// Identidade e elenco do time (SPEC-018) — testes PUROS: nome/camisa/código, vagas por posição,
// marcos 11/16, e o cross-check da forma do elenco com o world-engine (pega drift). Sem banco.
import { describe, expect, it } from 'vitest';
import { WORLD } from '@camisa-9/world-engine';
import { TEAM } from './constants.js';
import {
  canClaim,
  createTeam,
  humanCount,
  isPosition,
  milestone,
  slotsRemaining,
  validateCodeFormat,
  validateKit,
  validateTeamName,
} from './team.js';
import type { ClaimedByPosition } from './types.js';

function claimed(GK = 0, DEF = 0, MID = 0, FWD = 0): ClaimedByPosition {
  return { GK, DEF, MID, FWD };
}

describe('validateTeamName', () => {
  it('aceita nome válido (normaliza espaços)', () => {
    const r = validateTeamName('  Os   Cracks  ');
    expect(r.ok && r.value).toBe('Os Cracks');
  });
  it('rejeita curto, longo, charset e blocklist', () => {
    expect(validateTeamName('A').ok).toBe(false);
    expect(validateTeamName('X'.repeat(TEAM.name.maxLen + 1)).ok).toBe(false);
    expect(validateTeamName('Time#1').ok).toBe(false);
    expect(validateTeamName('NextGoat').ok).toBe(false); // reservado (blocklist)
  });
});

describe('validateKit', () => {
  it('aceita índices na faixa', () => {
    expect(validateKit({ primaryColor: 0, secondaryColor: 11, crest: 15 }).ok).toBe(true);
  });
  it('rejeita fora da faixa / não-inteiro', () => {
    expect(
      validateKit({ primaryColor: TEAM.kit.primaryColor, secondaryColor: 0, crest: 0 }).ok,
    ).toBe(false);
    expect(validateKit({ primaryColor: -1, secondaryColor: 0, crest: 0 }).ok).toBe(false);
    expect(validateKit({ primaryColor: 1.5, secondaryColor: 0, crest: 0 }).ok).toBe(false);
  });
});

describe('validateCodeFormat', () => {
  it('normaliza p/ caixa alta e aceita a forma correta', () => {
    const r = validateCodeFormat('hjkm23');
    expect(r.ok && r.value).toBe('HJKM23');
  });
  it('rejeita comprimento errado e caracteres ambíguos (0/1/I/L/O)', () => {
    expect(validateCodeFormat('HJKM2').ok).toBe(false); // curto
    expect(validateCodeFormat('HJKM20').ok).toBe(false); // 0 fora do alfabeto
    expect(validateCodeFormat('HJKM2I').ok).toBe(false); // I fora do alfabeto
  });
});

describe('vagas por posição e marcos', () => {
  it('slotsRemaining = squad − ocupadas', () => {
    expect(slotsRemaining(claimed())).toEqual({ GK: 2, DEF: 5, MID: 5, FWD: 4 });
    expect(slotsRemaining(claimed(2, 1, 0, 0))).toEqual({ GK: 0, DEF: 4, MID: 5, FWD: 4 });
  });
  it('canClaim respeita o cap por posição (GK e DEF)', () => {
    expect(canClaim(claimed(2, 0, 0, 0), 'GK')).toBe(false); // 2 GK = cheio
    expect(canClaim(claimed(2, 0, 0, 0), 'DEF')).toBe(true);
    expect(canClaim(claimed(0, 5, 0, 0), 'DEF')).toBe(false); // 5 DEF = cheio (6º barrado)
  });
  it('humanCount soma as posições e milestone marca as faixas 11/16', () => {
    expect(humanCount(claimed(2, 5, 5, 4))).toBe(16);
    expect(milestone(10)).toBeNull();
    expect(milestone(11)).toBe('primeiro_onze');
    expect(milestone(15)).toBe('primeiro_onze'); // meio da faixa
    expect(milestone(16)).toBe('elenco_completo');
    expect(milestone(17)).toBe('elenco_completo'); // acima do teto ainda é completo
  });
});

describe('isPosition (guarda o override vindo da borda)', () => {
  it('aceita as 4 posições e rejeita fora do enum', () => {
    for (const p of ['GK', 'DEF', 'MID', 'FWD']) expect(isPosition(p)).toBe(true);
    expect(isPosition('ATA')).toBe(false);
    expect(isPosition('gk')).toBe(false); // caixa importa
    expect(isPosition('')).toBe(false);
  });
});

describe('cross-check da forma do elenco', () => {
  it('TEAM.squad é idêntico ao WORLD.squadShape do engine (soma 16)', () => {
    expect(TEAM.squad).toEqual(WORLD.squadShape);
    expect(humanCount(claimed(2, 5, 5, 4))).toBe(TEAM.fullSquad);
  });
});

describe('createTeam', () => {
  it('compõe a identidade validada (nome + camisa + posição do capitão)', () => {
    const r = createTeam({
      name: 'Os Cracks',
      kit: { primaryColor: 1, secondaryColor: 2, crest: 3 },
      captainPosition: 'FWD',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Os Cracks');
      expect(r.value.captainPosition).toBe('FWD');
    }
  });
  it('propaga a falha de nome/camisa', () => {
    expect(
      createTeam({
        name: 'A',
        kit: { primaryColor: 0, secondaryColor: 0, crest: 0 },
        captainPosition: 'GK',
      }).ok,
    ).toBe(false);
  });
  it('rejeita posição de capitão fora do enum (override da borda)', () => {
    const r = createTeam({
      name: 'Os Cracks',
      kit: { primaryColor: 1, secondaryColor: 2, crest: 3 },
      captainPosition: 'ATACANTE' as unknown as 'FWD',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('posição inválida');
  });
});
