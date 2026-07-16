# SPEC-018 — Cadastro solo/team + código de time (R14): a camada de identidade do quinteto

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-018 |
| **Feature** | Cadastro solo/team + código de time (R14) — card do board |
| **Slug** | cadastro-solo-team-codigo-de-time-r14 |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.6 — o social mínimo do beta; consome a identidade da SPEC-016/017. |
| **Appetite** | **2 a 3 dias**. |
| **Prioridade** | ALTA — o quinteto é a unidade de aquisição (fura a fila); o loop de convite ("monte seu quinteto") é o social do beta. |
| **Criada em** | 2026-07-16 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-16) — leia antes de aprovar

1. **Escopo = camada de IDENTIDADE de time (Fatia 1), SEM colocar no mundo.** A colocação real (solo = ocupar vaga NPC; team = fundar/preencher clube na divisão de entrada) **compartilha o bloqueio do snapshot imutável** (SPEC-015) e é a integração do **card 21** (+ provável Fatia 3 da 0.2 antes). Esta fatia entrega o **"monte seu quinteto"**: team + código + membership + roster de 16 (posições, goleiro NPC default implícito, marcos 11/16), em `player-store` — exatamente como a SPEC-016 entregou a identidade do atleta **sem** colocá-lo no mundo.
2. **Identidade do time = nome + camisa básica.** O capitão escolhe **nome** + **camisa** (cores + escudo por **índices bounded**, validados como o `appearance` do atleta). "Camisa própria" desde o cadastro — o valor central do quinteto.
3. **Herda os padrões do projeto:** lib pura (regra) + serviço isolado (persistência/aleatoriedade); transação all-or-nothing; **`SELECT … FOR UPDATE`** no join concorrente (lição da SPEC-017); erros genéricos (OP-11); migration versionada (OP-01).

---

## Objetivo

Entregar a **bifurcação de cadastro solo/team** e a **camada de identidade do time**: um humano se cadastra **solo** (o fluxo da SPEC-016, atleta standalone) **ou** cria um **time** (com nome + camisa, recebendo um **código distribuível**) **ou** entra num time com um código (caindo direto no elenco, escolhendo posição entre as vagas restantes). O time é um **elenco humano de até 16** (2 GK · 5 DEF · 5 MID · 4 FWD), jogável desde o humano nº 1, com marcos no **11º** (primeiro onze) e **16º** (elenco completo → o código expira). A regra (slots, posições, marcos, validação de nome/camisa/código) é **lib pura** (`packages/player`); a persistência + a geração aleatória do código são **serviço isolado** (`services/player-store`), atômicos. **Sem colocar o time no mundo** (card 21) — é a identidade pré-mundo que a integração futura vai posicionar.

---

## Contexto e motivação

O charter crava o quinteto como **unidade de aquisição** (entra por quinteto **fura a fila**) e "camisa própria, subir juntos" como sua proposta de valor. O roadmap 2.6 chama isto de **"o social mínimo do beta"**, casado com o Discord "monte seu quinteto". Hoje o projeto tem a **identidade individual** (SPEC-016: conta + atleta; SPEC-017: evolução) mas **nenhum conceito de grupo**.

**Fatos verificados (repo, `origin/main`):**
- **`services/player-store`** (SPEC-016/017): schema Postgres dedicado `player` — `account`(email UNIQUE + password_hash) + `athlete`(account_id FK, nome, posição, appearance jsonb, 4 focos, training_xp, **free_points**, active, created_at); **índice único parcial `(account_id) WHERE active`** (1 atleta ativo/conta); migrations `0000`+`0001`; padrão transação + `createAccountWithAthlete`.
- **`packages/player`** (pura): `Position = 'GK'|'DEF'|'MID'|'FWD'`, `validateName` (charset PT-BR + blocklist leet-aware), `validateAppearance` (índices bounded), `createAthlete → AthleteDraft`. **Standalone** (não importa o world-engine em `src`).
- **`world-engine`** (só p/ cross-check em teste): `WORLD.squadShape = { GK:2, DEF:5, MID:5, FWD:4 }` (soma **16** = `rosterSize`). É a forma canônica do elenco — o time humano espelha-a (drift coberto por teste, como `Position`).
- **Guardrail** (`packages/*/src`): sem `Date`/`Intl`/`Math.random`/transcendentais → a **geração do código** (aleatória) e timestamps vivem no `services/*`; a lib só valida forma/slots/marcos (determinístico).

