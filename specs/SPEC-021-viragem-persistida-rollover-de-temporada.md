# SPEC-021 — Viragem persistida (rollover de temporada) + imunidade do humano

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-021 |
| **Feature** | Viragem persistida (rollover de temporada) — card do board |
| **Slug** | viragem-persistida-rollover-de-temporada |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | Fatia 3 da 0.2 (rollover persistido) + fecha o seam `season_complete` da 1.2. |
| **Appetite** | **2 a 3 dias**. |
| **Prioridade** | ALTA — sem ela o mundo não vira; e é o par lógico da SPEC-020 (co-entrega a imunidade do humano). |
| **Criada em** | 2026-07-16 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-16)

1. **Imunidade = `immuneIds: ReadonlySet<athleteId>` como 4º arg de `advanceWorld`.** O engine ganha uma **lista de ids a pular** em aposentar/transferir — fala de **ids**, não de "humano" (domínio puro não acopla). O `world-store` deriva o set de `world_occupation` antes de virar. **Golden byte-idêntico** (no cenário do golden o set é vazio → o "pular" é no-op → stream do PRNG e JSON inalterados) — é **critério duro**. Descartadas: campo `Athlete.isHuman` (regenera golden) e re-aplicar na camada de dados (lossy — não salva humano aposentado/transferido).
2. **Escrita = overwrite in-place (DELETE+INSERT).** Uma temporada por seed: a virada apaga tiers/clubes/atletas/ocupações (ordem das FKs) e reinsere o novo `WorldState`, numa transação atômica. Alinha com "snapshot = cache do estado ATUAL"; a história é replayável (seed) + auditável (`turnover_report` + `published_round`).
3. **Destino do humano:** **sobrevive** à virada (imune à aposentadoria e a transferências), **sobe/desce com o clube** (a promoção move o clube inteiro e o humano vai junto — "da várzea às lendas"). Envelhece +1/temporada (cosmético); **não é varrido** como NPC. `assertEntryClub` (SPEC-020) segue guardando só ENTRADAS novas (gênese, tier-4); residência contínua em qualquer tier é livre.
4. **Regen = card FUTURO** (não este). O renascimento no mesmo clube + reajuste de atributos + o FOMO de compra é uma feature própria (ciclo de vida de carreira + monetização), que **assenta sobre** a imunidade desta fatia. **Nota registrada:** o Regen trocará o NOME do jogador ao renascer, para a carreira antiga permanecer num **Hall of Fame** ("lendas permanentes"). Vai ao roadmap.

---

## Objetivo

Fazer o mundo **virar e persistir** quando a temporada termina. Hoje `advanceWorld` (a viragem completa) roda **só em memória** no engine puro, e o tick diário para em `season_complete` **sem virar** (seam da Fatia 3). Ao fim desta fatia, quando a última rodada passa, o tick dispara a viragem **numa transação atômica** — promoção/rebaixamento, envelhecer, aposentar (≥35), transferências, base nova, `seasonId++` — **sobrescreve o snapshot**, grava o `turnover_report`, **re-aplica as ocupações humanas** e **semeia a nova âncora** de temporada. O **humano sobrevive** (imune); o **determinismo NPC fica intacto** (golden byte-idêntico).

---

## Contexto e motivação (fatos verificados no repo)

