# camisa-9

Jogo de carreira de futebol de **baixa atenção** que roda numa faixa acima da taskbar — mundo persistente, síncrono, cooperativo. Fundação **Nexus Flow / H1VE**.

> Antes de desenvolver, leia `CLAUDE.md` (contexto + método/OPs) e siga o fluxo **SPEC → DONE** de `specs/README.md`. Nenhuma linha de código sem SPEC aprovada.

## Requisitos

- **Node ≥ 20.19** (ver `.nvmrc`; CI usa `setup-node@20`, que resolve o 20.x mais novo). O toolchain moderno (ESLint 10) exige `^20.19`; com `engine-strict` ligado (`.npmrc`), um Node 20 antigo falha rápido com mensagem clara.
- **npm** (workspaces). Sem pnpm/yarn.

## Começando

```bash
npm ci          # instala (usa o package-lock.json exato)
npm run lint    # ESLint + Prettier (--check)
npm run typecheck
npm test        # Vitest (run)
npm run build   # tsc -b (build mode)
```

`npm run format` aplica o Prettier. Um clone limpo deve passar nos quatro gates.

## Estrutura (monorepo)

```
packages/*        libs de domínio puras (sem I/O, sem UI) — TODA a lógica/progressão
  example/        placeholder descartável (SPEC-001) — prova o pipeline; será removido
```

Referências dos docs de planejamento a `lib/world-engine` mapeiam, neste repo, para **`packages/world-engine`** (todas as libs vivem sob `packages/*`).

## Convenções duráveis (âncoras para toda SPEC)

**Separação de camadas (padrão H1VE — OP-17):**

- **Libs de domínio puras** (`packages/*`) — sem I/O, sem UI, determinísticas: contêm **toda** a regra de negócio e progressão.
- **Orquestração** (rotas/workers) — apenas coordena transações, publicação atômica e jobs.
- **Cliente** — apenas **renderiza** estado. Zero regra de negócio, zero anti-fraude. (É o que torna o port Mac na F3 um *re-skin*, não um port.)

**Determinismo (money path):** libs de domínio não usam `Math.random`, `Date.now` nem `new Date()` — tempo e aleatoriedade entram como parâmetro (seed). O lint reprova o uso em `packages/*/src`.

**i18n:** nenhum texto de UI hardcoded; mensagens externalizadas em `messages/{pt,en}.json` (PT nativo, EN na F3). **Libs puras não carregam strings localizáveis nem dependência PT-only** — conteúdo localizável fica separado desde o dia 1. (Arquivos `messages/*.json` entram com a primeira SPEC de UI.)

**OPs no tooling:** `no-explicit-any` (OP-14), `max-lines-per-function: 50` (OP-15) e `max-lines: 300` (OP-16) — aplicadas a código de produção; testes têm override de tamanho.

## Segredos

Nunca versione segredos (OP-02/OP-12). `.env`/`.env.*` estão no `.gitignore`; use `.env.example` para documentar variáveis.
