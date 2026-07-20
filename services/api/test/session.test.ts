// Testes PUROS da camada HTTP/sessão (SPEC-037) — rodam sempre, sem banco. Cobrem as peças que
// não precisam de servidor de pé: parse do Bearer, hash do token, derivação de IP, validação de
// input, rate limit, e os GREP-GATES estruturais do critério 5.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearerToken, hashToken } from '../src/auth/session.js';
import { clientIp, trustProxyHops } from '../src/http/client-ip.js';
import { hit, reset, size } from '../src/http/rate-limit.js';
import { parseLoginBody } from '../src/routes/login.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const T0 = 1_700_000_000_000;

/** Um `IncomingMessage` de mentira — só o que `clientIp` olha. */
function fakeReq(headers: Record<string, string | string[]>, remote: string): IncomingMessage {
  return { headers, socket: { remoteAddress: remote } } as unknown as IncomingMessage;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('bearerToken — a fronteira entre 401 e 204', () => {
  it('extrai o token de um header bem-formado', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123');
  });

  it('devolve null para ausente ou malformado — é essa distinção que separa 401 de 204', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('abc123')).toBeNull(); // sem o esquema
    expect(bearerToken('Basic abc123')).toBeNull(); // esquema errado
    expect(bearerToken('Bearer')).toBeNull(); // sem valor
    expect(bearerToken('Bearer a b')).toBeNull(); // token com espaço
    expect(bearerToken('bearer abc123')).toBeNull(); // case-sensitive por RFC
  });
});

describe('hashToken', () => {
  it('é determinístico e não devolve o token', () => {
    const h = hashToken('tok');
    expect(h).toBe(hashToken('tok'));
    expect(h).not.toContain('tok');
    expect(h).toHaveLength(64); // sha256 hex
  });
});

describe('clientIp — o balde certo atrás do proxy (critério 3)', () => {
  it('com hops=0 IGNORA o X-Forwarded-For (o default seguro)', () => {
    const req = fakeReq({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, '10.0.0.1');
    expect(clientIp(req, 0)).toBe('10.0.0.1');
  });

  it('com hops=1 toma o valor mais à DIREITA — o que o proxy imediato escreveu', () => {
    const req = fakeReq({ 'x-forwarded-for': 'forjado, 2.2.2.2, 3.3.3.3' }, '10.0.0.1');
    expect(clientIp(req, 1)).toBe('3.3.3.3');
  });

  it('com hops=2 pula um salto — e NUNCA cai no valor forjável da esquerda', () => {
    const req = fakeReq({ 'x-forwarded-for': 'forjado, 2.2.2.2, 3.3.3.3' }, '10.0.0.1');
    expect(clientIp(req, 2)).toBe('2.2.2.2');
  });

  it('o cliente NÃO troca de balde mexendo na esquerda da lista', () => {
    const a = fakeReq({ 'x-forwarded-for': 'AAA, 9.9.9.9' }, '10.0.0.1');
    const b = fakeReq({ 'x-forwarded-for': 'BBB, 9.9.9.9' }, '10.0.0.1');
    expect(clientIp(a, 1)).toBe(clientIp(b, 1));
  });

  it('FAIL-CLOSED: lista mais curta que hops ignora o header e usa o socket', () => {
    // Cair no valor mais à esquerda seria fail-OPEN: entregaria ao atacante exatamente a parte que
    // ele controla, e o balde voltaria a ser trocável a cada request.
    const req = fakeReq({ 'x-forwarded-for': '5.5.5.5' }, '10.0.0.1');
    expect(clientIp(req, 3)).toBe('10.0.0.1');
    expect(clientIp(req, 2)).toBe('10.0.0.1');
    expect(clientIp(req, 1)).toBe('5.5.5.5'); // exatamente 1 salto: aí sim o header vale
  });

  it('sem header cai no socket; header vazio idem', () => {
    expect(clientIp(fakeReq({}, '10.0.0.1'), 1)).toBe('10.0.0.1');
    expect(clientIp(fakeReq({ 'x-forwarded-for': '  ' }, '10.0.0.1'), 1)).toBe('10.0.0.1');
  });

  it('trustProxyHops: default 0, ignora lixo e negativo', () => {
    expect(trustProxyHops({})).toBe(0);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: 'abc' })).toBe(0);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '-2' })).toBe(0);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '1' })).toBe(1);
  });
});