- **`advanceWorld`** (`packages/world-engine/src/engine/world-turnover.ts:20`): `(WorldState, WorldSeasonResult, seed) → WorldState` novo (imutável). Ordem canônica: promoção/rebaixamento (sem RNG) → `ageAndRetire` (envelhece+1, filtra `age≥35`; sem RNG) → `runTransfers` (RNG, 10 trocas/liga, mesma posição) → `refillYouth` (RNG, repõe déficit posicional com jovens 17) → `clubStrength` + `nextSeasonId`. O `turnoverReport` é **derivado à parte por diff** (`turnover-report.ts`), sem RNG.
- **O `Athlete` do engine NÃO tem `is_human`** (`types.ts:71`); o engine não tem conceito de humano (`grep human` = 0). `advanceWorld` aposenta por idade e transfere por sorteio — nenhuma noção de "protegido".
- **Golden:** `world.golden.json` = **11 hashes** de `JSON.stringify(WorldState)` (`world-hash.ts`), gerado por `seedWorld('decada')` + 10 viragens (`harness/regen-world-golden.ts`); travado em `world-turnover.test.ts`. **No cenário do golden não há humano** → um `immuneIds` vazio deixa o stream e o JSON byte-idênticos. Um **campo** em `Athlete` quebraria por serialização mesmo com zero humanos.
- **`readWorld` PERDE o humano:** `rowToAthlete` (`world-mapper.ts:131`) reconstrói o `Athlete` sem `is_human`. E `athleteToRow` **não escreve `is_human`** → um `read→advanceWorld→write` ingênuo trata o humano como NPC E zera o `is_human` no write. **Por isso a imunidade tem de entrar DENTRO da viragem** (via `immuneIds`) e as ocupações têm de ser **re-aplicadas** após o write.
- **`writeWorldState`** (`world-repo.ts:16`) só faz **INSERT** (PK de `world` é só a `seed`; sem `season_id`). Sobrescrever = **DELETE+INSERT** na ordem inversa das FKs (`world_occupation` → `athlete` → `club` → `league` → `world_tier`; `world` fica, só `UPDATE season_id`).
- **Seam:** `daily-round.ts:59` — `targetRound > roundsLength` → `season_complete`, hoje **não grava nada, não vira**. Teste que fixa o contrato atual: `daily-round.test.ts:132` (será atualizado).
- **Âncora:** uma temporada nova (`seasonId++`) precisa de nova `season(seed, novoSeasonId, novoStart)` (`schema/season.ts`) — senão o tick para em `sem_ancora`. O `novoStart` é **derivável**: `startAntigo + roundsLength + 1` (1 dia de descanso entre temporadas; 38 rodadas ≈ 6 semanas já têm folga).
- **SPEC-020:** o overlay `world_occupation` (autoridade dos humanos, com `human_name`/`ability` congelados) + `athlete.is_human` (cache) já existem. O comentário do schema já diz "a viragem (Fatia 3) vai ler este flag". A ocupação preserva o `athlete.id` e a `age` do NPC substituído.

---

## Escopo — o que está DENTRO

**A) Engine puro `packages/world-engine` — a imunidade por `immuneIds` (golden byte-idêntico):**
- [ ] `world-turnover.ts` — `advanceWorld(world, results, seed, immuneIds?: ReadonlySet<string>)` (4º arg **opcional**, default `new Set()`). Threaded a `turnLeague`.
- [ ] `lifecycle.ts` — `ageAndRetire` mantém `age≥35` **se `immuneIds.has(id)`** (o imune envelhece mas não aposenta). Sem RNG → não toca o stream.
- [ ] `transfers.ts` — `runTransfers` **não efetiva** um swap que envolva um id imune (guarda **no-op stream-preserving**: os saques do PRNG acontecem IDÊNTICOS; só o efeito do swap é suprimido). Com set vazio → nunca suprime → idêntico.
- [ ] `refillYouth` **não muda** (o imune sobrevive ao `ageAndRetire`, logo conta no elenco → não vira déficit; nenhum `immuneId` necessário aqui).
- [ ] `index.ts` — exporta `advanceWorld` + `buildTurnoverReport` se ainda não expostos.
- **Invariante:** `world.golden.json` **inalterado** (`git diff` = 0). Os testes do golden chamam `advanceWorld` com 3 args → set vazio → byte-idêntico.

