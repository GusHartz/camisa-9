# SPEC-020 — Entrada por substituição de NPC: o humano ocupa a vaga no mundo (fatia gênese)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-020 |
| **Feature** | Entrada por substituição de NPC — card do board (card 21) |
| **Slug** | entrada-por-substituicao-de-npc |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.1 — a costura `player-store` ↔ `world-store`; o keystone da Fase 1. |
| **Appetite** | **2 a 3 dias**. |
| **Prioridade** | ALTA — é a tese do projeto virando código: *"nasce 100% NPC; cada humano substitui um NPC"*. |
| **Criada em** | 2026-07-16 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-16) — leia antes de aprovar

1. **Escopo = fatia GÊNESE (peças 1–4 do card).** O humano ocupa uma vaga NPC no tier-4 **antes do round 1** da temporada; aparece no elenco ao ler o mundo, entra no `clubStrength` e joga a temporada. **Fora desta fatia:** imunidade do humano na viragem (peça 5 — pega carona na Fatia 3 da 0.2, quando a viragem for persistida) e entrar num mundo **mid-season** (peça 6 — depende do congelamento do plano da temporada). **Consequência aceita:** o engine puro determinístico **não é tocado** → **nenhum golden regenerado**.
2. **Vínculo = tabela-overlay autoritativa `world_occupation`.** A verdade de *"o humano X ocupa esta vaga"* mora numa tabela nova (re-aplicável por replay). A **linha do atleta** carrega `name`/`ability`/`is_human` como **cache derivada**. Isso **evolui** o invariante "snapshot é cache" de forma explícita (ver §Evolução de invariante).
3. **Mapa focos→`ability` = o `overall` existente (média plana).** `ability = Math.floor(soma dos 4 focos / 4)` — exatamente o `overall` que o store já reporta (training-repo.ts:159). Recém-criado → **34** (piso do tier-4, já calibrado). A **posição entra como parâmetro não-usado** (gancho para ponderação futura, sem churn de callers). Os **4 focos crus ficam preservados** em `player.athlete` para o futuro engine de lances ("Eventos de escolha em partida").
4. **Costura num serviço novo `services/world-entry`.** Sem transação cross-schema: o `ability` é uma **foto congelada** no momento da ocupação. Fluxo: **ler `player.athlete`** → **projetar** focos→`ability` (puro) → **transação só-no-mundo** (achar a vaga NPC `FOR UPDATE`, `UPDATE` da linha, `INSERT` no overlay). `world-store` continua dono só do schema do mundo; `packages/player` ganha o `abilityFromFocos` puro.

---

## Evolução de invariante (aprovada pelo founder — obrigatório registrar)

O `memory/MEMORY.md` (memória durável do projeto) grava dois invariantes que esta SPEC **evolui deliberadamente**:

- **"Snapshot é cache; seed é a fonte-da-verdade"** — hoje o mundo inteiro é derivável do seed por replay. **Um humano NÃO é derivável do seed** — é dado autoritativo. Evolução: *"seed = fonte-da-verdade dos NPCs; `world_occupation` = fonte-da-verdade dos humanos; **seed + ocupações = replayável**."* A tabela-overlay é justamente o que mantém o mundo reconstruível (re-semear NPCs + re-aplicar ocupações). A `strength` **continua** nunca persistida (derivada de `clubStrength`).
- **"Snapshot imutável dentro da temporada (re-simulação a cada tick)"** — o `runDailyRound` re-simula a temporada a cada tick. Ocupar **mid-season** reescreveria rounds já publicados. **Preservado**, não violado: esta fatia só permite ocupar na **gênese** (antes de qualquer `published_round` da temporada). A ocupação mid-season fica explicitamente FORA (depende do congelamento de plano).

Ambas as evoluções foram co-desenhadas e aprovadas. Após o merge, o H1VE regenera a memória do projeto; se necessário, a decisão fica registrada no DONE-020.

---

## Objetivo

Fechar a costura que coloca o **atleta humano** (que vive em `services/player-store`) **dentro do mundo NPC persistido** (`services/world-store`). Ao fim desta fatia, um humano ocupa a vaga de um NPC num clube da **divisão de entrada** (tier-4), e **ler o mundo mostra o humano no elenco** — com o `name` dele, o `ability` derivado dos focos, participando do `clubStrength` e da simulação da temporada. Tudo determinístico, atômico e sem tocar o engine puro nem os goldens.

