# SPEC-001 — Criar a estrutura inicial do projeto

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.
> Rascunho revisado por verificação adversarial em 6 lentes (docs de origem, CI-lint, OPs, testabilidade, completude).

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-001 |
| **Feature** | Criar a estrutura inicial do projeto |
| **Slug** | criar-a-estrutura-inicial-do-projeto |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Fase 0 · 0.1 — Bootstrap de repositório + CI |
| **Appetite** | 2 dias |
| **Prioridade** | MEDIUM (roadmap: **P0** — bloqueador de tese; nada existe sem a fundação técnica) |
| **Criada em** | 2026-07-14 |
| **Aprovada em** | 2026-07-14 |
| **Aprovada por** | Gustavo Hartz (founder/architect) |
| **Status** | Em desenvolvimento |

---

## Objetivo

Transformar o repositório de fundação (hoje só docs + templates) num **monorepo TypeScript funcional** com os quatro gates de qualidade rodando de ponta a ponta: `lint`, `typecheck`, `test` e `build`. Ao final, um `git clone` limpo instala com um comando e passa nos quatro gates, e o CI já existente (`.github/workflows/ci.yml`) sai do modo "fundação sem app" e passa a exercitar o app Node real em todo PR.

---

## Contexto e motivação

O `ci.yml` da fundação é resiliente: detecta `package.json` e roda `npm run lint/typecheck/test/build --if-present`; sem `package.json`, apenas imprime "Repositório de fundação — CI verde". Enquanto não existir app Node, **nenhum gate de qualidade real roda**.

Esta é a **primeira SPEC** e o item **0.1 do roadmap** ("Bootstrap de repositório + CI"). É pré-requisito absoluto (P0) de todo o resto: a tese do produto é "o mundo vive sem humanos", e isso só se prova com um motor determinístico e auditável (rigor money path). Determinismo, testabilidade e replay exigem uma base de build/test confiável **antes** de qualquer linha do motor (Fase 1) ou da camada de dados (0.2). Esta SPEC entrega essa base e nada além dela.

Além do tooling, esta SPEC é o ponto onde **duas convenções estruturais são cravadas para sempre** e, por isso, devem ser decididas agora (não numa SPEC futura):

- **Separação de camadas (padrão H1VE / provisão nomeada na vision-scope para a SPEC-001):** TODA regra de negócio/progressão vive em **libs de domínio puras** (sem I/O, sem UI); a **orquestração** (rotas/workers) apenas coordena transações e jobs; o **cliente apenas renderiza estado** — zero regra de negócio (OP-17), zero anti-fraude. Isso é o que viabiliza o port Mac (F3) como *re-skin*, não como port.
- **Layout de pastas do monorepo:** as libs puras vivem em `packages/*`. As referências dos docs de planejamento a `lib/world-engine` (usado como **exemplo** no CLAUDE.md §"separação" e no SDD §1) mapeiam, neste monorepo, para **`packages/world-engine`**. Decisão registrada aqui para não travar um layout incompatível com os docs de origem.

---

## Escopo — o que está DENTRO

- [ ] **Monorepo com npm workspaces** — `package.json` raiz com `workspaces: ["packages/*"]`. Escolha do npm (não pnpm/turborepo) por casar com o `npm ci` do CI e ser a menor superfície para founder solo. **Todas** as libs (hoje o placeholder; amanhã `packages/world-engine` etc.) vivem sob `packages/*`.
- [ ] **TypeScript strict** — `tsconfig.base.json` compartilhado (`strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`) + `tsconfig.json` raiz como *solution* com `references` para os packages (`composite: true` nos packages).
- [ ] **Gates como scripts npm na raiz** (para o CI pegá-los via `--if-present`), com comandos explícitos:
  - `build` = `tsc -b` (build mode — obrigatório com `references`/`composite`; um `tsc` simples NÃO compila os projetos referenciados).
  - `typecheck` = `tsc -b --noEmit` (checa toda a solution sem gerar artefato).
  - `lint` = `eslint .` **+** `prettier --check .` (o Prettier ganha um home executável; drift de formatação reprova o gate).
  - `test` = `vitest run` (modo run, não watch — para o CI).
