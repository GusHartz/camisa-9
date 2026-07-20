// Leitura do corpo JSON com TETO DE BYTES (SPEC-037). O cap corta enquanto lê — nunca bufferiza
// 1 MiB para só então recusar (senão o próprio "413" vira o vetor de memória). O parse é isolado:
// JSON malformado vira `invalid`, não exceção que sobe. Nada aqui valida SEMÂNTICA — validar é o
// passo 3 do OP-09, dentro do handler, via função pura.
//
// ⚠️ Por que listeners e não `for await`: sair de um `for await` chama `return()` no iterador, que
// DESTRÓI o request — e sem socket não há como responder o 413. Aqui a gente só PAUSA a leitura e
// devolve o veredito; quem decide destruir é o `server.ts`, DEPOIS de escrever a resposta.
import type { IncomingMessage } from 'node:http';

export type BodyOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: 'too_large' | 'invalid' };

/** Corpo vazio vira `undefined` (rotas sem body são legítimas — ex.: logout). */
export function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<BodyOutcome> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = (outcome: BodyOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        // ⚠️ Estourou: PARA DE ACUMULAR (a memória fica plana — é isso que importa), mas CONTINUA
        // drenando e descartando até o 'end'. Fechar o socket com o cliente ainda escrevendo faz o
        // write DELE falhar e a resposta 413 nunca ser lida (ECONNRESET). Drenando, ele termina de
        // enviar, lê o 413 e a conexão segue sadia.
        // O teto de tempo é o `server.requestTimeout` (10s), que corta um upload interminável.
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        finish({ ok: false, reason: 'too_large' });
        return;
      }
      if (total === 0) {
        finish({ ok: true, value: undefined });
        return;
      }
      try {
        finish({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        finish({ ok: false, reason: 'invalid' });
      }
    });
    req.on('error', () => finish({ ok: false, reason: 'invalid' }));
    req.on('aborted', () => finish({ ok: false, reason: 'invalid' }));
  });
}

/** Narrowing sem `any` (OP-14) — molde do `isRecord` privado do `player-repo.ts:270`. Replicado
 *  de propósito: aquele não é exportado, e importar tripa interna de outro service seria pior. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