---

## Contexto e motivação

O charter promete *"o atleta vive no servidor"*, mas hoje o humano **literalmente não está no mundo**: `player-store` (conta/atleta/treino/quinteto) e `world-store` (pirâmide NPC/rodadas/temporadas) são maduros e **isolados** — falta a ponte. Este é o card 21, o keystone da Fase 1.

**Fatos verificados (varredura do repo, branch atual sobre `main`):**

- **Engine puro** — `packages/world-engine/src/types.ts:71`: o NPC é `Athlete { id, name, age, ability, position }`. `ability` é **escalar único** 0..100; `clubStrength` (`engine/roster.ts:8`) = **média inteira das 11 melhores** `ability` (`strengthTopN: 11`). O engine **nunca lê focos individuais**; a partida é força-de-clube.
- **Posições idênticas** — humano (`packages/player/src/types.ts:7`) e engine (`packages/world-engine/src/types.ts:61`) são o **mesmo union** `'GK'|'DEF'|'MID'|'FWD'`. Zero tradução. `WORLD.squadShape = {GK:2,DEF:5,MID:5,FWD:4}` (≥2 de cada posição por elenco).
- **Snapshot** — `services/world-store/src/schema/world.ts:66`: `athlete { worldSeed, clubId, id, ord, name, age, ability, position }`, PK `(world_seed, id)`, FK→club, `id` é `text` (aceita uuid). Schema Postgres `public`. O mapper `rowToAthlete` (`mapping/world-mapper.ts:131`) produz **exatamente** o `Athlete` do engine — logo, escrever `name`/`ability` na linha faz o humano aparecer no elenco **sem tocar o mapper**. `strength` recomputada na leitura, nunca lida.
- **"Imutável" concretamente** — o `world-repo` só faz **INSERT em massa**; **não há UPDATE/DELETE de linha de atleta em produção** (só em testes). Ocupar exige o **primeiro caminho de mutação** do snapshot.
- **Atleta humano** — `services/player-store/src/schema/athlete.ts`: 4 focos `int 0..99` (CHECK), `position text`, `active`, uuid PK; schema `player`. O `overall` é `Math.floor(soma/4)` (`training-repo.ts:159`) — recém-criado = 34.
- **Calibração** — `WORLD.abilityByTier[3] = {min:34, max:66}` (tier-4, entrada). Overall-34 = **piso exato** da banda de entrada (`attributes.test.ts:50` já assere isso).
- **Mesmo Postgres, schemas distintos** — `public` (mundo) e `player` (humano), um único `DATABASE_URL`, `pg.Pool` idênticos: read de `player.athlete` e write em `public.*` convivem no mesmo banco.
- **Viragem não persistida** — `runDailyRound` para em `season_complete` **sem virar** (seam da Fatia 3). **Nada corrompe o humano hoje** → a imunidade na viragem pode ser adiada.
- **Migrations do world-store** — `0000`/`0001`/`0002`; a próxima é `0003`.

---

## Escopo — o que está DENTRO

**A) Lib pura `packages/player` — a projeção focos→`ability`:**
- [ ] `ability.ts` (novo):
  - `overall(attributes): number` — `Math.floor(soma dos 4 focos / FOCI.length)`. **Extraído** da lógica hoje inline em `training-repo.toProgress` (fonte-da-verdade única do overall). Guardrail-safe (só `Math.floor`).
  - `abilityFromFocos(attributes, position): number` — v1 = `overall(attributes)`; `position` é **seam não-usado** (gancho de ponderação). Retorna inteiro 0..99.
- [ ] `index.ts` — exporta `overall`, `abilityFromFocos`.

**B) `services/player-store` — reuso + read de identidade:**
- [ ] `training-repo.ts` — `toProgress` passa a **reusar `overall()`** da lib (sem mudança de comportamento; os testes seguem verdes por construção).
- [ ] Um **read de identidade** reusável — `readAthleteIdentity(db, athleteId)` → `{ name, position, attributes, active } | null` (o que a costura precisa; sem senha/PII sensível). Exportado no `index.ts`.

