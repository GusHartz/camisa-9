# DONE-001 — Criar a estrutura inicial do projeto

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-001 |
| **SPEC correspondente** | SPEC-001-criar-a-estrutura-inicial-do-projeto.md |
| **Feature** | Criar a estrutura inicial do projeto |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/criar-a-estrutura-inicial-do-projeto` |
| **PR** | {preencher ao abrir o PR} |
| **Desenvolvimento iniciado** | 2026-07-14 |
| **Desenvolvimento concluído** | 2026-07-14 |
| **Dias utilizados vs appetite** | <1 dia vs 2 dias |

---

## Resumo do que foi feito

Bootstrap do repositório num **monorepo TypeScript com npm workspaces** e os quatro gates de qualidade rodando de ponta a ponta: **lint** (ESLint flat + Prettier), **typecheck** (`tsc -b --noEmit` + um config dedicado que também type-checa os testes), **test** (Vitest) e **build** (`tsc -b`). As OPs foram codificadas no lint (OP-14 sem `any`, OP-15/OP-16 tamanho de função/arquivo) junto a um **guardrail de determinismo** (proíbe `Math.random`/`Date.now`/`new Date()` em libs de domínio — o money path). Um pacote-placeholder descartável (`packages/example`, lib pura) prova o pipeline cruzando workspace. Um clone limpo passa nos quatro gates com `npm ci`, e o `ci.yml` da fundação sai do modo "sem app" e passa a exercitar o app Node em todo PR.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `package.json` | Raiz: workspaces, scripts dos 4 gates + `format`/`format:check`, devDeps, `engines.node >=20.19`, `packageManager`. |
| `package-lock.json` | Lockfile (lockfileVersion 3) para `npm ci` determinístico. |
| `.npmrc` | `engine-strict=true` (aplica `engines.node`). |
| `.nvmrc` | Node 20. |
| `.gitignore` | `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `.env*`. |
| `.editorconfig` | Convenções de editor. |
| `.prettierrc.json` | Config Prettier. |
| `.prettierignore` | Ignora `dist/`, `coverage/`, lockfile e markdown (hand-authored). |
| `eslint.config.mjs` | Flat config: OP-14/15/16 + guardrail de determinismo + override de testes + `eslint-config-prettier`. |
| `tsconfig.base.json` | Base TS strict compartilhada. |
| `tsconfig.json` | Solution raiz (`references`). |
| `tsconfig.typecheck.json` | Type-check que **inclui os testes** (build os exclui do `dist`). |
| `vitest.config.ts` | Config raiz do Vitest (`root` fixado p/ rodar de qualquer cwd). |
| `README.md` | Getting started + convenções duráveis (camadas, i18n, determinismo, OPs). |
| `packages/example/package.json` | Placeholder puro e descartável. |
| `packages/example/tsconfig.json` | Config do package (composite, exclui testes do build). |
| `packages/example/src/index.ts` | Função pura `clamp` + `FOUNDATION_VERSION`. |
| `packages/example/src/index.test.ts` | 5 testes Vitest (happy path, saturação, determinismo, erro). |
| `specs/SPEC-001-...md` | A SPEC aprovada desta feature. |
| `specs/DONE-001-...md` | Este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `CLAUDE.md` | Seção "Estado atual" adicionada/atualizada. |
| `docs/projeto/roadmap.md` | Item 0.1 marcado como concluído. |

---

## Mudanças de schema aplicadas

Nenhuma migration neste DONE.

---

## Mudanças de API entregues

Nenhuma mudança de API neste DONE.

---

## Critérios de aceitação — verificação

| Critério | Status | Observação |
|---|---|---|
| Cenário 1 — Clone limpo passa nos 4 gates | ✅ | `npm ci` fresco + lint/typecheck/test/build todos exit 0; `dist/index.js` gerado. |
| Cenário 2 — CI ativa o caminho Node e fica verde | ✅ | `package.json` presente → step "Detectar app Node" = true; gates rodam. Validado localmente sob o mesmo comando do CI. |
| Cenário 3 — OPs + determinismo codificados no lint | ✅ | Verificado empiricamente: `any` (OP-14), função 63 linhas (OP-15), arquivo 320 linhas (OP-16), `Math.random`/`Date.now`/`new Date()` (determinismo) todos reprovam. |
| Cenário 4 — Workspace resolve e builda isolado | ✅ | `npm run build -w packages/example` e `npm test -w packages/example` verdes. |
| Cenário 5 — Formatação é gate real | ✅ | `prettier --check` reprova código mal-formatado (verificado). |
| Cenário 6 — Nenhum segredo versionado | ✅ | `.gitignore` cobre `.env*`; `git ls-files` sem `.env`; `node_modules`/`dist` ignorados. |

