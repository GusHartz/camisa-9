# SPEC-031 — Partida rica: ocorrência de lesão (fatia 1)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-031 |
| **Feature** | Partida rica / eventos de partida (1.1 enriquecido + 3.2) — card do board |
| **Slug** | partida-rica-ocorrencia-de-lesao |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 1.1 (motor de partida enriquecido) — 1ª fatia |
| **Appetite** | **2 a 3 dias** (uma lib pura nova no engine + o enriquecimento no world-season + o wiring no tick; **sem regen de golden**). |
| **Prioridade** | ALTA — ATIVA o seam da ocorrência de lesão (SPEC-026): o arco de lesão finalmente ACONTECE. |
| **Criada em** | 2026-07-19 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-19)

1. **Enriquecer no `world-season`, NÃO no `resolveMatch` — os 4 goldens ficam INTOCADOS.** A lesão precisa do `athleteId` (o elenco), mas o `resolveMatch` só recebe **forças agregadas** (`number`); os elencos (`WorldClub.roster`) só existem na camada `world-season`. Então o enriquecimento vive lá, **DEPOIS** do placar, com um RNG PRÓPRIO (sub-seed com discriminador `'events'`). Consequência: `resolveMatch`/`simulateSeason` intocados → `season.golden.json` byte-idêntico; `world.golden.json` (âncora SPEC-012) intocado (eventos não entram no `WorldState`; `advanceWorld` só lê a tabela/placares e tem stream próprio); `prng`/`anchor` idem. **A série de "goldens intocados" (11 SPECs) SOBREVIVE — zero regen.**
2. **Fatia 1 = ocorrência de lesão + wiring.** A partida emite (raramente, determinístico) um EVENTO de lesão (`athleteId` + gravidade + minuto); o tick (SPEC-030) lê o evento da rodada publicada, mapeia `athleteId → humanAthleteId` (via `world_occupation`) e chama `injureFromMatch` — **ativando o seam da SPEC-026**. Deferido: gols-com-minuto (o timeline) e os eventos de ESCOLHA interativos (3.2).
3. **Lesão NARRATIVA (não muda o placar).** A lesão ACONTECE (dispara o arco + a indisponibilidade que o mundo já lê via `available`), mas NÃO altera o placar daquela partida. O impacto no jogo vem naturalmente DEPOIS (o lesionado fica indisponível nas próximas rodadas — o seam já pronto). Zero risco ao placar.

---

## Objetivo

Fechar o ciclo que a SPEC-026 abriu: **a lesão finalmente ACONTECE numa partida**. Hoje `injureFromMatch` é um seam que ninguém chama — o arco de lesão (contusão → recuperação → volta por cima) existe mas nunca dispara. Esta fatia faz a partida (rica) **emitir eventos de lesão** de forma determinística, e a borda de produção (o tick) **injetá-los** nos humanos. É a primeira "cor" real da partida — sem tocar o motor de placar (o money path).

---

## Contexto e motivação (fatos verificados no repo)