**C) `services/world-store` — o snapshot ganha ocupação:**
- [ ] Schema + **migration aditiva `0003`** (OP-01):
  - `athlete` += **`is_human boolean NOT NULL DEFAULT false`** (cache: a linha marca que é humano).
  - **`world_occupation`** (autoridade): `(world_seed, athlete_id, human_athlete_id uuid, season_id, club_id, position, occupied_at)`. **PK `(world_seed, athlete_id)`** (uma ocupação por vaga do mundo) + **UNIQUE `(world_seed, human_athlete_id)`** (um humano ocupa ≤1 vaga por mundo) + FK `athlete_id`→`athlete`. `human_athlete_id` é **ref lógica** ao `player.athlete.id` (**sem FK dura** cross-schema — validada na borda, mesmo padrão de `position`).
- [ ] `occupation-repo.ts` (novo) — `occupyNpcSlot(db, { worldSeed, clubId, position, humanAthleteId, humanName, ability })`:
  - **transação só-no-mundo**: seleciona os NPCs de `(worldSeed, clubId, position)` **não-humanos** com **`FOR UPDATE`**, escolhe o de **menor `ability`** (empate → menor `ord`) = a vaga do mais fraco; se não houver → erro genérico (`'sem vaga NPC para a posição'`).
  - **guarda da gênese**: rejeita se a temporada já começou (existe `published_round` para `season_id = world.seasonId`) → erro genérico (`'temporada em andamento — entrada só na gênese'`). Honra a trava de re-simulação.
  - `UPDATE` da linha NPC: `name = humanName`, `ability = ability`, `is_human = true` — **preserva `id`/`ord`/`club_id`/`position`** (ordem canônica e forma do elenco intactas; `clubStrength`/read-back já o incluem). **`age` = herda a do NPC substituído** (modelo de idade do humano é fatia futura).
  - `INSERT` em `world_occupation` (autoridade). As UNIQUE constraints são a rede contra dupla-ocupação / dupla-entrada.
  - `readOccupation(db, worldSeed, humanAthleteId)` / helper de leitura para testes.
- [ ] `index.ts` — exporta `occupyNpcSlot`, `readOccupation`.

**D) `services/world-entry` (workspace novo) — a costura:**
- [ ] `@camisa-9/world-entry` (borda impura; typecheck-only, padrão `services/*`). `package.json` deps: `@camisa-9/world-store`, `@camisa-9/player-store`, `@camisa-9/player`.
- [ ] `enter-world.ts` — `enterWorld(db, { humanAthleteId, worldSeed, clubId })`:
  - `readAthleteIdentity` → se ausente/inativo, erro genérico.
  - `ability = abilityFromFocos(attributes, position)`.
  - `occupyNpcSlot(db, { worldSeed, clubId, position, humanAthleteId, humanName: name, ability })`.
  - devolve o resumo da ocupação (`{ worldAthleteId, clubId, position, ability }`).
- [ ] `index.ts` — exporta `enterWorld`.

**E) Config/CI:**
- [ ] `tsconfig.typecheck.json` — inclui `services/world-entry` (fora do `tsc -b`, padrão da memória `services-typecheck-only`).
- [ ] CI: o passo de migrate do world-store já aplica `0003`; `world-entry` não tem migration própria. Confirmar que os testes ao vivo do novo workspace rodam sob o vitest existente (serial, `fileParallelism:false`).

**F) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA

