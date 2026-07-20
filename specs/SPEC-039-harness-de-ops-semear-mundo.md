# SPEC-039 — Harness de ops: semear mundo + âncora de temporada

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-039 |
| **Feature** | Harness de ops — semear mundo e âncora de temporada — card do board |
| **Slug** | harness-de-ops-semear-mundo |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | **1.2** (o gatilho de produção) — completa a cadeia de operação que a SPEC-032 começou e a SPEC-037 continuou. |
| **Appetite** | **1 dia** (dois scripts de ~30 linhas + uma pré-checagem + a seção do runbook). |
| **Prioridade** | **LOW** (como criado no card). ⚠️ *Nota do autor: eu argumentaria ALTA — esta fatia **bloqueia o deploy**, porque sem mundo semeado subir o container é inútil (o tick devolve `sem_ancora` para sempre). Fica registrado; a prioridade do card manda.* |
| **Criada em** | 2026-07-20 |
| **Aprovada em** | *(preencher na aprovação do card)* |
| **Aprovada por** | *(preencher na aprovação do card)* |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Como o buraco apareceu

Não foi análise: foi tentativa de uso. Em 2026-07-20, logo após o merge da SPEC-037, tentei rodar o jogo ponta a ponta num banco local para responder à pergunta *"eu já consigo ver o jogo funcionando?"*. O `harness/create-account.ts` — o script de operador que a própria SPEC-037 entregou — **falhou**:

```
falha: Failed query: insert into "waiting_list" ("world_seed", "human_athlete_id", "position", "ord") …
```

**Causa:** `waiting_list.world_seed` tem FK para `world.seed` (`waiting-list.ts:13-15`) e **não havia mundo semeado** para aquela seed. Só funcionou quando apontei para um mundo `tick-prod` que a suíte de testes tinha deixado no banco por acaso.

**O achado real:** semear um mundo e gravar a âncora **só acontece dentro de testes**. `writeWorld` e `setSeasonAnchor` são exportados e usados por 9 suítes, mas **não existe nenhum script de operador** que os invoque. O runbook de deploy chama a âncora de *"input de ops"* sem nunca dizer como. Ou seja: hoje, para subir o jogo num banco limpo, alguém teria que escrever código descartável na mão.

---

## Decisões travadas com o founder (2026-07-20)

1. **O `seasonId` é DERIVADO, não perguntado.** `setSeasonAnchor(db, seed, seasonId, startDayIndex)` (`season-repo.ts:9-14`) pede o id da temporada, mas ele já está no mundo. O script lê via `readWorld(db, seed)` e usa o `seasonId` de lá. O operador informa **só a seed e a data** — um parâmetro a menos para errar, e impossível ancorar a temporada errada.

2. **A DATA, nunca o `dayIndex`.** O `startDayIndex` é "dias desde a época" — ninguém calcula isso de cabeça, e um erro de 1 desloca o calendário inteiro do mundo. O operador escreve `2026-08-01` e o script converte usando o **próprio `resolveSlot` do engine** (`anchor.ts:22`), que já encapsula o fuso fixo UTC-3. **Zero matemática nova** (não reimplementamos a conversão) e **zero relógio lido** (a data é explícita, não "hoje") — o que mantém o script determinístico e auditável.

3. **`seed-world` FALHA ALTO se o mundo já existe.** Sem `--force`, sem sobrescrita. Um `writeWorld` sobre uma seed viva apagaria a linha do tempo de todos os jogadores dela — clubes, elencos, ocupações humanas, rodadas publicadas. É a operação mais destrutiva possível neste projeto, e ela **não deve caber num typo de terminal**. Quem quiser mesmo recomeçar apaga explicitamente no banco.

4. **`create-account.ts` ganha pré-checagem com mensagem útil.** O erro que me pegou vazou SQL cru e não dizia o que fazer. Passa a checar o mundo antes e falhar com *"não existe mundo semeado para a seed «X» — rode `seed-world.ts` primeiro"*. Mesma frente, três linhas.

---

## Objetivo

Fechar a cadeia de operação. Depois desta fatia, subir o jogo do zero é uma sequência de comandos documentada — semear o mundo, ancorar a temporada, criar as contas, ligar o tick — em vez de um pedaço de conhecimento que só existe dentro das suítes de teste.

---

## Contexto e motivação (fatos verificados no repo)

