// Liveness (SPEC-037). ⚠️ NÃO TOCA O BANCO — de propósito. Com o autosuspend da Neon (ADR-002), um
// health que consultasse Postgres acordaria o banco a cada probe e, pior, falharia durante o
// cold-start → a plataforma leria "unhealthy" e reiniciaria o container em loop. É liveness ("o
// processo está de pé?"), não readiness ("as dependências respondem?").
// ⚠️ É a ÚNICA rota com opt-out do `Cache-Control: no-store` (o opt-out é explícito no `server.ts`).
import type { Handler } from '../http/types.js';

export const health: Handler = async () => ({ status: 200, body: { ok: true } });