- **Imunidade do humano na viragem** (envelhecer/aposentar/transferir/repor) — nada persiste viragem hoje; co-entregue com a **Fatia 3 da 0.2**.
- **Entrar num mundo mid-season** — depende do **congelamento do plano da temporada**; fatia própria de 1.2.
- **Ponderação por posição** no `abilityFromFocos` — seam presente, peso adiado (design record).
- **Escassez / waiting-list / furar-a-fila / fundar clube / seleção automática de clube** — o `clubId` alvo é **input** desta fatia (ops/futura rota decide qual). A Pirâmide Elástica (R13) é a Fatia 5.
- **Modelo de idade do humano no mundo** — herda a idade do NPC por ora.
- **Rota HTTP / login / Steam auth / sincronizar ganhos de treino no mundo** (a re-baker de `ability` na virada) — fatias futuras.
- **Engine puro `world-engine` intocado; nenhum golden regenerado.**

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/ability.ts` | criar — `overall` + `abilityFromFocos` (puros). |
| `packages/player/src/ability.test.ts` | criar — testes puros (overall=34 na criação, floor, seam de posição). |
| `packages/player/src/index.ts` | editar — exportar as 2 funções. |
| `services/player-store/src/store/training-repo.ts` | editar — `toProgress` reusa `overall()` (sem mudança de comportamento). |
| `services/player-store/src/store/*` (+ `index.ts`) | editar/criar — `readAthleteIdentity`. |
| `services/world-store/src/schema/world.ts` | editar — `athlete.is_human` + tabela `world_occupation`. |
| `services/world-store/src/migrations/0003_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/world-store/src/store/occupation-repo.ts` | criar — `occupyNpcSlot` + `readOccupation`. |
| `services/world-store/src/index.ts` | editar — reexports. |
| `services/world-store/test/occupation-repo.test.ts` | criar — testes ao vivo. |
| `services/world-entry/**` | criar — workspace (package.json, tsconfig, src, test). |
| `tsconfig.typecheck.json` | editar — incluir `services/world-entry`. |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — status card 21 + Estado atual. |
| `specs/SPEC-020-*.md`, `specs/DONE-020-*.md` | criar. |

**Intocado:** `packages/world-engine` (engine puro), todos os goldens (`season`/`prng`/`anchor`/`world`), migrations `0000`/`0001`/`0002`, o mapper `world-mapper.ts`.

---

## Critérios de aceitação

1. **O humano aparece no elenco (o "aha"):** após `enterWorld`, `readWorld(seed)` traz o humano no `roster` do clube alvo — com o `name` dele, `ability = overall(focos)`, na `position` escolhida, **preservando** `ord`/tamanho do elenco (16). Testado ao vivo.
2. **Projeção correta e calibrada:** `abilityFromFocos(attrs, pos) === overall(attrs) === Math.floor(soma/4)`; recém-criado (soma 136) → 34 = piso do tier-4. `position` não altera o resultado em v1. Testado puro.
3. **Participa da força e da simulação:** o `clubStrength` do clube recomputado inclui a `ability` do humano; `simulateWorldSeason(readWorld(seed), seed)` roda **determinístico** com o humano presente (mesmo resultado em duas leituras). Testado ao vivo.
4. **Vínculo autoritativo + cache:** `world_occupation` grava `(world_seed, athlete_id, human_athlete_id, season_id, club_id, position)`; a linha do atleta fica com `is_human = true`. `readOccupation` reconcilia. Testado ao vivo.
5. **Guarda da gênese (trava de re-simulação):** ocupar com a temporada já em andamento (existe `published_round` para o `season_id`) → **rejeitado** com erro genérico, **nada** escrito. Testado ao vivo.
6. **Integridade / concorrência / atomicidade:** `FOR UPDATE` serializa duas ocupações concorrentes na mesma vaga; a UNIQUE `(world_seed, human_athlete_id)` barra dupla-entrada e a PK `(world_seed, athlete_id)` barra dupla-ocupação; qualquer falha → **ROLLBACK** total (sem linha meio-escrita, sem `is_human` órfão). Testado ao vivo (incl. `Promise.allSettled` de duas entradas → exatamente uma vence).
7. **Sem regressão do determinismo:** `world-engine` e todos os goldens **intocados** (`git diff` = 0); os 207 testes preexistentes seguem verdes; o mapper não muda.
8. **OPs & gates:** sem `any` (OP-14); funções ≤50 (OP-15); arquivos ≤300 (OP-16); erros genéricos sem SQL/stack (OP-11); migration aditiva (OP-01); regra de negócio nas libs/serviços, não em UI (OP-17); guardrail verde (projeção inteira); `lint`/`typecheck`/`build`/`test` verdes; ao vivo serial + limpeza em ordem de FK.

---

## Segurança

- **Autoridade server-side:** a projeção focos→`ability`, a escolha da vaga (mais fraco) e a guarda da gênese são decididas no servidor (lib+serviço). O cliente nunca injeta `ability`.
- **OP-11:** atleta inexistente/inativo, sem vaga na posição, temporada em andamento, dupla-entrada → **classe genérica**, sem SQL/DSN/stack. `human_athlete_id` sem FK dura (ref lógica) — a existência do humano é garantida pelo read de identidade antes do INSERT.
- **OP-09 (quando virar rota):** esta fatia é serviço puro (sem HTTP); a ordem auth→authz→input fica para a rota futura. Registrado.
- **OP-02/OP-12:** nenhum segredo novo.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Quebrar o determinismo do mundo** (o coração golden) | O engine puro **não é tocado**; a mutação vive só no `world-store`. Ocupar na gênese mantém a re-simulação estável (o humano está desde o round 1). `git diff` dos 4 goldens = 0 é critério. |
| **Snapshot deixa de ser "cache puro"** | Evolução **explícita e aprovada** (overlay autoritativo re-aplicável); registrada em §Evolução de invariante e no DONE. |
| **Ocupar mid-season reescreveria rounds publicados** | Guarda da gênese (rejeita se há `published_round` na temporada). Mid-season é FORA de escopo. |
| **Humano varrido pela viragem** (envelhecido/aposentado como NPC) | Nenhuma viragem é persistida hoje (`daily-round` para em `season_complete`). A imunidade (`is_human`) é co-entregue com a Fatia 3 — o flag já é plantado nesta fatia. |
| **Corrida por uma vaga** | `FOR UPDATE` na seleção do NPC + UNIQUE `(world_seed, human_athlete_id)` + PK `(world_seed, athlete_id)`. Testado com concorrência. |
| **Novo workspace fora do `tsc -b`** | Segue o padrão `services-typecheck-only` (tsconfig.typecheck.json); memória registrada. |
| **Lint local por CRLF (Windows)** | Não é regressão; validar LF antes do push (memória). |

**Dependências:** SPEC-013/014/015 (world-store + snapshot + rodada), SPEC-016/017 (atleta humano + overall), SPEC-018 (identidade de time — o `clubId` de destino de um quinteto vem daqui em fatia futura). **Precede:** imunidade na viragem (Fatia 3), mid-season (congelamento de plano), waiting-list/escassez, rota HTTP.

---

## Notas de implementação

- **Nada de transação cross-schema:** o read de `player.athlete` é fonte de um **valor congelado** (o `ability` da temporada); só o lado do mundo é transacional. Se `enterWorld` falhar entre o read e o occupy, **nada** foi escrito (o occupy é atômico sozinho).
- **O humano é o `overall` no mundo:** amarrar `abilityFromFocos` ao mesmo `Math.floor(soma/4)` do store evita divergência de 1 ponto entre a UI e o mundo. Extrair `overall()` para a lib pura remove a duplicação (store passa a reusar).
- **Preservar `id`/`ord`/`club_id`/`position` na linha ocupada** é o que mantém o mapper e o `clubStrength` funcionando sem edição — o humano é "o NPC daquela vaga, agora com outro nome e força".
- **`is_human` é plantado agora, consumido depois:** a imunidade na viragem (Fatia 3) vai ler esse flag; nesta fatia ele só marca a linha (cache do overlay).
- **Guarda da gênese** = `SELECT 1 FROM published_round WHERE season_id = :seasonId LIMIT 1`. Presença ⇒ temporada iniciada ⇒ rejeita.
- **Escolha da vaga** = NPC de menor `ability` na posição (empate → menor `ord`), determinístico. Substituir o mais fraco é temático e estável.
- **Fecho do DONE:** atualizar "Estado atual" do CLAUDE.md (SPEC-020, e flipar SPEC-019 → "Mergeado PR #22") + `roadmap.md` (card 21 / item 2.1).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (gênese; imunidade/mid-season/escassez/HTTP fora)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva `0003` — OP-01)
- [x] Critérios de aceitação testáveis (aparece no elenco, projeção, força/sim, vínculo, guarda gênese, concorrência, goldens intactos)
- [x] Riscos avaliados (determinismo, invariante, mid-season, viragem, corrida)
- [x] Decisões co-desenhadas registradas (as 4 do founder) + evolução de invariante aprovada
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-020 — método H1VE. A costura `player-store` ↔ `world-store`: o humano ocupa a vaga de um NPC na entrada e passa a existir no mundo. Fatia gênese — o payoff inteiro com o engine determinístico intocado (nenhum golden regenerado). O `ability` é o `overall`; os focos crus ficam preservados para o engine de lances. Overlay autoritativo evolui "snapshot é cache" de forma explícita e replayável.*