describe('parseLoginBody — o passo 3 do OP-09', () => {
  it('aceita o par bem-formado', () => {
    const r = parseLoginBody({ email: 'a@b.test', password: 'x' });
    expect(r.ok && r.value.email).toBe('a@b.test');
  });

  it('recusa forma inválida sem lançar', () => {
    for (const raw of [
      null,
      undefined,
      'string',
      42,
      {},
      { email: 'a@b.test' },
      { password: 'x' },
      { email: 1, password: 'x' },
      { email: 'a@b.test', password: 2 },
      { email: '', password: 'x' },
      { email: 'a@b.test', password: '' },
      { email: 'a'.repeat(321), password: 'x' },
    ]) {
      expect(parseLoginBody(raw).ok).toBe(false);
    }
  });
});

describe('rate-limit — janela fixa', () => {
  beforeEach(() => reset());

  it('libera até o teto e barra o seguinte', () => {
    for (let i = 0; i < 10; i++) expect(hit('k', 10, T0).allowed).toBe(true);
    const barred = hit('k', 10, T0);
    expect(barred.allowed).toBe(false);
    expect(barred.retryAfterSec).toBeGreaterThan(0);
  });

  it('a janela vira e o balde reabre', () => {
    for (let i = 0; i < 10; i++) hit('k', 10, T0);
    expect(hit('k', 10, T0).allowed).toBe(false);
    expect(hit('k', 10, T0 + 60_000).allowed).toBe(true);
  });

  it('baldes são independentes por chave', () => {
    for (let i = 0; i < 10; i++) hit('a', 10, T0);
    expect(hit('a', 10, T0).allowed).toBe(false);
    expect(hit('b', 10, T0).allowed).toBe(true);
  });

  it('reset() zera — é o que impede uma suíte de envenenar a outra', () => {
    for (let i = 0; i < 10; i++) hit('k', 10, T0);
    reset();
    expect(hit('k', 10, T0).allowed).toBe(true);
  });

  it('o teto é EXATAMENTE o limite — 10 passam, a 11ª barra (o valor importa)', () => {
    for (let i = 1; i <= 10; i++) {
      expect(hit('exato', 10, T0).allowed, `tentativa ${i}`).toBe(true);
    }
    expect(hit('exato', 10, T0).allowed).toBe(false);
  });

  it('a memória NÃO cresce para sempre: chaves vencidas são varridas', () => {
    // Sem varredura o Map guarda toda chave já vista — e metade delas é conteúdo do cliente.
    for (let i = 0; i < 600; i++) hit(`efemera-${i}`, 10, T0);
    expect(size()).toBeGreaterThan(100);
    // Passada a janela, uma nova leva de chamadas dispara a varredura e o Map encolhe.
    for (let i = 0; i < 600; i++) hit(`nova-${i}`, 10, T0 + 61_000);
    expect(size()).toBeLessThanOrEqual(600);
  });
});

// ⚠️ Estes gates existem porque são exatamente o tipo de invariante que alguém quebra sem notar,
// num refactor bem-intencionado, e que nenhum teste de comportamento pegaria.
describe('grep-gates estruturais (critério 5)', () => {
  const files = walk(SRC).filter((f) => f.endsWith('.ts'));

  it('só o transporte conhece node:http — handlers e sessão são transporte-livres', () => {
    // NOTA: a SPEC redigiu "nada fora de src/http/ + src/routes/", mas quem precisa de node:http é
    // o `server.ts`; as ROTAS não importam nada disso. O invariante cravado aqui é o mais forte e
    // é o que realmente sustenta a reversibilidade: nenhum handler, nenhuma regra e nenhuma peça
    // de sessão tocam o transporte.
    const offenders = files
      .filter((f) => /[/\\](routes|auth|band)[/\\]/.test(f))
      .filter((f) => /from '(node:http)'|require\('node:http'\)/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('nenhum lock de SESSÃO no código novo — o pooler quebraria em silêncio (ADR-002:57)', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/pg_advisory_lock\b/);
      expect(src).not.toMatch(/\bLISTEN\b|\bNOTIFY\b/);
      expect(src).not.toMatch(/SET SESSION/);
    }
  });

  it('o barrel NÃO exporta main.ts — senão um import qualquer subiria um servidor real', () => {
    const barrel = readFileSync(join(SRC, 'index.ts'), 'utf8');
    expect(barrel).not.toMatch(/from '\.\/main\.js'/);
  });

  it('nenhuma rota lê identificador de ator de path/query/body (OP-09 #2)', () => {
    const routes = files.filter((f) => /[/\\]routes[/\\]/.test(f));
    expect(routes.length).toBeGreaterThan(0);
    for (const f of routes) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/query\.get\(['"](athleteId|accountId)['"]\)/);
      expect(src).not.toMatch(/body\.(athleteId|accountId)/);
    }
  });
});
