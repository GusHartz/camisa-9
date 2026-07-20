// Barrel público do @camisa-9/api (SPEC-037). ⚠️ NÃO reexporta `main` — o entrypoint auto-executa
// (`listen()`), e importá-lo aqui faria QUALQUER import do pacote subir um servidor real, inclusive
// em typecheck/test. O molde é o barrel do scheduler, que pela mesma razão não exporta o dele.
export { createApiServer, type ApiDeps } from './server.js';
export { createRoutes, type Routes } from './router.js';
export { requireSession, requireAthlete } from './auth/require.js';
export {
  bearerToken,
  hashToken,
  issueSession,
  resolveSession,
  revokeSession,
  type IssuedSession,
} from './auth/session.js';
export { clientIp, trustProxyHops } from './http/client-ip.js';
export { readJsonBody, isRecord, type BodyOutcome } from './http/body.js';
export { hit, reset, type LimitOutcome } from './http/rate-limit.js';
export { fail, send } from './http/respond.js';
export { parseLoginBody } from './routes/login.js';
export type {
  AuthedHandler,
  ErrorCode,
  Handler,
  Parsed,
  RouteCtx,
  RouteResult,
  SessionCtx,
} from './http/types.js';
