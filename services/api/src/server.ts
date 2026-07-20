// O servidor (SPEC-037) — o ÚNICO arquivo que conhece `node:http`, junto do `client-ip`. É aqui que
// o transporte vira `RouteCtx`, e é por isso que trocar `node:http` por outro servidor num card
// futuro toca este arquivo e ZERO handler.
//
// O relógio entra INJETADO (`now`): o `main.ts` passa `Date.now`, a suíte passa um relógio de
// mentira — daí os testes de TTL/rate-limit rodarem sem um único `sleep`.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Db } from '@camisa-9/player-store';
import { readJsonBody } from './http/body.js';
import { clientIp } from './http/client-ip.js';
import { fail, logInternal, send } from './http/respond.js';
import type { Handler, RouteCtx } from './http/types.js';
import { createRoutes } from './router.js';

/** Teto do corpo. 8 KiB é ordens de grandeza acima de um login e ordens abaixo de um problema. */
const MAX_BODY_BYTES = 8 * 1024;
/** A única rota que NÃO leva `Cache-Control: no-store` (opt-out explícito, nunca implícito).
 *  ⚠️ Chaveado por MÉTODO + path, no mesmo formato da tabela do router: só pelo path, um
 *  `POST /healthz` (que não casa rota nenhuma e vira 404) sairia sem `no-store`. */
const CACHEABLE = new Set(['GET /healthz']);

export interface ApiDeps {
  readonly db: Db;
  /** Relógio injetado — a borda passa `Date.now`; o teste passa o dele. */
  readonly now: () => number;
  /** Saltos de proxy confiáveis (`TRUST_PROXY_HOPS`). Default 0 = ignora `X-Forwarded-For`. */
  readonly trustProxyHops?: number;
  /** Rotas extras — a SUÍTE registra aqui o handler protegido que exercita o middleware, sem
   *  poluir o router de produção. */
  readonly extraRoutes?: Readonly<Record<string, Handler>>;
}

export function createApiServer(deps: ApiDeps): Server {
  const routes = createRoutes(deps.db, deps.extraRoutes);
  const hops = deps.trustProxyHops ?? 0;

  const server = createServer((req, res) => {
    void handle(req, res, deps, routes, hops);
  });

  // Um cliente lento não pode segurar um slot para sempre.
  server.requestTimeout = 10_000;
  server.headersTimeout = 8_000;
  // Lixo no socket (TLS num listener plaintext, header monstro) não pode derrubar o processo.
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  return server;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ApiDeps,
  routes: ReturnType<typeof createRoutes>,
  hops: number,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const cacheable = CACHEABLE.has(`${req.method ?? 'GET'} ${url.pathname}`);
  try {
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (!body.ok && body.reason === 'too_large') {
      // Único caso em que o transporte responde SOZINHO: o corpo estourou o teto. O `readJsonBody`
      // já drenou e descartou o excedente (memória plana), então aqui é só responder — sem
      // destruir o socket, que é o que fazia o cliente perder o 413 (ECONNRESET).
      send(res, fail(413, 'payload_too_large'));
      return;
    }
    // ⚠️ JSON malformado NÃO responde aqui — vira `body: undefined` e a requisição segue para o
    // roteador. Responder 400 no transporte PREEMPTARIA a autenticação, violando o OP-09
    // (`sdd.md:77`: auth → autorização → input): um `logout` sem header e com corpo quebrado tem
    // que dar 401, nunca 400. Quem transforma corpo ausente/inválido em 400 é a VALIDAÇÃO do
    // handler — e ela só roda depois que a sessão foi resolvida.
    const ctx: RouteCtx = {
      method: req.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
      body: body.ok ? body.value : undefined,
      ip: clientIp(req, hops),
      epochMs: deps.now(),
      authorization: req.headers.authorization,
    };
    send(res, await routes.handle(ctx), { cacheable });
  } catch (err) {
    // Qualquer throw inesperado vira 500 genérico (OP-11). O detalhe fica SÓ no log, correlacionado
    // pelo requestId — nunca no corpo.
    const requestId = randomUUID();
    logInternal(requestId, err);
    if (!res.headersSent) send(res, fail(500, 'internal'));
    else res.end();
  }
}