- [ ] **ESLint (flat config) + typescript-eslint + Prettier** codificando OPs e o determinismo no tooling:
  - `@typescript-eslint/no-explicit-any: error` → **OP-14** (sem `any`).
  - `max-lines-per-function: { max: 50 }` → **OP-15** e `max-lines: { max: 300 }` → **OP-16**, aplicadas a **código de produção**; ver override de testes nas Notas.
  - **Guardrail de determinismo** (money path): `no-restricted-globals` / `no-restricted-syntax` barrando `Math.random`, `Date.now` e `new Date()` em `packages/*/src` (exceto `*.test.ts`). Determinismo é a tese central — encodar barato agora, sem antecipar o motor/RNG (Fase 1).
  - `eslint-config-prettier` para desligar regras que conflitam com o Prettier.
- [ ] **Vitest** como runner (TS-native), `*.test.ts` colocado ao lado do código; config raiz reutilizável pelos packages.
- [ ] **Package-placeholder descartável** `packages/example` — lib pura sem I/O, com **uma** função determinística trivial + um teste que passa, provando `lint → typecheck → test → build` cruzando workspace. Nome inequivocamente descartável: **não** ocupa `core`/`world-engine`, que ficam reservados para a lib de regra real.
- [ ] **Config de repo:** `.gitignore` (`node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*`), `.nvmrc` (Node 20, casando com `setup-node@20` do CI), `.npmrc` (`engine-strict=true`, para `engines.node` ser aplicado de fato), `.editorconfig`, `.prettierrc.json`, `.prettierignore`. `package.json` raiz com `engines.node` e `packageManager` (pin do npm via Corepack) para reprodutibilidade real.
- [ ] **`README.md` raiz** — getting started (install/build/test/lint) + as convenções duráveis: (a) **camadas** (libs puras = toda a lógica · orquestração fina · cliente só renderiza); (b) **i18n** (mensagens externalizadas `messages/{pt,en}.json`, nenhum texto de UI hardcoded, e **libs puras não carregam strings localizáveis nem dependência PT-only** — conteúdo localizável separado desde o dia 1, PT nativo, EN na F3).
- [ ] **Verificação end-to-end** do pipeline localmente e no CI (ver Critérios de aceitação).

---

## Escopo — o que está FORA

- **Camada de dados / schema / migrations** — é a SPEC 0.2. Nenhuma tabela, nenhum Postgres/Neon aqui.
- **Motor do mundo / RNG determinístico / simulação** — Fase 1. O `packages/example` é placeholder, não o motor; o guardrail de determinismo do lint é só uma âncora forward-looking.
- **Baseline de segurança (auth/autz/validação)** — é a SPEC 0.4. Aqui só entram as higienes OP-02/OP-12 (segredos fora do git).
- **Cliente Windows e medição de CPU <1%** — spike separado do F0; sem código de cliente nesta SPEC.
- **Provisionamento de Neon / `nf connect` / `.env.local`** — infra de credenciais fica para quando houver serviço que a exija.
- **Arquivos de i18n (`messages/*.json`) reais** — sem UI ainda; só a **convenção** é documentada. Strings entram com a primeira SPEC que tiver UI.
- **Camada de orquestração (rotas/workers) real** — a convenção de camadas é documentada, mas nenhum código de orquestração é escrito nesta SPEC.
- **Alterar o `ci.yml`** — o workflow atual já é suficiente; esta SPEC apenas o ativa ao adicionar `package.json`. Mudança no CI, se necessária, vira SPEC própria.
- **Turborepo / cache de build / paralelização** — otimização prematura para um workspace só; revisitar quando a escala pedir.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `package.json` | criar | Raiz: `workspaces: ["packages/*"]`, scripts `lint`/`typecheck`/`test`/`build`/`format:check`, devDeps (typescript, eslint, typescript-eslint, eslint-config-prettier, globals, prettier, vitest), `engines.node >=20`, `packageManager: "npm@<x.y.z>"`. |
| `package-lock.json` | criar | Lockfile gerado por `npm install` (versões fixadas para o `npm ci` do CI). |
| `.npmrc` | criar | `engine-strict=true` (faz `engines.node` ser aplicado, não só documental). |
| `tsconfig.base.json` | criar | Config TS base compartilhada, `strict` + flags de rigor. |
| `tsconfig.json` | criar | Solution raiz com `references` para os packages. |
| `tsconfig.typecheck.json` | criar | Gate de type-check que **inclui os testes** (o build composite os exclui p/ não emitir em `dist`). Fecha o furo: erro de tipo em teste reprova `typecheck`. (Adicionado na implementação após review adversarial.) |
| `eslint.config.mjs` | criar | Flat config: typescript-eslint + OP-14/15/16 + guardrail de determinismo + `eslint-config-prettier` + override de testes. |
| `.prettierrc.json` | criar | Config de formatação. |
| `.prettierignore` | criar | Ignora `dist/`, `coverage/`, lockfile. |
| `.editorconfig` | criar | Convenções de editor (charset, indent, EOL). |
| `.nvmrc` | criar | `20`. |
| `.gitignore` | criar | `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*`. |
| `vitest.config.ts` | criar | Config raiz do Vitest (ambiente node), reutilizável pelos packages. |
| `packages/example/package.json` | criar | Package placeholder puro e descartável; scripts locais (`build`/`test`) que rodam isolados. |
| `packages/example/tsconfig.json` | criar | Estende o base; `outDir: dist`, `composite: true`. |
| `packages/example/src/index.ts` | criar | Uma função pura determinística trivial + tipos. |
| `packages/example/src/index.test.ts` | criar | Teste Vitest que passa (cobre a função pura). |
| `README.md` | criar | Getting started + convenções de camadas e i18n. |
| `specs/DONE-001-criar-a-estrutura-inicial-do-projeto.md` | criar | Documento DONE (seções obrigatórias do template DONE) ao final da sessão, antes do PR. |
| `CLAUDE.md` | modificar | Adicionar/atualizar a seção **"Estado atual"** ao final da sessão (ritual). |
| `docs/projeto/roadmap.md` | modificar | Marcar 0.1 como concluído ao final da sessão. |