---

## Escopo — o que está DENTRO

**A) Lib pura `packages/player` (estende o workspace):**
- [ ] `constants.ts` — bloco **`TEAM`** tunável: `squad` = `{ GK:2, DEF:5, MID:5, FWD:4 }` (soma 16 — espelha `WORLD.squadShape`); `name` `{ minLen, maxLen }`; `kit` = nº de opções por eixo (`primaryColor`, `secondaryColor`, `crest`); `code` `{ len, alphabet }` (charset sem ambíguos — sem `O/0/I/1`); marcos `firstEleven: 11`, `fullSquad: 16`.
- [ ] `team.ts` — regra pura:
  - `validateTeamName(raw): Result<string>` — reusa a normalização + blocklist do `name-filter` (refatorar o núcleo p/ `validateName` e `validateTeamName` compartilharem).
  - `validateKit(kit): Result<Kit>` — índices bounded (espelha `validateAppearance`).
  - `validateCodeFormat(raw): Result<string>` — forma do código (comprimento + alfabeto); normaliza p/ caixa alta. *(A existência/unicidade é do store.)*
  - `slotsRemaining(claimed): Record<Position, number>` — vagas humanas livres por posição = `squad[pos] − claimed[pos]`.
  - `canClaim(claimed, position): boolean` — há vaga humana livre naquela posição?
  - `humanCount(claimed): number` e `milestone(count): 'primeiro_onze' | 'elenco_completo' | null` (11 / 16).
  - `createTeam(input): Result<TeamDraft>` — compõe nome + kit (+ posição do capitão) → `TeamDraft` (sem id/código/timestamps — isso é do store).
- [ ] `types.ts` — `Kit` (`{ primaryColor, secondaryColor, crest }`), `TeamDraft`, `ClaimedByPosition = Record<Position, number>`.
- [ ] Reusa `Position`/`Result`/`FOCI`/`validateName`/`validateAppearance`. **Standalone**.

**B) Serviço `services/player-store` (estende):**
- [ ] Schema + **migration aditiva `0002`** (OP-01):
  - Tabela **`team`**: `id` uuid PK, `name` text, `kit` jsonb `$type<Kit>`, `code` text **UNIQUE**, `captain_account_id` uuid FK→account, `locked` boolean default false, `created_at`.
  - `athlete` ganha **`team_id` uuid NULL FK→team** (aditiva; `NULL` = solo). A posição de time = a `position` do atleta (setada no join). Membros do time = atletas com aquele `team_id`.
- [ ] `team-repo.ts`:
  - `createAccountWithTeam(db, { email, password, draft, teamName, kit, captainPosition })` — **transação**: cria account + athlete (reusa a lógica da SPEC-016) + team (com **código gerado**, único, retry em colisão) + liga `athlete.team_id` e fixa a posição do capitão. E-mail duplicado / nome/kit inválidos → erro genérico (OP-11).
  - `joinTeamWithCode(db, { email, password, draft, code, position })` — **transação com `SELECT … FOR UPDATE`** no `team` (serializa joins concorrentes — lição SPEC-017): valida código (existe, **não** `locked`, **não** cheio 16), valida `canClaim(position)`; cria account + athlete + liga `team_id` + posição. Código inválido / time cheio / posição sem vaga / e-mail duplicado → **erro genérico** (OP-11). Ao atingir 16, marca `locked` (código expira).
  - `lockTeam(db, teamId, captainAccountId)` — tranca manual (só o capitão; senão erro genérico).
  - `readTeam(db, { teamId | code })` → `{ team, members: [{ athleteId, name, position }], humanCount, milestone, slotsRemaining }` (leitura p/ UI/testes).
  - `generateCode` (impuro, aleatório, alfabeto sem ambíguos) — vive aqui, **nunca** na lib pura.
- [ ] `createAccountWithAthlete` (solo, SPEC-016) **inalterado** — é o ramo SOLO da bifurcação (`team_id` = NULL).

