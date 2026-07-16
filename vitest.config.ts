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
    ],
  },
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'services/*/test/**/*.test.ts'],
  },
});
