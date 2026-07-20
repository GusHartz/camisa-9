// Roteamento (SPEC-037). A superfície do v1 são POUCOS paths EXATOS — sem params, sem wildcards,
// sem regex — então um `switch` sobre `${method} ${pathname}` é o roteador inteiro. Isso não é
// preguiça: é o que dispensa uma dependência de framework e mantém a troca de transporte confinada
// ao `server.ts` (o seam `RouteCtx`).
//
// ⚠️ Nenhuma rota lê identificador de ator de path/query/body — o `athleteId` só vem da sessão
// (OP-09 #2, `sdd.md:84`). É por isso que não existe `/v1/athletes/:id` aqui, e não deve existir.
import type { Db } from '@camisa-9/player-store';
import { hit } from './http/rate-limit.js';
import { fail, rateLimited } from './http/respond.js';
import type { Handler, RouteCtx, RouteResult } from './http/types.js';
import { health } from './routes/health.js';
import { login } from './routes/login.js';
import { logout } from './routes/logout.js';

/** Teto por IP em TODO `/v1/auth/*` (`sdd.md:100`). */
const AUTH_IP_LIMIT = 10;

export interface Routes {
  readonly handle: (ctx: RouteCtx) => Promise<RouteResult>;
}

/**
 * Aplica o balde de IP a uma rota de auth.
 *
 * ⚠️ Isto vive AQUI, no despacho por prefixo, e não dentro de cada handler — de propósito. Quando o
 * limite era responsabilidade do handler, o `logout` nasceu **sem teto nenhum**: uma rota que
 * aceita `Authorization: Bearer x` de um anônimo e emite um `DELETE` no banco a cada request,
 * consumindo do pool de 10 conexões. Amarrado ao prefixo, qualquer rota `/v1/auth/*` FUTURA já
 * nasce limitada — e os cards 3 e 4 vão acrescentar rotas sobre esta mesma superfície.
 */
function limitByIp(handler: Handler): Handler {
  return async (ctx) => {
    const r = hit(`auth:ip:${ctx.ip}`, AUTH_IP_LIMIT, ctx.epochMs);
    return r.allowed ? handler(ctx) : rateLimited(r.retryAfterSec);
  };
}

/** Monta a tabela de rotas sobre um handle de banco. `extra` permite a SUÍTE registrar rotas de
 *  teste (ex.: um `AuthedHandler` para exercitar o middleware) sem poluir o router de produção. */
export function createRoutes(db: Db, extra?: Readonly<Record<string, Handler>>): Routes {
  const table: Record<string, Handler> = {
    'GET /healthz': health,
    'POST /v1/auth/login': login(db),
    'POST /v1/auth/logout': logout(db),
    ...extra,
  };
  // Todo `/v1/auth/*` — inclusive o que ainda não existe — passa pelo balde de IP.
  for (const key of Object.keys(table)) {
    const handler = table[key];
    if (handler && key.includes(' /v1/auth/')) table[key] = limitByIp(handler);
  }
  return {
    handle: async (ctx) => {
      const route = table[`${ctx.method} ${ctx.path}`];
      if (!route) return fail(404, 'not_found');
      return route(ctx);
    },
  };
}