- **`resolveMatch(homeStrength, awayStrength, rng): Score`** (`packages/world-engine/src/engine/match.ts:14`) — só recebe FORÇAS (`number`), sem elenco. Consome o PRNG para o placar (home draws → away draws). **Não é o lugar da lesão** (não conhece `athleteId`).
- **`simulateSeason(league, seed): SeasonResult`** (`season.ts:12`) — monta `MatchResult { round, homeId, awayId, homeGoals, awayGoals }` (`season.ts:26`); trabalha com clubes força-só. É o que o `season.golden.json` congela (objeto inteiro) → **fica intocado**.
- **`simulateWorldSeason(world, seed)`** (`world-season.ts:23`) — projeta `WorldClub → Club` (força-só) e reusa `simulateSeason`. **TEM os `WorldClub.roster`** (`types.ts:91`; `Athlete { id, ability, position }`, `types.ts:71`) ANTES de projetar → é AQUI que o enriquecimento de lesão (que precisa do elenco) vive.
- **Os goldens** (`packages/world-engine/src/__fixtures__/`): `season.golden.json` (objeto `SeasonResult`, de `simulateSeason`), `world.golden.json` (11 hashes de `WorldState`, de `simulateWorldSeason`+`advanceWorld`), `prng`/`anchor`. **Nenhum** inclui `MatchResult.events` do world-season → todos byte-idênticos se o stream do placar/`advanceWorld` não mudar (não muda: o RNG de eventos é separado).
- **`injureFromMatch(db, athleteId, day, severity)`** (`services/player-store/src/store/injury-repo.ts:33`) — o SEAM da ocorrência (idempotente, advisory lock, gravidade validada). Hoje **nenhum caller**.
- **O tick (`services/scheduler/src/daily-tick.ts`, SPEC-030)** já lê a rodada publicada (`readRound`, via `prizesForRound`) — o `RoundResult` (jsonb) já traria os `events`. E já itera as ocupações humanas (`readWorldOccupations` → `occ.athleteId`/`occ.humanAthleteId`). É o ponto de wiring.
- **`world_occupation`** liga `athleteId` (id do NPC/humano no mundo) ↔ `humanAthleteId` (player-store); o humano **mantém o mesmo `athleteId`** ao ocupar → o evento do engine e a ocupação usam a MESMA chave.
- **Guardrail:** tudo inteiro via `nextInt(rng, N)`/`nextUint32`; `Math.floor`/`imul`/`sqrt` OK; sem `Date`/`random`/transcendentais.
- **jsonb schemaless:** `published_round.result` é `jsonb $type<RoundResult>()` → adicionar `events` **não exige migration**.

---

## Escopo — o que está DENTRO (fatia 1)

**A) `packages/world-engine` — o tipo + a lib pura de eventos:**
- [ ] `MatchEvent` (novo tipo, `types.ts`): fatia 1 = a lesão — `{ readonly kind: 'injury'; readonly clubId: string; readonly athleteId: string; readonly severity: 'leve'|'media'|'grave'; readonly minute: number }`. (Aberto p/ `kind` futuros: `goal`/`choice`.)
- [ ] `MatchResult` ganha `readonly events?: readonly MatchEvent[]` (OPCIONAL — preenchido só no world-season; `simulateSeason` não o toca → season.golden intocado).
- [ ] `match-events.ts` (novo, PURO): `matchInjuries(homeClubId, homeRoster, awayClubId, awayRoster, rng): MatchEvent[]` — decide (raro, determinístico via `nextInt`) se há lesão em cada lado, sorteia o atleta (do roster), a gravidade (ponderada) e o minuto. `MATCH_EVENTS` tunável (taxa, pesos de gravidade). Inteiro/guardrail-safe. NÃO altera placar.

**B) `packages/world-engine/src/engine/world-season.ts` — o enriquecimento (pós-placar):**
- [ ] Depois de `simulateSeason` (o placar), para cada `MatchResult`, deriva um **RNG de eventos** (`createRng(deriveSeed(seed, leagueId, seasonId, round, homeId, awayId, 'events'))` — chave com discriminador `'events'`, stream SEPARADO do placar) e anexa `events = matchInjuries(homeRoster, awayRoster, rng)` (os rosters vêm do `WorldClub` original, pré-projeção). `simulateSeason`/`resolveMatch` **intocados**.

**C) `services/scheduler` — o wiring (a borda injeta a lesão):**
- [ ] No `runDailyTick` (dia com rodada publicada), varrer os `events` de lesão das partidas do clube de cada humano ocupante; para cada evento cujo `athleteId === occ.athleteId`, chamar `injureFromMatch(playerDb, occ.humanAthleteId, dayIndex, severity)`. (Molde do `prizesForRound`: monta um mapa `athleteId → severity` da rodada publicada; passa ao `runHumanPasses`.) NPC lesionado → o evento fica no `RoundResult` (narrativa/replay), sem lesão persistida (só humanos têm arco).

**D) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA (fatia 2 / futuro)