> A IA só toca arquivos desta lista. Qualquer arquivo fora dela exige aprovação prévia. Abrir o PR + enviar a AI declaration (`nf done`) são ações de **processo**, não arquivos versionados.

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema nesta feature. (Camada de dados é a SPEC 0.2.)

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API nesta feature.

---

## Critérios de aceitação

**Cenário 1 — Clone limpo passa nos quatro gates**
- Dado um `git clone` limpo do repositório nesta branch
- Quando eu rodo `npm ci` e depois `npm run lint && npm run typecheck && npm test && npm run build`
- Então todos os comandos terminam com código de saída 0 e `packages/example/dist/index.js` é gerado por `tsc -b`.

**Cenário 2 — CI ativa o caminho Node e fica verde**
- Dado o `package.json` raiz presente
- Quando um PR é aberto
- Então o step "Detectar app Node" resolve `node=true`, o step "Verificações" roda lint/typecheck/test/build sem erro, e o `check_suite` sai verde (permitindo o H1VE mover `pr → ci → qa_data`).

**Cenário 3 — As OPs e o determinismo estão codificados no lint (erro)**
- Dado, num arquivo de **produção** (`packages/example/src/*.ts`, não-teste), (a) um `any` explícito, (b) uma função com > 50 linhas, (c) um arquivo com > 300 linhas, ou (d) uma chamada a `Math.random()`/`Date.now()`/`new Date()`
- Quando eu rodo `npm run lint`
- Então o lint **falha** apontando a regra correspondente (OP-14 / OP-15 / OP-16 / guardrail de determinismo).

**Cenário 4 — Workspace resolve e builda isolado**
- Dado o monorepo instalado
- Quando eu rodo `npm run build -w packages/example` e `npm test -w packages/example`
- Então ambos terminam com código 0, `packages/example/dist/index.js` é (re)gerado e a suíte do pacote passa isoladamente (o Vitest resolve a config raiz).

**Cenário 5 — Formatação é um gate real**
- Dado um arquivo mal-formatado (ex.: indentação fora do `.prettierrc.json`)
- Quando eu rodo `npm run lint`
- Então o `prettier --check` falha, reprovando o gate.

**Cenário 6 — Nenhum segredo versionado (edge/erro)**
- Dado o `.gitignore` da fundação
- Quando eu inspeciono o diff e o índice do git
- Então nenhum `.env*`/token/chave está rastreado (OP-02, OP-12).

---

## Segurança (se aplicável)

