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
      // Stores consumidos pela costura world-entry (SPEC-020): resolve ao SRC (services/* não
      // têm build/dist). A regex `$` evita capturar subpaths.
      {
        find: /^@camisa-9\/world-store$/,
        replacement: fileURLToPath(new URL('./services/world-store/src/index.ts', import.meta.url)),
      },
      {
        find: /^@camisa-9\/player-store$/,
        replacement: fileURLToPath(
          new URL('./services/player-store/src/index.ts', import.meta.url),
        ),
      },
      // Costura + passes consumidos pelo scheduler (SPEC-030): resolve ao SRC.
      {
        find: /^@camisa-9\/world-entry$/,
        replacement: fileURLToPath(new URL('./services/world-entry/src/index.ts', import.meta.url)),
      },
      {
        find: /^@camisa-9\/regen$/,
        replacement: fileURLToPath(new URL('./services/regen/src/index.ts', import.meta.url)),
      },
      {
        find: /^@camisa-9\/transfer$/,
        replacement: fileURLToPath(new URL('./services/transfer/src/index.ts', import.meta.url)),
      },
      // A camada HTTP/sessão (SPEC-037): a suíte sobe o servidor via `createApiServer` + listen(0).
      {
        find: /^@camisa-9\/api$/,
        replacement: fileURLToPath(new URL('./services/api/src/index.ts', import.meta.url)),
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