- **O timeline de gols** (`kind: 'goal'` com minuto/artilheiro) — narrativa da partida; fatia 2.
- **Os eventos de ESCOLHA interativos (3.2)** — o jogador decide durante a partida; fatia própria.
- **A lesão AFETAR o placar** (enfraquecer o time na hora) — reescreveria o `resolveMatch` (money path); fora.
- **Ponderar o atleta lesionado** por minutos jogados/físico — fatia 1 sorteia uniforme do roster.
- **Card de partida / dia de jogo ao vivo / faixa** — sem cliente.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/world-engine/src/types.ts` | editar — `MatchEvent` + `events?` no `MatchResult`. |
| `packages/world-engine/src/engine/match-events.ts` (+ barrel `index.ts`) | criar — `matchInjuries` (puro) + `MATCH_EVENTS` tunável. |
| `packages/world-engine/src/engine/match-events.test.ts` | criar — testes puros (determinismo, taxa, gravidade, guardrail). |
| `packages/world-engine/src/engine/world-season.ts` | editar — anexar `events` pós-placar (RNG `'events'`). |
| `packages/world-engine/src/engine/world-season.test.ts` (ou novo) | editar/criar — matches ganham events; atleta do roster; **placar/tabela inalterados**. |
| `services/scheduler/src/daily-tick.ts` | editar — mapa de lesões da rodada → `injureFromMatch` por humano. |
| `services/scheduler/test/daily-tick.test.ts` | editar — o humano cujo clube teve evento de lesão FICA lesionado (seam ativado). |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 1.1 (fatia 1) + flip SPEC-030 → PR #33. |
| `specs/SPEC-031-*.md`, `specs/DONE-031-*.md` | criar. |

**Intocado (o critério DURO):** `resolveMatch`/`simulateSeason` (o motor de placar) e **os 4 goldens** (`season`/`world`/`prng`/`anchor` — `git diff` = 0); o `world-store` (jsonb schemaless, sem migration); o `injury-repo` (só é CHAMADO).

---

## Critérios de aceitação

1. **Os eventos (puro):** `matchInjuries` é determinístico (mesmo roster+rng → mesmos eventos); a lesão é RARA (a taxa tunável); a gravidade é ponderada (leve > media > grave); o atleta sorteado é do roster; o minuto ∈ [1,90]. Inteiro/guardrail. Testado puro.
2. **O enriquecimento (world-season):** cada `MatchResult` de `simulateWorldSeason` pode ganhar `events`; um evento de lesão nomeia um atleta do elenco do clube certo. **O placar e a tabela ficam INALTERADOS** vs. a simulação sem eventos (o RNG de eventos é separado). Testado.
3. **GOLDENS INTOCADOS (o critério duro):** `season.golden.json`, `world.golden.json`, `prng.golden.json`, `anchor.golden.json` byte-idênticos (`git status --short __fixtures__/` = vazio); `simulateSeason(DEMO_LEAGUE)` segue igual ao golden. Testado + `git diff` = 0.
4. **O seam ATIVADO (o ponto do card):** no tick, um humano cujo clube teve um evento de lesão para o `athleteId` dele → `injureFromMatch` é chamado → `readInjuryState` mostra a lesão ativa. Testado ao vivo.
5. **NPC lesionado não persiste:** um evento de lesão de um atleta SEM ocupação humana fica no `RoundResult` mas não gera lesão no player-store. Testado.
6. **Idempotência preservada:** rodar o tick 2× no mesmo dia não injeta a lesão de novo (o `injureFromMatch` é idempotente — 1 ativa/atleta; o guard da SPEC-026). Testado.
7. **OPs & gates:** sem `any` (14); ≤50 linhas/função (15); ≤300/arquivo (16); regra pura na lib / IO no tick (17); guardrail verde; `lint`/`typecheck`/`build`/`test`/prettier verdes; **`resolveMatch`/`simulateSeason` e os 4 goldens intocados** (`git diff` = 0).

---

## Segurança

- **Determinismo (money path):** o RNG de eventos é derivado por seed (sub-seed `'events'`), separado do placar → a partida rica é reproduzível e auditável; o placar segue byte-idêntico.
- **Autoridade server-side:** a ocorrência da lesão é decidida no engine (determinístico); o tick injeta via `injureFromMatch` (idempotente, validado). O cliente nunca se lesiona nem se cura.
- **OP-11:** o wiring reusa os erros genéricos do `injureFromMatch`.
- **Sem inflar o domínio:** a lesão não altera `ability`/placar; só emite o evento e dispara o arco.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Tocar o placar/golden** | O enriquecimento é PÓS-placar, no world-season, com RNG SEPARADO (`'events'`) → `resolveMatch`/`simulateSeason` intocados; os 4 goldens byte-idênticos (critério 3, `git diff` = 0). |
| **Evento apontar atleta errado** | O atleta é sorteado do `WorldClub.roster` (o elenco real do clube), por `id`; o tick só age se `athleteId === occ.athleteId`. Testado. |
| **Lesão dupla / re-injeção no retry** | `injureFromMatch` é idempotente (1 ativa/atleta, SPEC-026); o tick idempotente (SPEC-030). Testado. |
| **Ocorrência "hollow"** (nada muda) | NÃO: a lesão dispara o arco REAL (SPEC-026) + a indisponibilidade que o mundo lê (`available`); o impacto no jogo vem nas próximas rodadas (seam pronto). |
| **Colisão de nome `MatchResult`** | O engine tem `MatchResult` (registro do jogo); o player tem `MatchResult` ('win'/'draw'/'loss'). O `events` vai no do ENGINE; aliasar no tick. |

**Dependências:** SPEC-026 (`injureFromMatch`), SPEC-030 (o tick que injeta), SPEC-020 (`world_occupation`/`readWorldOccupations`), SPEC-009 (`WorldClub.roster`/`simulateWorldSeason`). **Precede:** o timeline de gols; os eventos de escolha (3.2); a lesão afetando o placar.

---

## Notas de implementação

- **O card "arriscado" saiu barato:** a lesão precisa do elenco → o enriquecimento vive no world-season (que o tem) → `resolveMatch`/os goldens ficam intocados. O `season.golden` (de `simulateSeason`) não vê os eventos; o `world.golden` (hashes de `WorldState`) não os inclui.
- **O RNG de eventos é um stream separado** (`deriveSeed(..., 'events')`) → nunca desloca o stream do placar nem o do `advanceWorld`. É o que garante os goldens byte-idênticos.
- **O tick já tem tudo:** lê a rodada publicada (com `events`) + itera as ocupações; só precisa do mapa `athleteId → severity` (molde do prêmio) → `injureFromMatch`.
- **Fecho do DONE:** "Estado atual" (SPEC-031, flipar SPEC-030 → PR #33) + `roadmap.md` (1.1 fatia 1).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (ocorrência de lesão + wiring; gols/escolha/afeta-placar fora)
- [x] Arquivos listados corretos (verificados no repo, com linhas)
- [x] Sem mudança de schema (jsonb schemaless; nenhuma migration)
- [x] Critérios testáveis (eventos puros, enriquecimento, GOLDENS INTOCADOS, seam ativado, NPC não-persiste, idempotência)
- [x] Riscos avaliados (placar/golden, atleta errado, dupla, hollow, colisão de nome)
- [x] Decisões co-desenhadas registradas (world-season, ocorrência+wiring, narrativa)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-031 — método H1VE. A partida finalmente MACHUCA: um evento de lesão determinístico, emitido no world-season (que tem os elencos), injetado pelo tick via `injureFromMatch` — ativando o arco da SPEC-026. E o card "que tocaria o engine/golden" sai de graça: o enriquecimento vive na camada certa (world-season), o motor de placar e os 4 goldens ficam byte-idênticos. Lesão narrativa (não muda o placar); o impacto vem nas próximas rodadas via a indisponibilidade já pronta.*
