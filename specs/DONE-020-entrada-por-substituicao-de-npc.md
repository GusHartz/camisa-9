# DONE-020 — Entrada por substituição de NPC: o humano ocupa a vaga no mundo (fatia gênese)

> Fecho da SPEC-020. A costura `player-store` ↔ `world-store` — o keystone da Fase 1 — está de pé:
> um atleta humano ocupa a vaga de um NPC na divisão de entrada e passa a existir no mundo vivo.

---

## O que foi entregue

A primeira vez que a identidade humana e o mundo NPC se tocam. Um humano (conta+atleta do `player-store`) ocupa a vaga do NPC **mais fraco** de uma posição num clube da **divisão de entrada** (tier-4), e **ler o mundo mostra o humano no elenco** — com o nome dele, o `ability` derivado dos focos, participando do `clubStrength` e da simulação da temporada. Determinístico, atômico, e **sem tocar o engine puro nem os goldens**.

### A) Lib pura `packages/player` — a projeção focos→`ability`
- **`ability.ts` (novo):** `overall(attributes)` = `Math.floor(soma/4)` (fonte-da-verdade única do overall, **extraída** do `training-repo`); `abilityFromFocos(attributes, position)` = média ponderada com **pesos NEUTROS por posição** (`ABILITY.positionWeights`, todos 1 ⇒ idêntico ao overall plano). A posição é um **seam wired-neutro** (mesmo padrão de `TRAINING.focusMultPct`), não um parâmetro morto — a ponderação futura entra sem churn de callers. PURO (guardrail: só `Math.floor`).
- **`constants.ts`:** bloco `ABILITY` (tunável).
- **`index.ts`:** exporta `overall`, `abilityFromFocos`.

### B) `services/player-store` — reuso + read de identidade
- **`training-repo.ts`:** `toProgress` passa a **reusar `overall()`** da lib (zero mudança de comportamento; os 168 testes seguem verdes por construção).
- **`player-repo.ts`:** `readAthleteIdentity(db, athleteId)` → `{ name, position, attributes, active }` (o que a costura precisa; sem PII sensível). Exportado.

### C) `services/world-store` — o snapshot ganha ocupação (o primeiro caminho de MUTAÇÃO)
- **Schema + migration aditiva `0003` (OP-01):** `athlete` += `is_human boolean NOT NULL DEFAULT false` (cache); tabela **`world_occupation`** (autoridade) = `(world_seed, athlete_id, human_athlete_id, season_id, club_id, position, human_name, ability, occupied_at)`, **PK `(world_seed, athlete_id)`** + **UNIQUE `(world_seed, human_athlete_id)`** + FK `athlete_id`→`athlete`. `human_athlete_id` é ref lógica ao `player.athlete.id` (sem FK cross-schema). **`human_name` + `ability` congelados** moram no overlay (fix da revisão — ver abaixo).
- **`occupation-repo.ts` (novo):** `occupyNpcSlot` = transação só-no-mundo que (1) toma um **advisory lock COMPARTILHADO** `world:${seasonId}:1` (rendezvous com o `publishWorldRound`), (2) **guarda da gênese** (rejeita se a temporada já publicou rodada), (3) **guarda de tier** (`assertEntryClub` — só a divisão de entrada, autoridade server-side), (4) trava o NPC mais fraco da posição (`FOR UPDATE`, empate → menor `ord`), (5) grava o humano na linha (`name`/`ability`/`is_human`) + o vínculo congelado no overlay. Erros **genéricos** (OP-11) via `OccupyError`. `readOccupation` reconstrói. Exportados.

### D) `services/world-entry` (workspace novo) — a costura
- **`@camisa-9/world-entry`** (borda impura, typecheck-only): `enterWorld(worldDb, playerDb, input)` — lê a identidade (player), **projeta** focos→`ability` (puro), **ocupa** (world, transacional). **Sem transação cross-schema**: o `ability` é foto congelada da temporada; o read do player e o write no mundo são operações separadas sobre o mesmo Postgres. `isPosition` guarda o `position` cru vindo da coluna `text`.

### E) Config/CI
- `tsconfig.base.json`: `paths` p/ `@camisa-9/world-store` e `@camisa-9/player-store` (a costura os importa). `vitest.config.ts`: aliases dos dois stores → `src`. `services/world-entry` entra no gate de tipos pelo glob `services/*` existente (nenhuma edição no `tsconfig.typecheck.json`). CI sem mudança: o migrate do world-store aplica `0003`.
- **Higiene de FK entre suítes:** `round-trip.test`/`daily-round.test` passam a apagar `world_occupation` **antes** de `athlete` (a nova FK) — o padrão "filho antes de pai" da memória.

---

## Decisões (co-desenhadas com o founder) e evolução de invariante

