# SPEC-016 — Conta + criação do atleta (Fase 1): conta por e-mail + atleta com atributos base

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-016 |
| **Feature** | Conta e criação do atleta (card 22 — primeira feature da Fase 1) |
| **Slug** | conta-e-criacao-do-atleta |
| **Card (board)** | `0126c71a-a1c9-4fa8-b5d2-d81864e77b55` |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Fase 1 (o atleta) — entrada de humanos no mundo; keystone das demais features de Fase 1. |
| **Appetite** | **2 a 3 dias**. |
| **Prioridade** | ALTA — sem conta+identidade, nada da Fase 1 (signup, substituição de NPC, beats) tem onde ancorar. |
| **Criada em** | 2026-07-16 |
| **Status** | **APROVADA pelo founder (2026-07-16)** |

---

## Decisões de design co-desenhadas com o founder (2026-07-16) — leia antes de aprovar

Esta SPEC nasce de uma sessão de design com o founder. As decisões travadas:

1. **Superfície = lib pura + store (SEM HTTP ainda).** A regra de criação é lógica pura e determinística → `packages/*`; a persistência → `services/*`. A rota HTTP e a escolha de framework são fatia/ADR seguinte.
2. **Credencial = e-mail + senha com hash argon2id**, server-only. Verificação de e-mail, login/sessão e reset ficam para fatia seguinte (exigem infra de e-mail).
3. **Atributos = 4 focos** (Físico · Técnico · Tático · Mental), escala **0..99**, alinhados aos FOCOs de treino do R4 FINAL (mesma linguagem para criação e evolução).
4. **Criação = point-buy livre** ("como o jogador bem entender") calibrado para nascer na **várzea**: `piso 20 · pool 56 · teto de criação 50`. Como o **pool é fixo**, **todo atleta criado tem overall = 34** (`(4×20 + 56)/4`), no fundo da banda tier-4 (`34..66`) — diferem só no **formato** (onde gastaram os 56). Isso é uma **propriedade de justiça deliberada**: largada igual para todos, especialização livre (sem prodígio pago/sorteado). Posição = **recomendação suave** (a futura UI sugere, não obriga).
5. **Criação NÃO coloca o atleta no mundo.** O atleta nasce como **identidade standalone** (não ocupa vaga na pirâmide). A entrada no elenco é o **card 21**, bloqueada pelo invariante "snapshot imutável na temporada" (SPEC-015).
6. **A matemática de treino/evolução (barra→+1 ponto livre, curva de 3 zonas, DLC) NÃO é desta fatia** — é o **card 13**, documentada em `docs/projeto/design-atributos-e-evolucao.md`. Esta fatia planta só a **base + a régua 0..99 + a primitiva de alocação + o seam da barra** (`training_xp`).

---

## Objetivo

Entregar a **primeira identidade humana do projeto**: uma **conta por e-mail** (senha argon2id) e a **criação do atleta** (nome com filtro, posição, visual pixel básico, e a distribuição livre de atributos base nos 4 focos), persistidas atomicamente. A regra de criação vive numa **lib pura** (`packages/player`) — determinística, testável, guardrail-compliant; a persistência e o hashing vivem num **serviço isolado** (`services/player-store`). Nenhuma rota HTTP, nenhuma colocação no mundo, nenhuma matemática de treino — só a fundação de identidade que todas as features de Fase 1 vão consumir.

---

## Contexto e motivação

O mundo já tem batimento cardíaco (SPEC-015: NPCs jogam sozinhos todo dia às 15h), mas **nenhum humano existe dentro dele**. A North Star (≥3 humanos no jogo das 15h) exige, antes de tudo, que um humano tenha uma **conta** e um **atleta**. O charter crava: *"Auth: e-mail + Steam auth. Conta obrigatória (o atleta vive no servidor). Coleta mínima."*

