# SPEC-022 — Regen: renascimento de carreira + Hall of Fame

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-022 |
| **Feature** | Regen — card do board |
| **Slug** | regen |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 4.2 (Carreira com fim + hall de lendas). Assenta sobre a imunidade da SPEC-021. |
| **Appetite** | **3 a 4 dias** (a maior fatia até aqui — 2 schemas + borda + primitiva pura + orquestração cross-schema). |
| **Prioridade** | ALTA — é o **gancho de FOMO/compra** e fecha o arco "da várzea às lendas". |
| **Criada em** | 2026-07-17 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-17)

1. **Gatilho por IDADE, com escolha do jogador + teto forçado.** O humano **entra sempre aos 17** (`WORLD.youthAge` — **corrige a SPEC-020**, que herdava a idade do NPC como decisão provisória de implementação, não do founder). Envelhece +1/temporada (imune, SPEC-021). Pode **regenerar por escolha a partir dos 25** (não força aposentadoria precoce) e é **forçado aos 42**. Os 3 números (17/25/42) são tunáveis.
2. **Reset + banco de pontos de LEGADO.** O renascido nasce **jovem** (`allocateAttributes` fresco — soma 136, overall 34) **mais** um banco de pontos livres de largada = `floor(pontos ganhos na carreira anterior × LEGACY_PCT)` (default 25%). Quanto mais longa/bem-treinada a carreira, mais forte o herdeiro começa — o FOMO. Tunável.
3. **Hall of Fame.** A carreira antiga é **congelada** na tabela `legend` (nome, clube, ability/idade finais, temporada, métrica de legado). O **nome antigo vira lenda permanente**; o renascido ganha **nome novo**.
4. **Identidade:** o atleta antigo vira `active=false` (a lenda, preservada); nasce um **atleta novo ativo** na mesma conta (o índice parcial `athlete_one_active_per_account` já suporta N inativos + 1 ativo).
5. **Gate de compra = SEAM neutro.** `canRegen()` default **permitido/grátis** (molde dos seams de DLC/idade do treino) — o mecanismo não trava esperando a decisão de preço.
6. **Resolvido na VIRADA (decouple do rollover).** O Regen roda como um **passo pós-virada** (o mundo já sobrescreveu e a temporada nova nasce em gênese, deixando o renascido re-ocupar o clube). A viragem da SPEC-021 fica **intocada**.

---

## Objetivo

Fechar o ciclo de vida do atleta humano: quando a carreira termina (idade ≥42, ou por escolha ≥25), o atleta **renasce no mesmo clube** com atributos reajustados (reset + banco de legado) e **nome novo**, e a carreira antiga vira **lenda permanente** no Hall of Fame. É o gancho de conversão (a *Carreira* vitalícia) — implementado com o **paywall como seam**.

---

## Contexto e motivação (fatos verificados no repo)

- **A fundação está pronta (SPEC-020/021):** o humano é um ser persistente e imortal no mundo — `world_occupation` (autoridade da vaga, com `human_name`/`ability` congelados), `athlete.is_human` (cache), e `ageAndRetire` (`lifecycle.ts:22-23`) que envelhece o imune +1/temporada mas **nunca o aposenta**. As primitivas puras existem: `allocateAttributes` (soma 136 → overall 34, `attributes.ts:11`), `pointsEarnedTotal` (`soma−136+freePoints`, `training.ts:12`), `applyPoint`, `abilityFromFocos`. O padrão de **seam neutro** (`TRAINING.speedMultiplierPct` etc.) é idiomático.
- **A entrada herda a idade do NPC (a corrigir):** `occupyNpcSlot` (`occupation-repo.ts:48-51`) grava só `name`/`ability`/`is_human` na vaga do NPC mais fraco → o humano **herda a `age` do NPC**. Precisa passar a gravar `age = WORLD.youthAge` (17) para o relógio de carreira 25/42 fazer sentido igual para todos.
- **Nada de carreira/lenda existe:** grep amplo — zero `legend`/`hall of fame`/`regen`/`retire` aplicável ao humano (só `ageAndRetire` de NPC + os `harness/regen-*golden` de fixtures). O único registro durável (`turnover_report`) guarda só diff de NPC; o humano imune **nunca aparece** nele.
- **O reset é natural:** o índice parcial `athlete_one_active_per_account` (`player-store athlete.ts:51`) já permite N atletas inativos + 1 ativo; `insertAthlete(tx, accountId, draft, opts)` (SPEC-018, exportado) cria um atleta numa conta existente.
- **A re-ocupação passa em gênese pós-virada:** `occupyNpcSlot` rejeita se a temporada publicou rodada (`assertGenesis`) — logo o renascimento tem de rodar **na janela pós-virada** (temporada nova, sem rodada publicada), onde a re-ocupação passa.
- **Sem monetização real:** grep — zero `paid`/`purchase`/`steam`/`entitlement`. O gate é seam novo.

