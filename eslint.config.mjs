// ESLint flat config (SPEC-001). Codifica OPs e o determinismo (money path) no tooling.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const DETERMINISM_MSG =
  'Determinismo (money path): fonte não-determinística ou dependente de plataforma/ICU proibida em libs de domínio — receba o valor como parâmetro (seed/tempo) e use aritmética inteira.';

// Transcendentais NÃO são garantidas corretamente-arredondadas pelo ECMAScript →
// divergem no último bit entre SOs/versões de V8. `Math.floor`/`imul`/`sqrt` (exatas)
// seguem permitidas; estas, não. Proibidas no money path.
const NON_DETERMINISTIC_MATH = [
  'pow',
  'exp',
  'expm1',
  'log',
  'log2',
  'log10',
  'log1p',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'cbrt',
  'hypot',
];

// `object.property` proibidos além dos cobertos por `no-restricted-syntax`
// (fecha o furo achado no review: Intl.NumberFormat/Collator, localeCompare — ICU;
// performance.now / process.hrtime — relógio; crypto.getRandomValues — entropia;
// Date.parse — parsing dependente de locale/impl).
const RESTRICTED_PROPERTIES = [
  ...NON_DETERMINISTIC_MATH.map((property) => ({
    object: 'Math',
    property,
    message: DETERMINISM_MSG,
  })),
  { object: 'Intl', property: 'NumberFormat', message: DETERMINISM_MSG },
  { object: 'Intl', property: 'Collator', message: DETERMINISM_MSG },
  { object: 'Date', property: 'parse', message: DETERMINISM_MSG },
  { object: 'performance', property: 'now', message: DETERMINISM_MSG },
  { object: 'process', property: 'hrtime', message: DETERMINISM_MSG },
  { object: 'crypto', property: 'getRandomValues', message: DETERMINISM_MSG },
  { property: 'localeCompare', message: DETERMINISM_MSG },
];

export default tseslint.config(
  // Ignores globais.
  { ignores: ['**/dist/**', '**/coverage/**', '**/*.tsbuildinfo', 'client/**'] },

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
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
          message:
            'Determinismo (money path): sem `Intl.DateTimeFormat` em libs de domínio (depende de ICU/tzdata) — use aritmética de epoch com offset fixo.',
        },
      ],
      // Defense-in-depth: transcendentais, Intl/locale (ICU), relógio e entropia.
      'no-restricted-properties': ['error', ...RESTRICTED_PROPERTIES],
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