**Fatos de código verificados (`origin/main`):**
- **Zero superfície HTTP/auth** no repo (nenhum express/fastify/hono/argon2/bcrypt/jwt) — este é o primeiro. Só existem 2 workspaces: `packages/world-engine` (puro) e `services/world-store` (store).
- `Position = 'GK' | 'DEF' | 'MID' | 'FWD'` (`world-engine/src/types.ts`) — o atleta humano **reusa** esse tipo.
- `WORLD.abilityByTier` (`constants.ts`): tier 4 (várzea) = **`{min:34, max:66}`**; `youthAge: 17`; `retirementAge: 35`. Âncora dura da calibração da criação.
- **Guardrail de determinismo** (ESLint) proíbe `Date`/`Intl`/`Math.random` em `packages/*/src` → a lib de criação é 100% determinística; **timestamps, uuid e hashing (salt aleatório) vivem no `services/*`** (impuro).
- Padrão do projeto: Drizzle + `pg.Pool` (pooled/TCP) + migration versionada (OP-01) + tsconfig-typecheck-only (`services/*` fora do `tsc -b`). Testes de integração compartilham 1 Postgres → **serial (`fileParallelism:false`) + limpeza em ordem de FK** (invariante cravado na SPEC-015).

---

## Escopo — o que está DENTRO

**A) Lib de domínio pura `packages/player` (novo workspace):**
- [ ] `constants.ts` — bloco `PLAYER` **tunável**: `attributes: ['fisico','tecnico','tatico','mental']`, `attrMin: 0`, `attrMax: 99`, `creation: { floor: 20, pool: 56, cap: 50 }`, `name: { minLen: 2, maxLen: 20 }`. Números de criação isolados aqui (o card 13 mexe na curva sem tocar a criação).
- [ ] `name-filter.ts` — `validateName(raw): NameResult` puro: normaliza (trim, colapsa espaços), valida tamanho `[minLen,maxLen]` + charset PT-BR (letras+acentos, espaço, hífen, apóstrofo) + **blocklist mínima** (palavrões/termos reservados, insensível a caixa/acento/leet). Retorna `{ ok, value }` ou `{ ok:false, reason }`. Blocklist num módulo de dados puro (espelha `data/name-pools.ts`).
- [ ] `attributes.ts` — `allocateAttributes(dist): AttrResult` — a **primitiva reusável**: valida que os 4 focos = `floor + alocado`, com `sum(alocado) === pool`, cada foco ∈ `[floor, cap]` e (redundante) ∈ `[attrMin, attrMax]`. Reusada na criação (pool 56) e, no futuro (card 13), no treino (+1 até 99). Pura.
- [ ] `create.ts` — `createAthlete(input): CreateResult<AthleteDraft>` compõe `validateName` + `allocateAttributes` + posição (reusa `Position` do `world-engine`) + `validateAppearance` → `AthleteDraft` (identidade validada, **sem** id/timestamps — isso é do store). Pura.
- [ ] `appearance.ts` — `Appearance = { skinTone, hairStyle, hairColor }` como **índices bounded** (ex. `0..5` cada, casando com os sprites da lei de arte D11) + `validateAppearance` que rejeita índice fora da faixa. "Básico" = só esses eixos; editor rico é futuro.
- [ ] `password-policy.ts` — `validatePassword(raw): Result` puro (só a **política**: tamanho mínimo ≥ 10, não vazia). O HASH não é aqui (tem salt aleatório → impuro, vai pro store).
- [ ] Depende de `@camisa-9/world-engine` só para `Position` (e, em teste, `WORLD.abilityByTier` para a asserção de calibração). Registrar a project-reference no `tsc -b`.

