// Roteamento (SPEC-037/038). A superfície do v1 são POUCOS paths EXATOS — sem params, sem
// wildcards, sem regex — então uma tabela `${method} ${pathname}` é o roteador inteiro. Isso não é
// preguiça: é o que dispensa uma dependência de framework e mantém a troca de transporte confinada
// ao `server.ts` (o seam `RouteCtx`).
//
// ⚠️ Nenhuma rota lê identificador de ator de path/query/body — o `athleteId` só vem da sessão
// (OP-09 #2, `sdd.md:84`). É por isso que não existe `/v1/athletes/:id` aqui, e não deve existir.
import type { Db } from '@camisa-9/player-store';
import type { Db as WorldDb } from '@camisa-9/world-store';
import { requireAthlete } from './auth/require.js';
import { hit } from './http/rate-limit.js';
import { fail, rateLimited } from './http/respond.js';
import type { Handler, RouteCtx, RouteResult } from './http/types.js';
import { band } from './routes/band.js';
import { health } from './routes/health.js';
import { login } from './routes/login.js';
import { logout } from './routes/logout.js';

/** Teto por IP, PRÉ-AUTH — em todo `/v1/auth/*` E no `/v1/band` (`sdd.md:100`; decisão do founder na
 *  SPEC-038: sem isto, o `/v1/band` pagaria um `readSessionByHash` por token-lixo antes de balde algum). */
const IP_LIMIT = 10;

/** Prefixo pré-auth → RÓTULO do balde de IP. Os baldes são SEPARADOS por prefixo: um flood de login
 *  (`ip:auth:`) não consome o budget da faixa (`ip:band:`), e vice-versa — mesmo teto (10) nos dois.
 *  ⚠️ O balde de IP é por-IP, não por-conta: num NAT, contas no mesmo IP dividem os 10/min (é o teto
 *  coarse pré-auth). O controle fino por-conta é o balde `accountId` (30/min) DENTRO do handler. */
const IP_BUCKETS: ReadonlyArray<readonly [string, string]> = [
  [' /v1/auth/', 'auth'],
  [' /v1/band', 'band'],
];

export interface Routes {
  readonly handle: (ctx: RouteCtx) => Promise<RouteResult>;
}

/** As dependências que a tabela de rotas precisa: os DOIS handles (player + world) e a seed do
 *  mundo (de `ApiDeps`, env `WORLD_SEED` — NUNCA do request). `extra` deixa a SUÍTE registrar rotas. */
export interface RouteDeps {
  readonly db: Db;
  readonly worldDb: WorldDb;
  readonly worldSeed: string;
  readonly extraRoutes?: Readonly<Record<string, Handler>>;
}

/**
 * Aplica o balde de IP (pré-auth) a uma rota.
 *
 * ⚠️ Isto vive AQUI, no despacho por prefixo, e não dentro de cada handler — de propósito. Quando o
 * limite era responsabilidade do handler, o `logout` nasceu **sem teto nenhum**. Amarrado ao
 * prefixo, o teto morde ANTES de resolver a sessão: um flood de `Authorization: Bearer <lixo>` no
 * `/v1/band` é barrado sem pagar um `readSessionByHash` (o furo que a SPEC-038 fechou por decisão).
 */
function limitByIp(handler: Handler, bucket: string): Handler {
  return async (ctx) => {
    const r = hit(`ip:${bucket}:${ctx.ip}`, IP_LIMIT, ctx.epochMs);
    return r.allowed ? handler(ctx) : rateLimited(r.retryAfterSec);
  };
}

/** Monta a tabela de rotas sobre os handles. `extra` permite a SUÍTE registrar rotas de teste (ex.:
 *  um `AuthedHandler` para exercitar o middleware) sem poluir o router de produção. */
export function createRoutes(deps: RouteDeps): Routes {
  const table: Record<string, Handler> = {
    'GET /healthz': health,
    'POST /v1/auth/login': login(deps.db),
    'POST /v1/auth/logout': logout(deps.db),
    'GET /v1/band': requireAthlete(
      deps.db,
      band({ db: deps.db, worldDb: deps.worldDb, worldSeed: deps.worldSeed }),
    ),
    ...deps.extraRoutes,
  };
  // Todo prefixo pré-auth — inclusive o que ainda não existe — passa pelo balde de IP do seu prefixo.
  for (const key of Object.keys(table)) {
    const handler = table[key];
    if (!handler) continue;
    const bucket = IP_BUCKETS.find(([prefix]) => key.includes(prefix));
    if (bucket) table[key] = limitByIp(handler, bucket[1]);
  }
  return {
    handle: async (ctx) => {
      const route = table[`${ctx.method} ${ctx.path}`];
      if (!route) return fail(404, 'not_found');
      return route(ctx);
    },
  };
}
