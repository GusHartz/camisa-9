// O SEAM de transporte (SPEC-037). É o que torna a escolha `node:http` reversível em UM arquivo:
// o handler NUNCA vê `req`/`res` — recebe um `RouteCtx` já parseado e devolve um `RouteResult`.
// Trocar o servidor por hono/fastify num card futuro toca só `server.ts`, e zero handler (o mesmo
// instinto do `modulate?` injetado da SPEC-029). Nada aqui importa `node:http`.

/** Contexto de UMA requisição, já normalizado pela borda. */
export interface RouteCtx {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  /** Corpo JSON já parseado, **ainda NÃO validado** (a validação é o passo 3 do OP-09). */
  readonly body: unknown;
  /** IP do cliente, já derivado por `clientIp` (o balde do rate limit depende disto estar certo). */
  readonly ip: string;
  /** Relógio INJETADO — nenhum handler chama `Date.now()`, então tudo é testável sem sleep. */
  readonly epochMs: number;
  /** Header `Authorization` cru, quando presente (só o middleware de sessão o interpreta). */
  readonly authorization: string | undefined;
}

/** Resposta de um handler. `body` ausente ⇒ sem corpo (ex.: 204). */
export interface RouteResult {
  readonly status: number;
  readonly body?: unknown;
  /** Headers extras da rota (ex.: `Retry-After`). O `no-store` é default do `respond`. */
  readonly headers?: Readonly<Record<string, string>>;
}

/** O ator resolvido pela sessão. ⚠️ O `athleteId` vem SEMPRE daqui, NUNCA do cliente (OP-09 #2). */
export interface SessionCtx {
  readonly accountId: string;
  /** `null` numa conta mid-regen — o login sucede, mas rota que exige atleta devolve 409. */
  readonly athleteId: string | null;
}

/** Rota pública. */
export type Handler = (ctx: RouteCtx) => Promise<RouteResult>;

/** Rota protegida: o roteador só a invoca DEPOIS de resolver a sessão (OP-09 #1 pelo TIPO —
 *  sem sessão válida o handler é inalcançável, não "checável"). */
export type AuthedHandler = (ctx: RouteCtx, session: SessionCtx) => Promise<RouteResult>;

/** Códigos de erro ESTÁVEIS e não-localizáveis: o cliente roteia e traduz por eles (`sdd.md:47`).
 *  A frase em `error` é fallback genérico e pode mudar; o código, não. */
export type ErrorCode =
  | 'invalid_input'
  | 'invalid_credentials'
  | 'payload_too_large'
  | 'rate_limited'
  | 'unauthorized'
  | 'no_active_athlete'
  | 'not_found'
  | 'no_free_points'
  | 'decision_resolved'
  | 'choice_resolved'
  | 'choice_not_available'
  | 'invalid_option'
  | 'insufficient_balance'
  | 'already_owned'
  | 'regen_ineligible'
  | 'conflict'
  | 'internal';

/** Resultado de parse/validação — molde do `createAthlete`/`validatePassword` da lib pura. */
export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };
