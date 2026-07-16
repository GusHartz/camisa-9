import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Config raiz do Vitest (SPEC-001). Rodada por `npm test` (vitest run) na raiz e
// reutilizada pelos packages ao rodar isolados (`npm test -w packages/<x>`).
// `root` fixado no diretório desta config para que o `include` resolva sempre a
// partir da raiz do repo, independentemente do cwd de invocação.
export default defineConfig({
  // Alias do pacote para o SRC (não o dist): o CI roda `test` ANTES de `build`, então
  // os testes de services/* consomem o world-engine direto da fonte, sem exigir dist.
  resolve: {
    alias: [
      {
        find: /^@camisa-9\/world-engine$/,
        replacement: fileURLToPath(
          new URL('./packages/world-engine/src/index.ts', import.meta.url),
        ),
      },
      {
        find: /^@camisa-9\/player$/,
        replacement: fileURLToPath(new URL('./packages/player/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'services/*/test/**/*.test.ts'],
    // Os testes de services/* são de INTEGRAÇÃO contra UM Postgres compartilhado e
    // truncam tabelas comuns (world, published_round) sem filtro. Rodá-los em paralelo
    // faria um suite apagar as linhas do outro no meio do teste. Serial = determinístico.
    // Custo: ~1s nos testes puros do engine (milissegundos cada). SPEC-015.
    fileParallelism: false,
  },
});
