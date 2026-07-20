// A fase do dia do atleta (SPEC-038) — a cena que a faixa desenha (CT / casa / véspera).
//
// ⚠️ É função SÓ DA HORA (um parâmetro). A regra ratificada (SPEC-037, Decisão 6) são três faixas
// horárias contíguas, sem buraco. `roundSettled` NÃO entra aqui — um parâmetro que não muda o
// retorno é código morto; quem distingue o pico do dia (o jogo das 15h, que cai DENTRO de `casa`)
// é o payload (`roundSettled` + `todayMatch`), nunca um 4º valor de enum.
//
// PURA, sob o guardrail de determinismo: recebe a `hour` já resolvida (a borda chama `resolveSlot`
// e passa `slot.hour`) — assim `packages/player` não importa `world-engine` e não lê relógio.
export type DayPhase = 'ct' | 'vespera' | 'casa';

export function dayPhase(hour: number): DayPhase {
  if (hour < 12) return 'ct'; // manhã: jornal, foco do treino, pontos de ontem
  if (hour < 21) return 'casa'; // 12h escalação · 13-15h pré-jogo · 15h JOGO · 18h decisões
  return 'vespera'; // noite: amanhã tem jogo — sob cadência diária, SEMPRE tem
}