**B) `services/world-store` — o rollover persistido:**
- [ ] `occupation-repo.ts` — `readWorldOccupations(db, seed)` (leitor em massa das ocupações de um mundo; hoje só existe o por-humano).
- [ ] Schema + **migration aditiva `0004`** (OP-01): tabela **`turnover_report`** (`world_seed, from_season_id, to_season_id, report jsonb, created_at`; PK `(world_seed, from_season_id)`) — o registro durável de cada viragem (retired/born/promoted/relegated/transferred), que o overwrite senão apagaria.
- [ ] `turnover-repo.ts` (novo) — `persistWorldTurnover(db, seed, results)`, numa ÚNICA transação:
  1. **advisory lock** de mundo (`world:rollover:${seed}:${seasonId}`) + **idempotência**: relê `world.season_id` sob o lock; se já avançou → `already_rolled` (no-op).
  2. `readWorld` + `readWorldOccupations` → deriva `immuneIds` (os `athlete_id` ocupados).
  3. `advanceWorld(world, results, seed, immuneIds)` + `buildTurnoverReport(before, after)`.
  4. **Overwrite:** `DELETE` de `world_occupation`/`athlete`/`club`/`league`/`world_tier` (ordem das FKs) → `UPDATE world SET season_id` → `INSERT` do novo `WorldState`.
  5. **Re-aplica ocupações:** para cada ocupação (o `athlete_id` do imune persiste — não foi aposentado/transferido), `UPDATE athlete SET is_human=true, name=human_name, ability=ability` + re-`INSERT` `world_occupation` com `season_id` novo (o `club_id` é estável — a promoção move o clube mas preserva o id). Assert de integridade se um `athlete_id` imune sumiu (não deve).
  6. `INSERT turnover_report`.
  7. `setSeasonAnchor(seed, novoSeasonId, novoStart)`.
- [ ] `index.ts` — exporta `persistWorldTurnover`, `readWorldOccupations`.

**C) Wire no tick — o rollover fica VIVO:**
- [ ] `daily-round.ts` — no seam `season_complete` (`targetRound > roundsLength`), em vez de só reportar, chama `persistWorldTurnover(db, seed, results)`; novo status `season_rolled` (o dia da virada é dia de descanso, sem partida). Falha → protocolo de falha (deferido, rollback total, sem mundo meio-virado). O `results` já está em mãos (`simulateWorldSeason`).

**D) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA

- **Regen** (renascimento de carreira + reajuste + FOMO + Hall of Fame) — card futuro dedicado; esta fatia é só a **sobrevivência**.
- **Re-baker do `ability`** do humano (projetar os ganhos de treino no `ability` do mundo na virada) — o `ability` congelado da SPEC-020 **permanece** através do rollover; a re-projeção é sub-fatia futura.
- **Encaixe da Copa** no calendário; **scheduler de produção** (o worker que dispara o tick) — fatias/deploy de 1.2.
- **Versionar o snapshot por `season_id`** (histórico completo no banco) — a decisão foi overwrite in-place.
- **Congelar a idade do humano** — decisão: a idade sobe normalmente (só a aposentadoria é suprimida).

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/world-engine/src/engine/world-turnover.ts` | editar — `immuneIds` opcional threaded. |
| `packages/world-engine/src/engine/lifecycle.ts` | editar — `ageAndRetire` respeita `immuneIds`. |
| `packages/world-engine/src/engine/transfers.ts` | editar — `runTransfers` suprime swap de imune (stream-preserving). |
| `packages/world-engine/src/index.ts` | editar — exportar `advanceWorld`/`buildTurnoverReport` se preciso. |
| `packages/world-engine/src/engine/world-turnover.test.ts` | editar — +testes de `immuneIds` (imune sobrevive; set vazio = idêntico). **Golden inalterado.** |
| `services/world-store/src/store/occupation-repo.ts` | editar — `readWorldOccupations`. |
| `services/world-store/src/schema/turnover.ts` (+ barrel) | criar — tabela `turnover_report`. |
| `services/world-store/src/migrations/0004_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/world-store/src/store/turnover-repo.ts` | criar — `persistWorldTurnover`. |
| `services/world-store/src/store/daily-round.ts` | editar — `season_complete` → dispara o rollover (`season_rolled`). |
| `services/world-store/src/index.ts` | editar — reexports. |
| `services/world-store/test/turnover-repo.test.ts` | criar — testes ao vivo. |
| `services/world-store/test/daily-round.test.ts` | editar — o `season_complete` agora VIRA (atualiza o teste do contrato antigo). |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — Fatia 3 + flip SPEC-020 → PR #23 + nota do Regen/Hall of Fame. |
| `specs/SPEC-021-*.md`, `specs/DONE-021-*.md` | criar. |

**Intocado:** `world.golden.json` e os demais goldens (`season`/`prng`/`anchor`), o mapper `world-mapper.ts`, `promotion.ts` (promoção já move o clube inteiro — o humano vai junto de graça).

---

## Critérios de aceitação

1. **Golden byte-idêntico (o critério DURO):** `world.golden.json` **inalterado** (`git diff` = 0); os testes do golden (11 hashes) seguem verdes chamando `advanceWorld` com 3 args (set vazio). Prova que a imunidade não tocou o stream determinístico.
2. **O mundo VIRA e persiste:** após `persistWorldTurnover`, `readWorld(seed)` traz `season_id` incrementado, a pirâmide virada (promoção/rebaixamento aplicados, jovens 17 na base, aposentados fora), e a nova âncora `season` semeada. Testado ao vivo.
3. **Determinismo NPC:** o mundo persistido pós-virada é **igual** ao `advanceWorld(readWorld, results, seed, ∅)` puro (reconciliação byte-a-byte via `worldHash`) num mundo SEM humanos. Testado ao vivo.
4. **O humano SOBREVIVE (imune):** um humano com `age` que cruzaria 35, ou que seria sorteado numa transferência, **permanece** no elenco após a virada — mesmo `athlete_id`, `is_human=true` re-aplicado, `world_occupation.season_id` atualizado, `name`/`ability` congelados preservados. Sobe de divisão se o clube foi promovido. Testado puro (engine) + ao vivo (store).
5. **`turnover_report` gravado:** o relatório (retired/born/promoted/relegated/transferred) da virada é persistido (o overwrite não apaga a auditoria). Testado ao vivo.
6. **Atomicidade + idempotência + lock:** o rollover é UMA transação (falha → ROLLBACK total, mundo NÃO meio-virado, `season_id` inalterado → o tick deriva `deferred`); advisory lock serializa; rodar o rollover 2× → a 2ª é `already_rolled` (no-op). Testado ao vivo (incl. falha injetada + concorrência).
7. **Tick vivo:** `runDailyRound` no dia pós-última-rodada retorna `season_rolled` e o mundo virou; no dia seguinte, publica a rodada 1 da nova temporada (sem pular rodada). Testado ao vivo.
8. **OPs & gates:** sem `any` (OP-14); funções ≤50 (OP-15); arquivos ≤300 (OP-16); erros genéricos (OP-11); migration aditiva (OP-01); regra pura no engine / orquestração no store (OP-17); guardrail verde (engine puro); `lint`/`typecheck`/`build`/`test` verdes; ao vivo serial + limpeza em ordem de FK.

---

## Segurança

- **Autoridade server-side:** a viragem, a imunidade e a nova âncora são decididas no servidor. `immuneIds` deriva de `world_occupation` (a autoridade), não de input do cliente.
- **OP-11:** falhas (mundo ausente, integridade da re-aplicação, lock) → erro genérico, sem SQL/stack. Protocolo de falha do tick: deferido = ausência da virada (nenhum estado novo).
- **Atomicidade (charter):** a linha do tempo do mundo é all-or-nothing — a virada inteira commita ou nada.
- **OP-02/OP-12:** nenhum segredo novo.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Quebrar o golden ao tocar o engine** (o maior risco) | `immuneIds` opcional default vazio; as guardas são **no-op stream-preserving** (os saques acontecem idênticos). `world.golden.json` inalterado é **critério duro** — o teste do golden é o gate. Se mudar, a implementação está errada (não se regenera). |
| **Overwrite apaga a imunidade / dessincroniza o overlay** | A imunidade entra DENTRO da viragem (`immuneIds`), e as ocupações são **re-aplicadas** após o write (is_human + name/ability + season_id). O `athlete_id` do imune persiste (não aposentado/transferido). |
| **`athlete_id` do imune sumir** (bug de imunidade) | Assert de integridade na re-aplicação; se um id ocupado não existe no mundo novo → erro → ROLLBACK (adiar > publicar errado). |
| **Rollover concorrente / duplo** | Advisory lock de mundo + idempotência por `season_id` sob o lock (`already_rolled`). |
| **Pular rodada no calendário** | `novoStart = startAntigo + roundsLength + 1` (1 dia de descanso); o dia da virada não publica rodada, o seguinte publica a rodada 1. Testado. |
| **Clube do humano muda de tier (assertEntryClub)** | `assertEntryClub` guarda só ENTRADAS novas (gênese); residência pós-virada em qualquer tier é livre — o humano sobe com o clube (desejado). `club_id` é estável na promoção. |

**Dependências:** SPEC-009/012 (`advanceWorld`), SPEC-013/015 (snapshot + tick + âncora), SPEC-020 (`world_occupation`/`is_human`). **Precede:** o **Regen** (renascimento/Hall of Fame), o re-baker de `ability`, o scheduler de produção, o encaixe da Copa.

---

## Notas de implementação

- **A guarda de transferência preserva o stream:** o `runTransfers` continua sacando `pickTwoDistinct`/`pick(POSITIONS)`/`pickPositionIndex` na MESMA ordem; só o *swap* é suprimido quando um dos dois envolvidos é imune. Set vazio ⇒ nunca suprime ⇒ byte-idêntico ao atual. **O golden test valida isso.**
- **`ageAndRetire` sem RNG:** só o `.filter` muda (mantém imune). Zero impacto no stream.
- **`club_id` estável:** a promoção/rebaixamento move o clube entre ligas mas preserva o `id` do clube e o `athlete.club_id` — a re-aplicação da ocupação NÃO precisa mexer no `club_id`, só no `season_id`.
- **Idade do imune:** sobe +1/temporada (a aposentadoria é o único suprimido). O "fim de carreira → Regen" é card futuro.
- **Ordem do DELETE:** `world_occupation` → `athlete` → `club` → `league` → `world_tier` (FKs `ON DELETE no action`). `world` fica (UPDATE `season_id`).
- **Fecho do DONE:** "Estado atual" (SPEC-021, flipar SPEC-020 → PR #23) + `roadmap.md` (Fatia 3 ✅ + item novo do **Regen** com a nota do nome/Hall of Fame).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (rollover + imunidade; Regen/re-baker/Copa/scheduler fora)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva `0004` — OP-01)
- [x] Critérios testáveis (golden byte-idêntico, mundo vira, humano sobrevive, atomicidade/idempotência, tick vivo)
- [x] Riscos avaliados (golden, overwrite, concorrência, calendário)
- [x] Decisões co-desenhadas registradas (imunidade A, overwrite, destino do humano, Regen futuro)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-021 — método H1VE. O mundo passa a VIRAR: ao fim da temporada o tick dispara a viragem persistida, atômica, e o humano SOBREVIVE (imune, sobe com o clube). A imunidade entra por `immuneIds` (ids, não "humano") — engine-aware SEM regenerar o golden (byte-idêntico é critério duro). O overwrite in-place re-aplica as ocupações; o `turnover_report` guarda a auditoria que o overwrite apagaria. Fundação Regen-ready.*