**B) Serviço de persistência `services/player-store` (novo workspace, ISOLADO do world-store):**
- [ ] Schema Drizzle + migration `0000` (OP-01): tabela **`account`** (`id` uuid PK, `email` text UNIQUE normalizado-minúsculo, `password_hash` text, `created_at` timestamptz) + tabela **`athlete`** (`id` uuid PK, `account_id` FK→account, `name`, `position`, `appearance` jsonb, `fisico`/`tecnico`/`tatico`/`mental` int CHECK `0..99`, `training_xp` int default 0 — **o seam da barra**, `active` boolean, `created_at`). **Índice único parcial `(account_id) WHERE active`** = invariante "1 atleta ativo por conta".
- [ ] `auth.ts` — `hashPassword`/`verifyPassword` com **argon2id** (baseline OWASP: `m≈19 MiB, t=2, p=1`, server-tunável; salt por-hash do próprio lib). O hashing (salt aleatório) é impuro → mora aqui, nunca em `packages/*`. A **política** de senha (tamanho) é validada antes, na lib pura.
- [ ] **Isolamento de migrations no mesmo DB:** `player-store` usa `migrationsSchema`/`migrationsTable` PRÓPRIOS (ex. schema `player`), para o tracking de migration NÃO colidir com o do `world-store` (ambos no mesmo Postgres — o default `drizzle.__drizzle_migrations` colidiria).
- [ ] `player-repo.ts` — `createAccountWithAthlete(db, { email, password, draft })`: **uma transação** (all-or-nothing, padrão do projeto) que valida a política de senha (via lib), hasheia, insere `account` + `athlete` (ativo). Conflito de e-mail → erro **genérico** (OP-11). + readers `readAccountByEmail`/`readActiveAthlete` (teste/futuro login).
- [ ] Isolamento: `player-store` é um contexto separado do `world-store` (identidade ≠ mundo; e a **credencial deve ficar isolada** por segurança). Mesmo Postgres/CI container, migrations próprias.

**C) Fio de build/CI:**
- [ ] `packages/player` entra no `tsc -b` (lib pura, buildável, como `world-engine`); `services/player-store` entra no `tsconfig.typecheck.json` (padrão `services/*`).
- [ ] CI: o passo de migrate roda também as migrations do `player-store` (mesmo `postgres:16`).

**D) Testes** (gated por `DATABASE_URL` onde tocam o banco; serial + limpeza FK): ver Critérios.

## Escopo — o que está FORA