- **`writeWorld(db, seed)`** (`world-repo.ts:11`) — semeia via `seedWorld(seed)` e persiste em **uma transação** (`writeWorldState`, all-or-nothing). Determinístico por seed.
- **`setSeasonAnchor(db, seed, seasonId, startDayIndex)`** (`season-repo.ts:9`) — grava o `dayIndex` da rodada 1. Sem ela, `runDailyTick` devolve **`sem_ancora` para sempre** (`daily-tick.ts:75`).
- **`resolveSlot(epochMs)`** (`packages/world-engine/src/orchestration/anchor.ts:22`) — puro, offset **fixo UTC-3**, devolve `{dayOfWeek, hour, minute, dayIndex, isMatchWindow}`. Já exportado no barrel.
- **`readWorld(db, seed)`** (`world-repo.ts:28`) — devolve o `WorldState` (com `seasonId`) ou `null`. É a pré-checagem natural dos dois scripts.
- **`harness/`** é **borda impura** e está **fora do guardrail** de determinismo (`eslint.config.mjs:83` restringe a `packages/*/src`) — `Date`/`env` são legítimos ali, e já são usados (`run-season.ts:1-3` diz isso com todas as letras).
- **Precedente de script de operador:** `harness/create-account.ts` (SPEC-037) — mesma forma: lê env, valida, chama funções já testadas, `pool.end()` no `finally`, erro genérico no `catch`.
- **`waiting_list.world_seed` → FK `world.seed`** (`waiting-list.ts:13-15`) — a causa raiz do erro relatado acima.

---

## Escopo — o que está DENTRO

### A) `harness/seed-world.ts` (novo)

```
SEED=<string> DATABASE_URL=… npx tsx harness/seed-world.ts
```

- [ ] Valida `SEED` e `DATABASE_URL` (erro claro se faltar).
- [ ] ⚠️ **Pré-checa `readWorld`: se já existe, FALHA e não escreve nada** (Decisão 3) — mensagem explicando que sobrescrever apagaria a linha do tempo e que a saída é apagar explicitamente no banco.
- [ ] Chama `writeWorld(db, seed)` e reporta a topologia criada (tiers × ligas × clubes) para o operador conferir que semeou o que esperava.
- [ ] `pool.end()` no `finally`.

### B) `harness/set-anchor.ts` (novo)

```
SEED=<string> START_DATE=YYYY-MM-DD DATABASE_URL=… npx tsx harness/set-anchor.ts
```

- [ ] Valida `SEED`, `DATABASE_URL` e o **formato** de `START_DATE` (`YYYY-MM-DD` estrito; data inválida → erro claro).
- [ ] ⚠️ **Pré-checa `readWorld`: sem mundo, FALHA** apontando para o `seed-world.ts` — a âncora não faz sentido sozinha.
- [ ] **Deriva o `seasonId` do mundo** (Decisão 1) — nunca pergunta.
- [ ] **Converte a data em `dayIndex` via `resolveSlot`** (Decisão 2): monta o `epochMs` das **15h BRT** daquela data e usa `resolveSlot(epochMs).dayIndex`. ⚠️ **Não reimplementar a aritmética de fuso** — a única fonte é o engine.
- [ ] Chama `setSeasonAnchor` e reporta: seed, `seasonId`, a data e o `dayIndex` derivado (o operador confere a tradução).

### C) `harness/create-account.ts` (editar)

- [ ] Pré-checa `readWorld` **antes** de criar a conta; sem mundo → falha com *"não existe mundo semeado para a seed «X» — rode `seed-world.ts` primeiro"*. Hoje o operador recebe SQL cru de uma violação de FK e nenhuma pista (Decisão 4).

### D) `docs/ops/scheduler-deploy-runbook.md` (editar)

- [ ] Seção **"Primeira subida: semear o mundo"**, ANTES das seções de scheduler e API — é o passo zero. A sequência completa: `db:migrate` → `seed-world` → `set-anchor` → `create-account` → ligar o cron/serviço. Com o aviso de que semear é **irreversível na prática**.

### E) Testes

- [ ] **Puro:** a conversão `YYYY-MM-DD` → `dayIndex` (incluindo a virada de mês/ano e a rejeição de data inválida). ⚠️ Se a conversão virar um helper testável, ele mora no **próprio harness** — `packages/*` não ganha nada aqui.
- [ ] **Ao vivo (gated por `DATABASE_URL`):** semear num banco limpo cria o mundo; semear de novo **falha sem escrever**; `set-anchor` sem mundo falha; com mundo, grava a âncora que o `readSeasonAnchor` devolve; `create-account` sem mundo dá a mensagem nova.

## Escopo — o que está FORA