**C) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`, serial + FK): ver Critérios.

## Escopo — o que está FORA

- **Colocar o time/atleta no MUNDO** (fundar clube na divisão de entrada; ocupar vaga NPC no snapshot) → **card 21** (+ Fatia 3 da 0.2). Esta fatia é identidade pré-mundo.
- **NPC com nome/personalidade** nas vagas não-humanas → materializa no world-placement (o engine já cria NPCs). Aqui a vaga NPC é **implícita** (`squad[pos] − humanos`).
- **Química com amigos / cards compartilháveis / waiting list / "furar a fila"** → fatias futuras (F2 / distribuição).
- **Steam auth / verificação de e-mail / login-sessão / rota HTTP** → fatias futuras.
- **Converter um solo existente em membro de time** (migração de atleta) → futuro; aqui a bifurcação é no cadastro.
- **`world-engine`/`world-store`** — intocados; nenhum golden regenerado.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/constants.ts` | editar — +bloco `TEAM` (squad/nome/kit/código/marcos). |
| `packages/player/src/team.ts` | criar — validações + slots + marcos + `createTeam`. |
| `packages/player/src/name-filter.ts` | editar — extrair núcleo reusável (validateName + validateTeamName). |
| `packages/player/src/types.ts` | editar — +`Kit`/`TeamDraft`/`ClaimedByPosition`. |
| `packages/player/src/index.ts` | editar — exportar o novo módulo. |
| `packages/player/src/team.test.ts` | criar — nome/kit/código, slots por posição, marcos 11/16, cross-check `squad` vs `WORLD.squadShape`. |
| `services/player-store/src/schema/team.ts` | criar — tabela `team`. |
| `services/player-store/src/schema/athlete.ts` | editar — +`team_id` FK. |
| `services/player-store/src/schema/index.ts` | editar — exportar `team`. |
| `services/player-store/src/migrations/0002_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/player-store/src/store/team-repo.ts` | criar — create/join/lock/read + `generateCode`. |
| `services/player-store/src/index.ts` | editar — exportar. |
| `services/player-store/test/team-repo.test.ts` | criar — create/join/posição cheia/time cheio/lock/código inválido/concorrência (gated). |
| `specs/SPEC-018-*.md`, `specs/DONE-018-*.md` | criar. |

**Intocado:** `packages/world-engine`, `services/world-store`, todos os goldens, `createAccountWithAthlete` (solo). **CI sem mudança** (o passo de migrate do `player-store` já aplica o `0002`).

---

## Critérios de aceitação

1. **Bifurcação:** SOLO cria atleta com `team_id = NULL` (fluxo SPEC-016 intacto); TEAM-create cria account+athlete+team+código; TEAM-join entra num time existente. Testado.
2. **Código distribuível:** gerado server-side, **único** (retry em colisão), alfabeto sem ambíguos, normalizado p/ caixa alta; `validateCodeFormat` (pura) rejeita forma inválida. Testado.
3. **Roster de 16 por posição:** um join só é aceito se `canClaim(position)` (há vaga: `squad[pos] − humanos naquela posição > 0`). 3º GK, 6º DEF etc. → **rejeitado** (erro genérico). Testado.
4. **Marcos:** `milestone(11) = 'primeiro_onze'`, `milestone(16) = 'elenco_completo'`; ao 16º humano o time fica `locked` (código expira). Testado.
5. **Camisa própria:** `validateTeamName` (charset + blocklist, insensível a caixa/acento/leet) e `validateKit` (índices bounded) — aceitam válidos, rejeitam inválidos. Testado puro.
6. **Persistência atômica + concorrência:** create/join numa **única transação**; join usa `SELECT … FOR UPDATE` no `team` → dois joins simultâneos na mesma última vaga **não** estouram 16 nem duplicam a posição (o 2º é rejeitado). Testado contra Postgres real.
7. **Tranca:** `lockTeam` só pelo capitão; depois de trancado, join → erro genérico. Testado.
8. **Standalone (sem FK ao mundo):** `team` só referencia `account`; `athlete.team_id` só referencia `team`; **zero** FK ao world-store. Verificado no schema.
9. **Cross-check de forma:** `TEAM.squad` deep-equal a `WORLD.squadShape` (soma 16) — teste cruza com o engine (pega drift), como `Position`.
10. **OPs & gates:** sem `any` (OP-14); funções ≤50 (OP-15); arquivos ≤300 (OP-16); erros genéricos (OP-11); migration OP-01; guardrail verde (código aleatório fica no `services/*`); `lint`/`typecheck`/`build`/`test` verdes; `world-engine`/`world-store` intactos (goldens diff 0); testes ao vivo serial + limpeza FK (invariante SPEC-015).

