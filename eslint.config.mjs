// ESLint flat config (SPEC-001). Codifica OPs e o determinismo (money path) no tooling.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Ignores globais.
  { ignores: ['**/dist/**', '**/coverage/**', '**/*.tsbuildinfo'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Regras de produção — TS.
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // OP-14 — sem `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      // OP-15 — nenhuma função com mais de 50 linhas.
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      // OP-16 — nenhum arquivo com mais de 300 linhas.
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },

  // Guardrail de DETERMINISMO (money path) — libs de domínio puras não podem
  // usar fontes não-determinísticas. Passe tempo/aleatoriedade como parâmetro (seed).
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'Determinismo (money path): sem `new Date()` em libs de domínio — receba o tempo como parâmetro.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Determinismo (money path): sem `Date.now()` em libs de domínio.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'Determinismo (money path): sem `Math.random()` em libs de domínio — use RNG por seed.',
        },
      ],
    },
  },

  // Testes — relaxa as regras de tamanho (callbacks de describe/it e suítes
  // multi-caso estouram os limites de forma legítima). As OPs de tamanho valem p/ produção.
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },

  // Desliga regras que conflitam com o Prettier (formatação é gate à parte).
  prettier,
);