- **Semear MÚLTIPLAS seeds / multi-seed** — o tick lê um `WORLD_SEED` só; particionar é card futuro.
- **`--force` / sobrescrever mundo** — deliberadamente ausente (Decisão 3).
- **Apagar mundo / resetar temporada** — se virar necessidade real, é card próprio com muito mais cuidado.
- **UI de ops / painel** — o painel de auditoria interno é o roadmap 1.5.
- **Executar o deploy** — continua ação de ops do founder; esta fatia só remove o bloqueio.
- **Semear contas em lote** — uma por invocação basta para o beta.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `harness/seed-world.ts` | criar — semeia com pré-checagem que impede sobrescrita. |
| `harness/set-anchor.ts` | criar — data → `dayIndex` via `resolveSlot`; `seasonId` derivado. |
| `harness/create-account.ts` | editar — pré-checagem de mundo com mensagem acionável. |
| `harness/*.test.ts` (ou `harness/test/`) | criar — a conversão de data (puro) + os cenários ao vivo. ⚠️ **conferir o `include` do `vitest.config.ts`**: hoje é `packages/*/src/**` + `services/*/test/**` — `harness/` **não está coberto**, então ou o teste mora noutro lugar ou o `include` ganha uma entrada (decidir na implementação e registrar no DONE). |
| `docs/ops/scheduler-deploy-runbook.md` | editar — seção "Primeira subida". |
| `specs/SPEC-039-*.md`, `specs/DONE-039-*.md` | criar. |

**Intocado (o critério DURO):** **`packages/world-engine`, `packages/player` e os 4 goldens** (`git diff` = **0**). `services/*` **inteiro** intocado — os scripts só *consomem* o que o world-store e o player-store já exportam.

---

## Mudanças de schema

**Nenhuma mudança de schema nesta feature.**

Os dois scripts só invocam funções de escrita que **já existem e já são testadas**: `writeWorld` (que persiste via `writeWorldState`, numa transação all-or-nothing) e `setSeasonAnchor`. Nenhuma tabela, coluna, índice ou enum novo — e portanto **nenhuma migration** (OP-01 não é acionado).

⚠️ **O que esta fatia toca no banco é DADO, não ESTRUTURA** — e isso é justamente o que a torna perigosa: `writeWorld` numa seed viva sobrescreveria a linha do tempo inteira. A trava está na Decisão 3 e no critério 2, não numa migration.

---

## Mudanças de API

**Nenhuma mudança de API nesta feature.**

Não há rota nova, alterada ou removida. A superfície HTTP entregue pela SPEC-037 (`GET /healthz`, `POST /v1/auth/login`, `POST /v1/auth/logout`) fica **byte-idêntica**; `services/api` não é aberto.

A interface desta fatia é **linha de comando**, não HTTP:

```
SEED=<string> DATABASE_URL=…                     npx tsx harness/seed-world.ts
SEED=<string> START_DATE=YYYY-MM-DD DATABASE_URL=…  npx tsx harness/set-anchor.ts
```

Saída em stdout para conferência do operador (topologia semeada; seed + `seasonId` + data + `dayIndex` derivado); falha com `process.exitCode = 1` e mensagem acionável.

---

## Critérios de aceitação

1. **Semear funciona e é reportado** *(ao vivo)*: num banco sem a seed, `seed-world` cria o mundo e imprime a topologia; `readWorld` passa a devolver o `WorldState`.
2. **Semear duas vezes NÃO destrói** *(ao vivo — o critério mais importante)*: rodar `seed-world` numa seed que já existe **falha, não escreve nada, e o mundo anterior fica byte-idêntico** (comparar a contagem de clubes/atletas antes e depois). Uma sobrescrita silenciosa aqui apagaria a carreira de todos os jogadores.
3. **A data vira o `dayIndex` certo** *(puro)*: `YYYY-MM-DD` → `dayIndex` bate com `resolveSlot` para um conjunto de datas incluindo **virada de mês e de ano**; data malformada (`2026-13-01`, `01/08/2026`, vazio) → erro claro, nunca um `NaN` gravado no banco.
4. **A âncora exige mundo e deriva o `seasonId`** *(ao vivo)*: sem mundo → falha apontando o `seed-world`; com mundo → grava, e `readSeasonAnchor(seed, seasonId)` devolve exatamente o `dayIndex` reportado. O operador **nunca** informou o `seasonId`.
5. **A cadeia completa roda num banco limpo** *(ao vivo — o teste que responde à pergunta original)*: `migrate` → `seed-world` → `set-anchor` → `create-account` → `runDailyTick` publica a rodada 1. É o cenário que falhou em 2026-07-20.
6. **`create-account` sem mundo é acionável** *(ao vivo)*: a mensagem nomeia a seed e manda rodar o `seed-world`; **nenhum SQL cru** na saída.
7. **OPs & gates**: sem `any` (14); ≤50 linhas/função (15); ≤300/arquivo (16); segredos só-env (02/12); `lint`/`typecheck`/`build`/`test`/prettier verdes; **529 testes preservados**; **engine e os 4 goldens INTOCADOS**; **sem migration**.

---

## Segurança