Sem superfície de autenticação/autorização nesta feature — a baseline de segurança é a SPEC 0.4. As únicas considerações aqui são de **higiene de segredos**: `.gitignore` cobre `.env` e `.env.*` (**OP-02**) e nenhum segredo é hardcoded no tooling (**OP-12**). Respostas de erro/stack não se aplicam (sem rotas).

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Over-scaffolding — antecipar o motor/dados | Média | Placeholder é `packages/example` (descartável, fora do domínio); seção "FORA" barra 0.2/Fase 1; guardrails do lint são config, não domínio. |
| `tsc -b` / `references` mal configurados (build não gera `dist/`) | Média | Cenário 1 e 4 exigem `dist/index.js` gerado; `composite: true` nos packages; build mode explícito. |
| ESLint flat + typescript-eslint drift de versão | Média | Fixar versões no `package-lock.json`; `npm ci` usa o lock exato. |
| Regras de tamanho (OP-15/16) reprovando testes por falso-positivo | Média | Override explícito para `**/*.test.ts` (ver Notas); OPs de tamanho valem para produção. |
| Reprodutibilidade fraca (`engines` só documental; `.nvmrc` só major) | Baixa | `.npmrc engine-strict=true` + `packageManager` (Corepack) pinam node/npm; `npm ci` determinístico. |
| Convenção de pastas incompatível com docs de origem | Baixa | Mapeamento `lib/world-engine → packages/world-engine` registrado no Contexto e nas Notas. |

**Dependências:**
- Nenhuma feature anterior (é a SPEC-001). Depende apenas do `ci.yml` da fundação (já presente) e do Node 20.

---

## Notas de implementação

- **Decisões de stack/layout do F0 (⚠️ pendentes de ratificação do founder, conforme SDD §1) — aprovar esta SPEC = ratificá-las:**
  1. **npm workspaces** (não pnpm/turborepo), **Vitest** (não Jest), **ESLint flat config**.
  2. **Layout:** todas as libs sob `packages/*`; `lib/world-engine` dos docs ⇒ `packages/world-engine`.
  3. **Override de tamanho em testes:** `max-lines`/`max-lines-per-function` **desligadas** em `**/*.test.ts` e `**/*.spec.ts` (callbacks de `describe/it` e suítes multi-caso estouram os limites de forma legítima). As OPs de tamanho valem para **código de produção** — interpretação registrada aqui em vez de divergir silenciosamente no `eslint.config.mjs`.
  4. **Prettier** integrado ao gate `lint` (`prettier --check`), não decorativo.
  5. **Determinismo** encodado via `no-restricted-globals`/`no-restricted-syntax` em `packages/*/src` (exceto testes).
- **TS strict** de verdade; sem `any` (OP-14) — usar `unknown` + narrowing.
- **i18n (D7 / roadmap / functional-spec):** convenção documentada no README; **libs puras não carregam strings localizáveis nem dependência PT-only**; arquivos `messages/*.json` reais entram com a primeira SPEC de UI — nada de scaffolding vazio agora.
- **Ritual de fim de sessão:** criar `specs/DONE-001-...md` (seções obrigatórias do template DONE), atualizar "Estado atual" no `CLAUDE.md`, marcar 0.1 no `roadmap.md`, abrir PR com a AI declaration (`nf done`).
- **CI SPEC-lint (SPEC-166):** manter intactas as seções obrigatórias deste arquivo — o gate de formato procura exatamente estes cabeçalhos (verificado: todos presentes).
- **OP-01 (migration p/ todo schema)** não se aplica aqui (sem schema), mas fica registrado como âncora para as próximas SPECs.

---

## Checklist de aprovação

> A ser preenchido pelo arquiteto/founder antes de aprovar.

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos (inclui DONE-001)
- [ ] Mudanças de schema estão documentadas (N/A justificado)
- [ ] Critérios de aceitação são testáveis (comandos verbatim, desfechos observáveis)
- [ ] Riscos e superfície de segurança foram avaliados
- [ ] Appetite (2 dias) é razoável para o escopo
- [ ] Não há conflito com SPECs abertas em paralelo (é a primeira)
- [ ] **Decisões do F0 ratificadas:** npm workspaces · Vitest · ESLint flat · layout `packages/*` (`lib/world-engine → packages/world-engine`) · override de tamanho em testes · determinismo no lint

---

*SPEC-001 — método H1VE. Rascunho para aprovação do founder. Ver `specs/README.md` para o fluxo SPEC→DONE.*
