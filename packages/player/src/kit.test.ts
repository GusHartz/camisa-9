// kitFromClubId (SPEC-038) — PURA e determinística. Veste os companheiros de elenco (NPC não tem
// kit gravado). Os bounds têm de casar com TEAM.kit, senão a Fatia 3 desenha um escudo que não existe.
import { describe, expect, it } from 'vitest';
import { kitFromClubId } from './kit.js';
import { TEAM } from './constants.js';

describe('kitFromClubId', () => {
  it('é determinística — o mesmo clube, sempre o mesmo kit', () => {
    expect(kitFromClubId('divisao-4-c07')).toEqual(kitFromClubId('divisao-4-c07'));
  });

  it('respeita os bounds de TEAM.kit para qualquer id', () => {
    for (let i = 0; i < 500; i++) {
      const k = kitFromClubId(`clube-${i}`);
      expect(k.primaryColor).toBeGreaterThanOrEqual(0);
      expect(k.primaryColor).toBeLessThan(TEAM.kit.primaryColor);
      expect(k.secondaryColor).toBeLessThan(TEAM.kit.secondaryColor);
      expect(k.crest).toBeLessThan(TEAM.kit.crest);
    }
  });

  it('as três dimensões são independentes — não colapsam num valor só', () => {
    // Se primary/secondary/crest saíssem do mesmo hash, seriam correlacionados. Uma amostra
    // grande deve exercitar uma variedade real em cada eixo.
    const primaries = new Set<number>();
    const crests = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const k = kitFromClubId(`c-${i}`);
      primaries.add(k.primaryColor);
      crests.add(k.crest);
    }
    expect(primaries.size).toBeGreaterThan(8); // dos 12 possíveis
    expect(crests.size).toBeGreaterThan(10); // dos 16 possíveis
  });

  it('ids parecidos NÃO colidem — o avalanche descorrelaciona (senão o % de FNV colide demais)', () => {
    // Sem o passo de mistura, `clube-0`..`clube-99` colidiam ~24%. É o defeito que este teste
    // guarda: ids quase idênticos (o que o mundo gera: `divisao-N-cNN`) têm de espalhar.
    const kits = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const k = kitFromClubId(`clube-${i}`);
      kits.add(`${k.primaryColor}-${k.secondaryColor}-${k.crest}`);
    }
    expect(kits.size).toBe(100); // 100 ids consecutivos → 100 kits distintos
  });

  it('os 80 clubes de um mundo real têm colisão baixa', () => {
    // `divisao-N-cNN` é o formato que `seedWorld` gera; a faixa mostra os companheiros lado a lado.
    const kits = new Set<string>();
    for (let d = 1; d <= 4; d++)
      for (let c = 1; c <= 20; c++) {
        const k = kitFromClubId(`divisao-${d}-c${String(c).padStart(2, '0')}`);
        kits.add(`${k.primaryColor}-${k.secondaryColor}-${k.crest}`);
      }
    expect(kits.size).toBeGreaterThanOrEqual(76); // ≤4 colisões nos 80 (2304 combinações possíveis)
  });
});
