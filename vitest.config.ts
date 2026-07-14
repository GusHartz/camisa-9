import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Config raiz do Vitest (SPEC-001). Rodada por `npm test` (vitest run) na raiz e
// reutilizada pelos packages ao rodar isolados (`npm test -w packages/<x>`).
// `root` fixado no diretório desta config para que o `include` resolva sempre a
// partir da raiz do repo, independentemente do cwd de invocação.
export default defineConfig({
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
  },
});