---

## Escopo — o que está DENTRO

**A) Lib pura `packages/player` — o legado (determinística):**
- [ ] `regen.ts` (novo): `regenLegacyPoints(oldPointsEarned): number` = `floor(max(0, oldPointsEarned) × REGEN.legacyPct / 100)` (inteira, guardrail-safe). Bloco `REGEN` tunável (`legacyPct: 25`). Exporta.
- [ ] Reusa `allocateAttributes` (reset) + `pointsEarnedTotal` (a métrica de legado). Sem novidade de atributo — o "reset+bônus" é `attributes` frescos + `free_points` = legado.

**B) `services/world-store` — Hall of Fame + gatilho + entrada corrigida:**
- [ ] `occupation-repo.ts`: `occupyNpcSlot` grava **`age: WORLD.youthAge`** (17) na vaga (corrige a herança de idade). `requestRegen(db, humanAthleteId)` — liga a flag de regen voluntário; **trava idade ≥ 25** (erro genérico se mais novo).
- [ ] Schema + **migration aditiva `0005`** (OP-01): tabela **`legend`** (`world_seed, human_athlete_id, season_ended, human_name, club_id, position, ability, age, legacy_points, created_at`; PK `(world_seed, human_athlete_id, season_ended)` — N lendas por humano ao longo dos renascimentos) + `world_occupation.regen_requested boolean NOT NULL DEFAULT false`.
- [ ] `legend-repo.ts` (novo): `archiveLegend` (INSERT), `readLegends(db, worldSeed)` (o Hall of Fame). `readRegenEligible(db, worldSeed)` — as ocupações que devem regenerar: **`age ≥ REGEN_FORCED` OU (`regen_requested` E `age ≥ REGEN_VOLUNTARY`)** (join `world_occupation`×`athlete` pela idade). Constantes `REGEN_AGE = { entry: 17, voluntary: 25, forced: 42 }`.

**C) `services/player-store` — o renascimento da identidade:**
- [ ] `rebirthAthlete(db, oldAthleteId, { newName, attributes, freePoints })` — transação: o atleta velho vira `active=false`; INSERT do atleta novo ativo (mesma conta, mesma `position`/`appearance`, `attributes` frescos, `free_points` = legado, `training_xp=0`, foco-streak zerado). Reusa `insertAthlete`. Idempotente (se já inativo → retorna o ativo existente). Devolve o novo `athleteId` + o `pointsEarnedTotal` antigo (p/ o legado).

**D) `services/regen` (workspace novo) — a costura do renascimento:**
- [ ] `@camisa-9/regen` (borda impura, typecheck-only). `runRegenPass(worldDb, playerDb, seed)` — pós-virada: `readRegenEligible` → para cada, `regenAthlete`. `canRegen(...)` **seam** (default `true`).
- [ ] `regenAthlete(worldDb, playerDb, seed, occupation)`: (1) lê o player velho + calcula `legacyPoints`; (2) `rebirthAthlete` (player) → novo atleta + nome novo; (3) `archiveLegend` + **remove a presença antiga** (delete `world_occupation` + `is_human=false` na vaga → reverte a NPC) num tx-mundo; (4) `occupyNpcSlot(novo humano, mesmo clubId)` — re-ocupa em gênese. **Idempotente por etapa** (best-effort; recuperável no próximo passe). Nome novo = gerado (auto); rename pelo jogador = futuro.

**E) Wiring (fora do tick puro):** o orquestrador (o futuro scheduler) chama `runRegenPass` **depois** de `runDailyRound` reportar `season_rolled`. O `daily-round` (só-mundo) fica intocado. Na fatia, `runRegenPass` é **testado direto**; o ponto de wiring é documentado.

