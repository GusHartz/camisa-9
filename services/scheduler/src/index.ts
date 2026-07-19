// Barrel público do @camisa-9/scheduler (SPEC-030). NÃO reexporta `main` (o entrypoint auto-executa
// — importá-lo dispararia o tick). Só a orquestração testável.
export { runDailyTick, type DailyTickReport } from './daily-tick.js';
