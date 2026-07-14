// Estado inicial determinístico de 1 liga (SPEC-002): 10 clubes NPC fictícios.
// Nomes/forças 100% fictícios (regra NUNCA nº1 — nada parecido com clube real).

import type { LeagueState } from '../types.js';

export const DEMO_LEAGUE: LeagueState = {
  leagueId: 'liga-varzea-a',
  seasonId: '2026',
  clubs: [
    { id: 'c01', name: 'Grêmio Aurora', strength: 85 },
    { id: 'c02', name: 'Sport Recanto', strength: 80 },
    { id: 'c03', name: 'União Palmeiral', strength: 77 },
    { id: 'c04', name: 'Atlético Ventania', strength: 74 },
    { id: 'c05', name: 'Estrela do Vale', strength: 71 },
    { id: 'c06', name: 'Náutico Corrente', strength: 68 },
    { id: 'c07', name: 'Guarani da Serra', strength: 66 },
    { id: 'c08', name: 'Fênix Operário', strength: 63 },
    { id: 'c09', name: 'Rio Branco EC', strength: 61 },
    { id: 'c10', name: 'Independente Sul', strength: 58 },
  ],
};