---

## Segurança

- **Autoridade server-side:** unicidade do código, cap de 16, cap por posição e a tranca são decididos no servidor (lib+store) — o cliente nunca burla. `FOR UPDATE` garante que a corrida pela última vaga não fura o cap.
- **OP-11:** código inválido, time cheio, posição sem vaga, trancado, e-mail duplicado, não-capitão → **classe genérica**, sem SQL/constraint/stack. **Nota:** "código inválido" vs "time cheio" — mensagens distintas ajudam a UX mas vazam existência do time; recomendo mensagens claras nesta fatia (é convite entre amigos), a revisar se houver abuso.
- **OP-02/OP-12:** nada de segredo novo; `DATABASE_URL` server-only.
- **PII:** o `team` guarda nome + kit + código + capitão — nenhum PII novo além do já coletado (email na `account`).

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Corrida pela última vaga / 16º slot** (dois joins simultâneos) | `SELECT … FOR UPDATE` no `team` serializa o read-modify-write (lição da revisão da SPEC-017); teste de concorrência determinístico (2ª conexão segurando o lock). |
| **Colisão de código** | Alfabeto grande sem ambíguos + `UNIQUE` no banco + **retry** na geração; espaço de código dimensionado no `TEAM.code`. |
| **`team_id` = schema change** | Coluna **aditiva** `NULL` (migration `0002`), zero downtime, OP-01; solos existentes ficam `NULL`. |
| **Escopo (create/join/lock/read + lib)** | Fatiado só na identidade (mundo fora); 3 fluxos claros; appetite 2-3 dias. |
| **Drift do `squad` vs engine** | Cross-check em teste (deep-equal a `WORLD.squadShape`). |
| **Lint local por CRLF (Windows)** | Não é regressão; CI (LF) é a verdade; validar LF antes do push (memória). |

**Dependências:** SPEC-016 (`account`/`athlete` + `createAccountWithAthlete`). **Precede:** card 21 / world-placement (o mundo vai posicionar este time), química (F2), waiting-list/furar-a-fila (distribuição).

---

## Notas de implementação

- **A posição de time = a `position` do atleta.** No join, `athlete.position` recebe a vaga reivindicada; membros do time = atletas com aquele `team_id`. Sem tabela `team_member` separada (o atleta já é a linha).
- **Vaga NPC é implícita:** `squad[pos] − (humanos naquela posição)`. Nada de linhas NPC nesta fatia (materializam no world-placement, onde o engine já cria NPCs com nome/personalidade). "Goleiro NPC default" = os 2 GK ficam NPC até um humano reivindicar.
- **Marcos são derivados** do `humanCount` (11/16). "Celebrar" (card + histórico do mundo) é UI/mundo — aqui só o **estado** (marco atingido + tranca-no-16). O `readTeam` expõe `milestone`.
- **`FOR UPDATE` desde já** (não como fix pós-revisão): join é read-modify-write sobre as vagas → trava a linha do `team` na transação.
- **Núcleo de validação de nome reusado** (não duplicar a blocklist): `name-filter` exporta o core; `validateName` (atleta) e `validateTeamName` variam só min/max.
- **Fecho do DONE:** atualizar "Estado atual" do CLAUDE.md (SPEC-018) e o `roadmap.md` (2.6).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (identidade de time; mundo/NPC-nome/química/HTTP fora — em cards nomeados)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva `0002` — OP-01)
- [x] Critérios de aceitação testáveis (bifurcação, código, slots, marcos, concorrência, tranca)
- [x] Riscos e segurança avaliados (corrida pela vaga, colisão de código, OP-11)
- [x] Decisões co-desenhadas registradas (escopo identidade + nome/camisa)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-018 — método H1VE. O social mínimo do beta: cadastro solo/team + código de time. O quinteto monta seu elenco (nome, camisa própria, 16 vagas por posição, marcos 11/16) via código distribuível — a identidade do grupo, em lib pura + serviço isolado, com `FOR UPDATE` na corrida pela vaga. Não coloca no mundo (card 21).*