As 4 decisões da SPEC entregues à letra: **gênese** (engine intocado, nenhum golden regenerado), **overlay autoritativo**, **`abilityFromFocos` = o overall**, **serviço `world-entry`**.

**Evolução de invariante (aprovada):** "snapshot é cache; seed é a fonte-da-verdade" evolui para *"seed = fonte dos NPCs; `world_occupation` = fonte dos humanos; seed + ocupações = replayável"*. A revisão pegou que a claim só é **honesta** se o overlay carregar os valores congelados (o `ability` deriva dos focos **mutáveis** do treino, logo não é recuperável do player depois) — por isso `human_name` + `ability` foram para o overlay. `strength` segue nunca persistida.

---

## Revisão adversarial (3 dimensões · 3 agentes · verificação de cada achado)

- **Correção & concorrência:** `FOR UPDATE` **confirmado correto** (self-filtering do EPQ via `is_human` elimina a vaga recém-tomada → sem double-book/deadlock/lost-update); atomicidade UPDATE→rollback **sólida**; determinismo pós-mutação **preservado** (id/ord/club/position/age intactos). **1 MAJOR: TOCTOU** da gênese.
- **OPs / invariante / determinismo:** OP-11/14/15/16/17/01 + guardrail **conformes**. **1 MAJOR: 6.1** (overlay não persistia os valores congelados → replayability desonesta).
- **Cobertura:** 8 lacunas (empate de ability, `active=false`, ability-derivado, `isPosition`, gênese cross-season, mundo inexistente, clube, filtro `is_human`).

**Achados endereçados:**
- **MAJOR 6.1 → FIX:** `human_name` + `ability` congelados no `world_occupation` (overlay autossuficiente; migration `0003` regenerada). Teste novo prova o round-trip.
- **MAJOR TOCTOU (cross-verificado pelos 2 revisores) → FIX:** advisory lock **compartilhado** `world:${seasonId}:1` na ocupação (mesmo namespace do `publishWorldRound` exclusivo) — ocupações seguem concorrentes entre si; a publicação da rodada que abre a temporada serializa contra elas. Fecha a corrida sem serializar o beta. Teste novo (`Promise.race`) prova o bloqueio.
- **Autoridade de tier-4 (menor→maior com a rota) → FIX:** `assertEntryClub` no servidor (não confia num `clubId` da rota futura, OP-09).
- **+10 testes** (frozen values, mundo inexistente, gênese cross-season, empate→ord, tier fora/clube inexistente, TOCTOU, `active=false`, `isPosition`, ability-derivado).

**Aceitos como registro (não-bug / fora desta fatia):** o `catch` genérico achata erros retryable (nit, OP-11-coerente); reads não mascaram erro de infra pg (consistente com todo o repo, sem HTTP ainda); janela `active`-stale entre read e occupy (menor, sem consumidor, fluxo de desativação não ligado); vaga não liberada no fim de carreira (débito futuro); idade herdada do NPC (latente p/ Fatia 3 — o flag `is_human` já plantado para a imunidade).

---

## Gates

- **235/235 testes** (207 preservados + 28 novos: 5 puros de `ability`, 16 de `occupation-repo`, 7 da costura `enter-world`); **151 sem `DATABASE_URL`** (os ao vivo são `skipIf`). Estável em runs repetidos.
- `typecheck` · `eslint` (OP-14/15/16 + guardrail) · `build` · `prettier` (LF-clean) — **verdes**.
- `packages/world-engine` e os **4 goldens** (`season`/`prng`/`anchor`/`world`) **intocados** (`git diff` = 0). Migration `0003` **puramente aditiva** (backfill seguro).
- **Desvio de mecanismo** (não de produto): a costura usa **dois handles** (`worldDb`+`playerDb`) sobre o mesmo Postgres em vez de um handle cross-schema — evita o mismatch de generics do Drizzle sem `any`, e é honesto (não há transação cross-schema por design).

---

## Escopo deferido (inalterado)

Imunidade do humano na **viragem** (Fatia 3 — o flag `is_human` já está plantado) · entrar **mid-season** (congelamento do plano da temporada) · **ponderação por posição** (seam neutro presente) · **waiting-list / escassez / fundar clube / seleção automática de clube** · **rota HTTP / login / Steam auth / re-baker de `ability` na virada** · **modelo de idade** do humano · liberação de vaga no fim de carreira.

---

*DONE-020 — método H1VE. O primeiro humano entra no mundo. `player-store` e `world-engine` seguem isolados e puros; a costura vive na borda (`world-entry` + `world-store`). Overlay autoritativo com valores congelados (replay honesto), TOCTOU fechado por lock compartilhado, autoridade de tier no servidor. Engine determinístico intocado, nenhum golden regenerado.*