- **Matemática de treino/evolução** (barra→+1 ponto, curva de 3 zonas, DLC) → **card 13** (design record em `docs/projeto/design-atributos-e-evolucao.md`). Esta fatia planta só `training_xp` (o campo) + a primitiva de alocação.
- **Colocar o atleta no mundo** (ocupar clube, substituir NPC) → **card 21** (bloqueado pelo invariante de snapshot imutável — SPEC-015).
- **Fluxo solo/team + código de time (R14)** → **card 10**.
- **Steam auth** → fatia futura.
- **Verificação de e-mail · login/sessão · reset de senha** → fatia futura (exige infra de e-mail).
- **Rota HTTP / framework de API** → fatia/ADR futura.
- **Editor de visual rico · número de camisa** (é do time) → futuro.
- **`world-engine`/`world-store`** — intocados; nenhum golden regenerado.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/` (package.json, tsconfig, src/) | criar — lib pura de domínio do jogador. |
| `packages/player/src/constants.ts` | criar — `PLAYER` (focos, régua 0..99, criação piso/pool/teto). |
| `packages/player/src/name-filter.ts` (+ `data/name-blocklist.ts`) | criar — `validateName` + blocklist mínima. |
| `packages/player/src/attributes.ts` | criar — `allocateAttributes` (primitiva reusável). |
| `packages/player/src/create.ts` | criar — `createAthlete` → `AthleteDraft`. |
| `packages/player/src/*.test.ts` | criar — testes puros (nome, alocação, calibração várzea). |
| `services/player-store/` (package.json, tsconfig, drizzle.config, docker-compose) | criar — serviço isolado. |
| `services/player-store/src/schema/*.ts` + `migrations/0000_*.sql` | criar — `account` + `athlete` (OP-01). |
| `services/player-store/src/store/auth.ts` | criar — argon2id hash/verify. |
| `services/player-store/src/store/player-repo.ts` | criar — `createAccountWithAthlete` + readers. |
| `services/player-store/test/*.test.ts` | criar — criação atômica, hash, invariante 1-ativo (gated). |
| `tsconfig.json` / `tsconfig.typecheck.json` | editar — registrar os 2 novos workspaces no lugar certo. |
| `.github/workflows/*` (CI) | editar — migrate do `player-store`. |
| `docs/projeto/design-atributos-e-evolucao.md` | criar — design record do treino/evolução (seed do card 13). |
| `specs/SPEC-016-*.md`, `specs/DONE-016-*.md` | criar. |

**Intocado:** `packages/world-engine` (salvo import de `Position`), `services/world-store`, todos os goldens, migrations `0000`-`0002` do world-store.

---

## Critérios de aceitação

1. **Filtro de nome:** `validateName` normaliza e aceita nomes válidos; rejeita (com `reason`) < `minLen` / > `maxLen`, charset inválido e termos da blocklist (insensível a caixa/acento). Testado puro.
2. **Primitiva de alocação:** `allocateAttributes` aceita build espalhado E focado válidos; rejeita `sum(alocado) ≠ pool`, foco > `cap`, foco < `floor`, foco fora de `[0,99]`. Testado puro.
3. **Calibração várzea (uniforme):** **todo** atleta criado tem `overall = média(4 focos) = 34` (pool fixo), dentro da banda tier-4 do engine (`WORLD.abilityByTier[3]`, `34..66`), no fundo. Teste cruza com a constante real do `world-engine` e prova a invariância (dois builds de formatos diferentes → mesmo overall 34).
3b. **Visual bounded:** `validateAppearance` aceita índices na faixa e rejeita fora; `validatePassword` rejeita senha < mínimo. Testado puro.
4. **Criação atômica:** `createAccountWithAthlete` insere `account` + `athlete` numa **única transação**; falha (ex. e-mail duplicado) → **rollback total**, nenhuma conta/atleta órfão. Testado contra Postgres real.
5. **Senha nunca em claro:** `password_hash` é argon2id; `verifyPassword(senha, hash)` round-trip `true`, senha errada `false`; a senha em claro **nunca** é persistida nem logada. Testado.
6. **1 atleta ativo por conta:** o índice único parcial rejeita um 2º atleta ativo na mesma conta. Testado.
7. **Identidade standalone:** o atleta criado **não** referencia clube/liga/mundo (sem FK ao world-store); é pura identidade. Verificado no schema.
8. **OPs & gates:** sem `any` (OP-14); funções ≤50 (OP-15); arquivos ≤300 (OP-16); erros genéricos sem SQL/DSN/stack (OP-11); migration versionada (OP-01); segredos/params server-only (OP-02/OP-12); a lib `packages/player` **passa o guardrail de determinismo** (zero `Date`/`Intl`/`random` em `src` — **confirmar que o glob do guardrail cobre `packages/player`, não só `world-engine`**); `lint`/`typecheck`/`build`/`test` verdes; `world-engine`/`world-store` intactos (goldens diff 0).
8b. **Migrations coexistem:** aplicar do zero num DB limpo as migrations do `world-store` **e** do `player-store` (schemas de tracking separados) não colide; ambas sobem no CI no mesmo `postgres:16`.
9. **Higiene de teste de integração:** testes do `player-store` são **serial** e limpam em **ordem de FK** (athlete→account) — respeitam o invariante da SPEC-015.

---

## Segurança

- **Senha:** argon2id (memory/iterations/parallelism server-tunados), salt por-hash (do lib argon2), **nunca** plaintext em log/erro/coluna. Política de senha (tamanho mínimo) validada na lib pura antes do hash.
- **OP-09 (ordem autn→autz→input):** não há rota nesta fatia (é lib+store). Quando a rota de signup for adicionada (fatia futura), ela valida input; a criação em si é a operação não-autenticada por natureza (é o cadastro). A validação de input já é enforçada na lib + store aqui.
- **OP-11:** conflito de e-mail e falhas retornam **classe genérica** — sem SQL/DSN/stack. **Nota de enumeração de e-mail:** revelar "e-mail já em uso" vaza existência de conta (trade-off privacidade × UX). Para esta fatia recomendo a mensagem clara (UX de cadastro), a revisar quando entrar verificação de e-mail. *(Ponto para o founder decidir.)*
- **Coleta mínima (charter):** a `account` guarda só `email` + `password_hash` + `created_at`. Nenhum outro PII.
- **OP-02/OP-12:** `DATABASE_URL` e params do argon2 server-only; nada hardcoded.
- **Anti-fraude server-side:** a validação de atributos (piso/teto/99/pool) é autoridade do servidor (lib+store), nunca confia no cliente.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Novo serviço = scaffolding + fio de CI** | `player-store` espelha o `world-store` (Drizzle/pg.Pool/migrate/docker-compose já provados). CI só ganha um passo de migrate no mesmo container. |
| **Isolar credencial vs. simplicidade** | Serviço separado é a escolha certa (bounded-context + isolamento de credencial), e é reversível. Custo aceito. |
| **Fatia grande** (lib + serviço + auth + atributos) | Implementável em 2 sub-partes claras (conta/auth · atleta/atributos) num só PR; appetite 2-3 dias. |
| **Mapa focos→`ability` (para o card 21)** | Fora de escopo aqui, mas a régua 0..99 e a calibração várzea garantem que o mapa futuro (`ability = f(focos, posição)`) produza número comparável ao dos NPCs. |
| **Determinismo:** hashing/uuid/timestamp não podem entrar na lib pura | Ficam 100% no `services/*`; a lib só faz validação/alocação determinística. Guardrail do ESLint pega qualquer vazamento. |
| **Lint local por CRLF (Windows)** | Não é regressão; CI (LF) é a verdade; validar LF antes do push. |

**Dependências:** `world-engine` (tipo `Position` + banda várzea). **Precede:** card 10 (solo/team), card 21 (entrada no mundo), card 13 (evolução), e a futura rota HTTP de signup.

---

## Notas de implementação

- **A primitiva `allocateAttributes` é a joia reusável:** criação a chama com o pool inteiro; o treino (card 13) a chamará com +1 ponto. Uma fonte de verdade da regra de atributos.
- **`AthleteDraft` (lib) vs. `athlete` (store):** a lib produz a identidade validada **sem** id/timestamps/estado de persistência; o store carimba `id` (uuid), `created_at`, `active`, `training_xp:0`. Fronteira pura/impura limpa (OP-17).
- **Calibração:** os defaults `floor 20 / pool 56 / cap 50` dão overall ~34 (fundo várzea). São **tunáveis** no bloco `PLAYER` — ajustáveis sem tocar a lógica.
- **Design de treino** (card 13) documentado em `docs/projeto/design-atributos-e-evolucao.md`: barra→+1 ponto livre, curva de 3 zonas (cedo rápido / meio compromisso / cauda 85→99 brutal), DLC como acelerador de tempo (não poder), alvo ~150 pontos numa carreira dedicada dentro da janela de pico (idade). Esta SPEC só planta `training_xp` + a primitiva.
- **Fecho do DONE:** atualizar "Estado atual" do CLAUDE.md (SPEC-016 / Fase 1 iniciada) e `roadmap.md`.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (conta+atleta+atributos base; treino/mundo/HTTP/Steam fora — em cards nomeados)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudanças de schema documentadas (migration `0000` do novo serviço — OP-01)
- [x] Critérios de aceitação testáveis (filtro, alocação, calibração, atomicidade, hash, 1-ativo)
- [x] Riscos e segurança avaliados (auth/PII/OP-11/coleta mínima; enumeração de e-mail sinalizada)
- [x] Decisões de design co-desenhadas registradas (6 decisões)
- [x] **Aprovada** — *founder/architect no card `0126c71a` (2026-07-16)*

---

*SPEC-016 — método H1VE. Primeira feature da Fase 1: a identidade humana. Conta por e-mail (argon2id) + atleta com atributos base nos 4 focos (point-buy calibrado para a várzea), em lib pura + serviço isolado. Não coloca no mundo (card 21) nem implementa treino (card 13) — planta a fundação que toda a Fase 1 consome.*
