// Rate limit de janela fixa, IN-PROCESS (SPEC-037 · `sdd.md:100`). Genérico por CHAVE — a rota
// decide o que é a chave (IP, e-mail normalizado, e na SPEC-038 o `accountId`) e qual o teto; quando
// duas chaves valem para a mesma rota, o MAIS RESTRITIVO vence.
//
// ⚠️ DÉBITO DECLARADO: in-process não sobrevive a restart nem a múltiplas instâncias. Correto hoje
// (um container — `runbook`). GATILHO DE REVISÃO EXPLÍCITO: ao escalar para >1 instância de API,
// mover para tabela/Redis.
//
// ⚠️ O `Map` é ESTADO DE MÓDULO, e o vitest roda `fileParallelism:false` (as suítes dividem o mesmo
// processo Node) — sem `reset()` um teste de 429 envenena o login de OUTRO arquivo, e o flaky é
// difícil de diagnosticar (o repo já tem histórico disso). Por isso o `reset()` é exportado e
// chamado no `beforeEach` de toda suíte que toca rota limitada.

const WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// ⚠️ Sem varredura, o Map cresce PARA SEMPRE: metade das chaves é conteúdo do cliente (o e-mail do
// login), o processo é um web service que fica vivo indefinidamente, e uma entrada só é substituída
// quando a MESMA chave é rebatida depois da janela virar. Um cliente respeitando o próprio limite
// (10 e-mails novos/min) deixa ~14 mil chaves permanentes por dia. Isto NÃO é o débito declarado na
// SPEC (que fala de restart e de >1 instância) — é ausência de expiração dentro de UMA instância.
// A varredura roda a cada N chamadas e é O(tamanho): o Map fica limitado ao tráfego de um minuto.
const SWEEP_EVERY = 500;
let sinceSweep = 0;

function sweep(nowMs: number): void {
  for (const [key, b] of buckets) if (nowMs >= b.resetAt) buckets.delete(key);
}

export interface LimitOutcome {
  readonly allowed: boolean;
  /** Segundos até a janela virar — vai no corpo (`retryAfter`) E no header `Retry-After`. */
  readonly retryAfterSec: number;
}

/**
 * Consome uma unidade do balde `key`. Devolve `allowed:false` quando o teto já foi atingido.
 * A janela é fixa (não deslizante): simples, previsível e suficiente para o alvo (força bruta e
 * password-spraying), sem o custo de memória de um sliding window.
 */
export function hit(key: string, limit: number, nowMs: number): LimitOutcome {
  if (++sinceSweep >= SWEEP_EVERY) {
    sinceSweep = 0;
    sweep(nowMs);
  }
  const found = buckets.get(key);
  if (!found || nowMs >= found.resetAt) {
    buckets.set(key, { count: 1, resetAt: nowMs + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.max(1, Math.ceil((found.resetAt - nowMs) / 1000));
  if (found.count >= limit) return { allowed: false, retryAfterSec };
  found.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

/** Zera o estado do módulo. ⚠️ Uso de TESTE (ver o aviso do cabeçalho) — nunca em produção. */
export function reset(): void {
  buckets.clear();
  sinceSweep = 0;
}

/** Quantos baldes vivos há na memória. Uso de TESTE — é o que prova que a varredura funciona. */
export function size(): number {
  return buckets.size;
}
