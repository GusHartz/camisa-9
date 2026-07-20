// Derivação NORMATIVA do IP do cliente (SPEC-037). A plataforma (Railway/Render — `runbook:25-26`)
// põe um proxy à frente, e o repo não tinha precedente nenhum disto. Errar aqui quebra o rate limit
// nos DOIS sentidos: confiar no `X-Forwarded-For` cru deixa qualquer um forjar um balde novo por
// request (limite = zero, password-spraying passa); usar o `remoteAddress` cru atrás do proxy joga
// o planeta inteiro num balde só (auto-DoS). Puro e testável — não toca env, recebe `hops`.
import type { IncomingMessage } from 'node:http';

/**
 * O IP a usar como chave de rate limit.
 *
 * Com `hops > 0`, toma o **n-ésimo valor a partir da DIREITA** de `X-Forwarded-For`: o mais à
 * direita foi escrito pelo proxy imediato e o cliente **não controla**; tudo à esquerda pode ser
 * forjado. **Nunca** o primeiro da lista. Com `hops === 0` (o default), ignora o header por
 * completo e usa o socket.
 */
export function clientIp(req: IncomingMessage, hops: number): string {
  const socketIp = req.socket.remoteAddress ?? 'desconhecido';
  if (hops <= 0) return socketIp;
  const raw = req.headers['x-forwarded-for'];
  const list = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // ⚠️ FAIL-CLOSED: se a lista é MAIS CURTA que os saltos configurados, o header não veio da
  // cadeia de proxies que esperamos — é um cliente forjando. Cair no valor mais à esquerda seria
  // fail-open: entregaria ao atacante exatamente a parte que ele controla, e o balde de rate limit
  // voltaria a ser trocável a cada request. Nesse caso ignoramos o header e usamos o socket.
  if (list.length < hops) return socketIp;
  // n-ésimo da direita: hops=1 → o último (o que o proxy imediato escreveu).
  return list[list.length - hops] ?? socketIp;
}

/** Lê `TRUST_PROXY_HOPS` da env. Default **0** = não confiar em header nenhum (o seguro). */
export function trustProxyHops(env: Record<string, string | undefined>): number {
  const n = Number.parseInt(env['TRUST_PROXY_HOPS'] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