**F) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA

- **Paywall real** (Steam/entitlement/cobrança) — `canRegen()` fica seam default-permitido.
- **UI de rename** (o jogador escolher o nome do renascido) — nome auto-gerado nesta fatia.
- **Wiring do scheduler de produção** — `runRegenPass` é callable; quem dispara é fatia de deploy.
- **Regen mid-season** — só na fronteira de temporada (a re-ocupação exige gênese).
- **Recuperação total pós-crash cross-schema** — a fatia é best-effort idempotente (retry no próximo passe); durabilidade transacional distribuída é débito honesto.
- **Traços de veterano / química / recordes ricos** — o Hall of Fame guarda o snapshot mínimo; enriquecer é futuro.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/regen.ts` (+ `constants.ts`, `index.ts`) | criar/editar — `regenLegacyPoints` + `REGEN.legacyPct`. |
| `packages/player/src/regen.test.ts` | criar — testes puros. |
| `services/world-store/src/store/occupation-repo.ts` | editar — `age: WORLD.youthAge` no occupy + `requestRegen`. |
| `services/world-store/src/schema/legend.ts` (+ barrel, `world.ts`) | criar/editar — tabela `legend` + `world_occupation.regen_requested`. |
| `services/world-store/src/migrations/0005_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/world-store/src/store/legend-repo.ts` (+ `index.ts`) | criar — `archiveLegend`/`readLegends`/`readRegenEligible`. |
| `services/world-store/test/legend-repo.test.ts` | criar — testes ao vivo. |
| `services/player-store/src/store/player-repo.ts` (+ `index.ts`) | editar — `rebirthAthlete`. |
| `services/player-store/test/*.test.ts` | criar/editar — `rebirthAthlete`. |
| `services/regen/**` | criar — workspace (`runRegenPass`/`regenAthlete`/`canRegen` seam + testes). |
| `tsconfig.base.json`, `vitest.config.ts` | editar — paths/aliases do `@camisa-9/regen` (+ `player-store`/`world-store` já existem). |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 4.2 + flip SPEC-021 → PR #24. |
| `specs/SPEC-022-*.md`, `specs/DONE-022-*.md` | criar. |

**Intocado:** `packages/world-engine` (engine puro) e todos os goldens; a viragem `turnover-repo`/`daily-round` da SPEC-021 (o Regen é pós-virada, decouple).

---

## Critérios de aceitação

1. **Entrada aos 17:** após `occupyNpcSlot`, a `athlete.age` da vaga é **17** (não a do NPC). Testado ao vivo. (Ajusta os testes da SPEC-020 que assumiam a idade herdada.)
2. **Legado (puro):** `regenLegacyPoints(p)` = `floor(p × 25/100)`; `regenLegacyPoints(0)=0`; satura negativos. Testado puro.
3. **Elegibilidade:** `readRegenEligible` retorna exatamente as ocupações com `age ≥ 42` OU (`regen_requested` E `age ≥ 25`); ignora as demais. `requestRegen` rejeita idade < 25. Testado ao vivo.
4. **Renascimento (o loop):** após `regenAthlete`, (a) a carreira antiga está na `legend` (nome/clube/ability/idade/legacy); (b) o atleta velho no player-store é `active=false`; (c) há um atleta novo **ativo** na mesma conta, **nome novo**, atributos frescos (overall 34) + `free_points` = legado; (d) o novo humano **ocupa o MESMO clube** no mundo (idade 17, is_human=true). Testado ao vivo (costura).
5. **A vaga antiga reverte:** o `world_occupation` antigo some e a linha do atleta antigo volta a `is_human=false` (NPC). Testado ao vivo.
6. **Idempotência:** rodar `regenAthlete`/`runRegenPass` 2× → não duplica lenda nem cria 2 atletas ativos (a 2ª é no-op). Testado ao vivo.
7. **Seam de compra:** `canRegen()` default permite; um `canRegen` que nega **pula** o regen daquele humano sem erro. Testado.
8. **OPs & gates:** sem `any` (OP-14); ≤50 linhas/função (OP-15); ≤300/arquivo (OP-16); erros genéricos (OP-11); migration aditiva (OP-01); regra pura na lib / orquestração na borda (OP-17); guardrail verde (`regenLegacyPoints` inteira); `lint`/`typecheck`/`build`/`test` verdes; **engine e goldens intocados** (`git diff` = 0); ao vivo serial + limpeza em ordem de FK.

---

## Segurança

- **Autoridade server-side:** a elegibilidade (idade), o legado e o gate são decididos no servidor. `requestRegen` valida idade ≥ 25 no banco; o cliente nunca força um regen precoce nem injeta pontos.
- **OP-11:** atleta/ocupação inexistente, idade insuficiente, falha de costura → erro genérico, sem SQL/stack.
- **Atomicidade:** cada lado (player-store, world-store) é transacional; a costura cross-schema é sequencial best-effort idempotente (retry no próximo passe) — **não** há transação distribuída (padrão do projeto).
- **OP-02/OP-12:** o gate de compra é seam, sem segredo/PII novo.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Corrigir a idade de entrada quebra testes da SPEC-020** | Esperado e intencional (a idade herdada era provisória). Ajustar os asserts que dependiam dela; nenhum golden é tocado (idade do humano não entra no engine). |
| **Parcial cross-schema (player resetado, mundo não)** | Idempotência por etapa (checa `active`/lenda/ocupação existente) → o próximo passe completa. Débito de durabilidade distribuída documentado. |
| **Re-ocupação mid-season falharia (gênese)** | O regen só roda pós-virada (temporada nova, sem rodada publicada); `runRegenPass` é chamado após `season_rolled`. |
| **Loop de vaga (o renascido re-ocupa a vaga que acabou de reverter)** | `occupyNpcSlot` pega o NPC mais fraco do clube — pode ser a vaga revertida ou outra; correto de qualquer forma (mesmo clube). |
| **Monetização acoplada** | `canRegen()` seam default-permitido; a cobrança real é fatia futura, sem churn de callers. |

**Dependências:** SPEC-016/017 (atleta + `pointsEarnedTotal`), SPEC-018 (`insertAthlete`), SPEC-020 (`occupyNpcSlot`/`world_occupation`), SPEC-021 (imunidade — o humano chega vivo aos 42). **Precede:** paywall real, UI de rename, scheduler.

---

## Notas de implementação

- **A idade É o relógio de carreira** (uma vez que a entrada é 17): sobe +1/temporada pelo `ageAndRetire` imune (SPEC-021). Não precisa de contador de temporadas.
- **Decouple do rollover:** a SPEC-021 re-aplica TODAS as ocupações como imunes (o humano sobrevive mais uma virada); o `runRegenPass` roda **depois**, sobre a temporada nova (gênese), e é quem encerra/renasce. `daily-round`/`turnover-repo` ficam intocados.
- **Ordem do `regenAthlete`:** reset do player primeiro (novo atleta ativo), depois o mundo (archive + reverter vaga + re-ocupar) — se o mundo falhar, o player tem um ativo fora do mundo (recuperável: o passe re-ocupa).
- **Nome novo:** auto-gerado determinístico nesta fatia (reusa o gerador de nomes); o rename pelo jogador é UI futura. O nome ANTIGO fica na `legend`.
- **Fecho do DONE:** "Estado atual" (SPEC-022, flipar SPEC-021 → PR #24) + `roadmap.md` (4.2 — Regen ✅ 1ª fatia).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (loop completo; paywall/rename/scheduler/mid-season fora)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva `0005` — OP-01)
- [x] Critérios testáveis (entrada 17, legado, elegibilidade, renascimento, reverte vaga, idempotência, seam)
- [x] Riscos avaliados (idade/SPEC-020, parcial cross-schema, gênese, monetização)
- [x] Decisões co-desenhadas registradas (17/25/42, reset+legado, hall of fame, identidade, gate seam, decouple)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-022 — método H1VE. O fim vira começo: a carreira encerra (≥42, ou por escolha ≥25), o nome antigo vira lenda permanente no Hall of Fame, e o atleta renasce no mesmo clube — jovem (17), atributos resetados, mas com um banco de pontos de legado que recompensa a vida anterior. O gancho de FOMO com o paywall isolado num seam. Engine e goldens intocados; a viragem da SPEC-021 fica intocada (o Regen é pós-virada).*