---

## Como testar manualmente

```
1. git clone <repo> && cd camisa-9 && git checkout feat/gustavo-hartz/criar-a-estrutura-inicial-do-projeto
2. nvm use            # Node 20.19+
3. npm ci
4. npm run lint && npm run typecheck && npm test && npm run build
5. Resultado esperado: os 4 comandos terminam com exit 0; packages/example/dist/index.js existe.
```

**Dados de teste necessários:** nenhum.

---

## Testes automatizados

| Arquivo de teste | O que testa |
|---|---|
| `packages/example/src/index.test.ts` | `clamp` (dentro do intervalo, saturação, determinismo, RangeError) e `FOUNDATION_VERSION`. |

**Comando para rodar:**
```bash
npm test
```

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| Todos os arquivos de config/código/docs desta entrega | ~100% | Sim — gerado por agente e verificado por execução real dos 4 gates + prova empírica de cada regra do lint. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → Durante a implementação, um review adversarial (3 lentes) apontou que os testes não eram type-checados. Adicionei `tsconfig.typecheck.json` (arquivo não previsto no allowlist original) para fechar o furo — mudança **dentro da intenção** da SPEC (pipeline de gates funcional); o allowlist da SPEC foi atualizado para refletir. Também pinei `@types/node` em `^20` (alinhar tipos ao runtime) e ajustei `engines.node` para `>=20.19` (o toolchain exige). Nenhuma mudança de escopo de produto (sem dados, motor ou auth).

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo do desvio |
|---|---|---|
| Allowlist de arquivos | Adicionado `tsconfig.typecheck.json` | Fechar o furo de type-check dos testes achado no review; dentro da intenção da SPEC. |
| `engines.node >=20` | `>=20.19` | ESLint 10 exige `^20.19`; `>=20` seria falso. `setup-node@20` resolve o 20.x mais novo (satisfaz). |
| `prettier --check .` | Markdown exemptado no `.prettierignore` | Docs de fundação são hand-authored e o SPEC-lint do CI depende do formato exato; Prettier não é dono do markdown. |
| `@types/node` (versão não fixada na SPEC) | Pinado em `^20` | Manter tipos na major do runtime alvo (evita usar APIs inexistentes no Node 20). |

---

## Limitações conhecidas

- **`packageManager` não é aplicado no CI** (Corepack desabilitado no `ci.yml`): a reprodutibilidade do install vem do `npm ci` + lockfileVersion 3, não do campo. Sem impacto funcional.
- **`packages/example` é placeholder** — existe só para provar o pipeline; será removido/substituído pela primeira lib de domínio real (Fase 1).
- **`messages/*.json` (i18n) não criados** — sem UI ainda; só a convenção foi documentada (roadmap: entram com a primeira SPEC de UI).

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| `ci.yml` usa `npm ci \|\| npm install` — o fallback mascara drift de lockfile (CI não-reproduzível se o lock dessincronizar) | Médio | SPEC própria de endurecimento de CI (ci.yml está FORA do escopo da SPEC-001). |
| CI depende de `setup-node@20` resolver ≥ 20.19 | Baixo | Considerar pinar `node-version` exato ou ler `.nvmrc` no ci.yml, na mesma SPEC de CI. |
| Placeholder `packages/example` a remover | Baixo | Quando entrar a primeira lib de domínio. |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados
- [x] Testes criados e passando (5/5)
- [x] Typecheck limpo (inclui testes)
- [x] Lint limpo (ESLint + Prettier)
- [x] Nenhum log de debug em código de produção
- [x] Nenhum tipo `any` introduzido
- [x] Nenhum segredo hardcoded
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` seção "Estado atual" atualizada
- [x] `docs/projeto/roadmap.md` status do item atualizado
- [x] Este DONE está completo e commitado na branch *(commit pendente de confirmação do founder)*

---

*DONE-001 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE.*