- **A operação destrutiva é bloqueada por construção** (Decisão 3): não existe caminho no script que sobrescreva um mundo vivo. Este é o único risco sério da fatia, e a mitigação é ausência de código, não um aviso.
- **OP-02/12:** `DATABASE_URL` e `SEED` só de `process.env`; nada hardcoded, nada logado além da seed (que não é segredo).
- **Superfície:** zero — são scripts de operador rodados à mão, não rotas. Não escutam porta, não recebem input de terceiro.
- **OP-11 no espírito, não na letra:** a saída é para um operador, então SQL cru não é vazamento — mas o erro que motivou esta SPEC provou que ele também **não é útil**. As mensagens nomeiam a causa e o próximo comando.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Sobrescrever um mundo vivo** — apagaria clubes, elencos, ocupações humanas e rodadas publicadas de todos os jogadores da seed. **O dano mais irreversível que este repo comporta** | **Baixa** *(mas alta se houver `--force`)* | Pré-checagem que **falha antes de qualquer escrita**; `--force` **deliberadamente ausente**. Cravado pelo critério 2 — o mundo anterior tem que sobreviver byte-idêntico. |
| **Ancorar no dia errado** — desloca o calendário inteiro; a rodada 1 cai na data errada e o catch-up replaya o buraco | **Média** *(é o parâmetro que o operador digita)* | O operador escreve uma **data**, não um número opaco; o script **reporta a tradução** (`data → dayIndex`) para conferência antes de o tick rodar; a conversão reusa o `resolveSlot` do engine (critério 3). |
| **Reimplementar a aritmética de fuso** e divergir do engine — o mundo jogaria num dia e o tick esperaria outro | **Média** *(é o atalho tentador na implementação)* | Proibido explicitamente na SPEC e nas Notas: a única fonte é `resolveSlot`. Cravado pelo critério 3, que compara a conversão contra o próprio engine. |
| **`harness/` fora do `include` do vitest** → teste escrito que nunca roda | **Alta** *(o `include` atual não cobre `harness/`)* | Decidir na implementação (mover o teste ou estender o `include`) e **registrar no DONE**. Está nomeado na tabela de arquivos para não passar batido. |
| **Falsa sensação de "pronto para produção"** | **Média** | Esta fatia **remove um bloqueio de operação; não é o deploy**. O runbook posiciona semear como passo **zero**, e o "executar o deploy" segue explicitamente FORA do escopo. |

**Dependências:** SPEC-013 (`writeWorld`) · SPEC-015 (`setSeasonAnchor`, a âncora) · SPEC-032 (o runbook, o tick que exige a âncora) · SPEC-037 (`create-account.ts`, que ganha a pré-checagem).

**Precede:** **executar o deploy** (hoje bloqueado por isto) e qualquer demonstração ponta a ponta do jogo num banco novo.

---

## Notas de implementação

- **Molde:** `harness/create-account.ts` (SPEC-037) — env → validação → funções já testadas → `pool.end()` no `finally` → `catch` com mensagem genérica e `process.exitCode = 1`.
- **A conversão de data**, concretamente: montar o `epochMs` correspondente às **15h de Brasília** da data informada e passar por `resolveSlot`. Usar 15h (e não meia-noite) evita qualquer ambiguidade de borda: é a hora do jogo, e é o que `isMatchWindow` reconhece.
- **⚠️ `harness/` está fora do guardrail** — `Date` é legítimo ali. Mas o script **não lê o relógio**: a data vem do operador. Ler "hoje" seria uma terceira borda de relógio no projeto e tornaria o comando não-reproduzível.
- **⚠️ Ritual do board H1VE:** escrever o arquivo **não** publica. `h1ve spec --from specs/SPEC-039-*.md`, aprovação **no card**, e `h1ve done --doc` antes do PR.
- **Fecho do DONE:** "Estado atual" do `CLAUDE.md` + a decisão sobre o `include` do vitest + registrar que a cadeia completa foi **executada de verdade** num banco limpo (critério 5), não só testada.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (dois scripts + uma pré-checagem + runbook; multi-seed, `--force` e deploy fora)
- [x] Arquivos listados corretos (verificados no repo, com linhas)
- [x] **Sem mudança de schema** — nenhuma migration
- [x] Critérios testáveis (7, incl. o critério 2 que protege contra a operação destrutiva)
- [x] Riscos avaliados (sobrescrita, âncora errada, divergência de fuso)
- [x] Decisões co-desenhadas registradas (4, todas de 2026-07-20)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-039 — método H1VE. Fecha a cadeia de operação que faltava: semear o mundo e ancorar a temporada deixam de existir só dentro de testes e viram dois comandos documentados. O buraco não veio de análise — veio de tentar rodar o jogo ponta a ponta e o script de operador da SPEC-037 falhar com SQL cru por falta de mundo. As decisões que importam: o operador escreve uma **data** (o script traduz via o `resolveSlot` do engine, sem reimplementar fuso), o `seasonId` é **derivado** do mundo, e semear **nunca sobrescreve** — a operação mais destrutiva do projeto não cabe num typo de terminal.*
