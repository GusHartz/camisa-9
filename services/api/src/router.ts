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
import { answerDecisionRoute } from './routes/answer-decision.js';
import { answerMatchChoiceRoute } from './routes/answer-match-choice.js';
import { band } from './routes/band.js';
import { health } from './routes/health.js';
import { login } from './routes/login.js';
import { logout } from './routes/logout.js';
import { purchases } from './routes/purchases.js';
import { regen } from './routes/regen.js';
import { trainingSpend } from './routes/training-spend.js';

/** Prefixo pré-auth → [RÓTULO do balde de IP, TETO/min]. O balde de IP é a defesa COARSE pré-auth (um
 *  `Bearer` inválido pagaria um `readSessionByHash` por request sem teto — o furo que a SPEC-038 fechou
 *  no `/v1/band`). Os baldes são SEPARADOS por ROTA: um flood numa rota não consome o budget das outras
 *  (`ip:auth:` ≠ `ip:band:` ≠ `ip:training:` …). ⚠️ Regra (achado da revisão da SPEC-041): o teto de IP
 *  fica ≥ o teto FINO por-conta da rota, senão o IP domina e o por-conta vira ILUSÓRIO — com um `write`
 *  comum a 10, um jogador distribuindo 15 pontos acumulados batia 429 no 11º `spend` (o gancho central),
 *  e um treino pesado starvava compra/regen no mesmo NAT. O treino leva 40 (> os 30 por-conta; burst
 *  legítimo alto = distribuir N pontos); as demais ficam em 10 (responder/comprar/regen nunca passam
 *  disso). O balde é por-IP, não por-conta: num NAT, contas no mesmo IP dividem o teto (o coarse). */
const IP_BUCKETS: ReadonlyArray<readonly [string, string, number]> = [
  [' /v1/auth/', 'auth', 10],
  [' /v1/band', 'band', 10],
  [' /v1/training/', 'training', 40],
  [' /v1/decisions/', 'decisions', 10],
  // 40 como o treino (SPEC-050): o replay SINCRONIZA as respostas pós-15h — um quinteto num NAT são
  // 5 contas × até 5 escolhas na mesma janela de 1 min; 10 daria 429 no gancho do "interagir".
  [' /v1/matches/', 'matches', 40],
  [' /v1/purchases', 'purchases', 10],
  [' /v1/regen', 'regen', 10],
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
function limitByIp(handler: Handler, bucket: string, limit: number): Handler {
  return async (ctx) => {
    const r = hit(`ip:${bucket}:${ctx.ip}`, limit, ctx.epochMs);
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
    'POST /v1/training/spend': requireAthlete(deps.db, trainingSpend(deps.db)),
    'POST /v1/decisions/answer': requireAthlete(deps.db, answerDecisionRoute(deps.db)),
    'POST /v1/matches/choices/answer': requireAthlete(
      deps.db,
      answerMatchChoiceRoute(deps.db, deps.worldDb, deps.worldSeed),
    ),
    'POST /v1/purchases': requireAthlete(deps.db, purchases(deps.db)),
    'POST /v1/regen': requireAthlete(deps.db, regen(deps.worldDb, deps.worldSeed)),
    ...deps.extraRoutes,
  };
  // Todo prefixo pré-auth — inclusive o que ainda não existe — passa pelo balde de IP do seu prefixo.
  for (const key of Object.keys(table)) {
    const handler = table[key];
    if (!handler) continue;
    const bucket = IP_BUCKETS.find(([prefix]) => key.includes(prefix));
    if (bucket) table[key] = limitByIp(handler, bucket[1], bucket[2]);
  }
  return {
    handle: async (ctx) => {
      const route = table[`${ctx.method} ${ctx.path}`];
      if (!route) return fail(404, 'not_found');
      return route(ctx);
    },
  };
}
