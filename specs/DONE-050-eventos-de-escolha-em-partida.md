# DONE-050 — Eventos de escolha em partida (fatias 2+3: responder ao vivo, roll por atributos e efeitos aplicados)

> Registro de conclusão da SPEC-050. Fecha o card 3.2 (a fatia 1/motor foi a SPEC-048).

---

## Metadados

| Campo | Valor |
|---|---|
| **SPEC** | SPEC-050 |
| **Branch** | `feat/gustavo-hartz/eventos-de-escolha-em-partida` |
| **Baseline** | `main` @ `017c0b9` (pós SPEC-049) |
| **Testes** | **709** (705 da baseline+extensões preservados; todos ao vivo contra Postgres real) |
| **Gates** | typecheck · eslint (OP-14/15/16 + guardrail) · build · prettier · `dotnet build` **0 avisos** |
| **Selo** | `resolveMatch`/`simulateSeason`/`world-season` e os **5 goldens byte-idênticos** (`git diff` = 0, provado por comando na revisão) |
| **Migration** | `0011_match_choices` (player-store: tabela `match_choice` + `athlete.next_train_focus` com CHECK) |

---

## O que foi entregue

O **"interagir" do dia de jogo fecha a tríade** *assistir* (SPEC-044) → *rosto/nota* (SPEC-046) →
**interagir**, com as 4 decisões do founder travadas na SPEC:

- **A. Engine (puro, simulação intocada):** `MatchChoiceOption.risky? {attr, fail}` + as 4 opções de
  risco no catálogo (`fail.moral = −risco`); **`resolveChoiceRoll(RollInput)`** (arquivo novo, stream
  `'choice-roll'` + sub-seed por template/opção, chance = 50 + 60/40 atributo/moral, clamp [15,85],
  inteiro/guardrail-safe); `choiceOptionById`/`conservativeChoiceOption`; **`choiceContextFrom`** —
  a derivação events→ctx extraída do agregador (fonte ÚNICA de api E scheduler, self-exclusion
  incluída). Regressão da oferta 048 cravada por **fixture com strip de `risky`**.
- **B. Persistência:** tabela **`match_choice`** (PK natural `(athlete, season, round, template)` =
  idempotência por construção; `effect` jsonb snapshotado = auditável) + `answerMatchChoice` (lança
  `choice_resolved`) / **`resolveConservative`** (sem-throw, conflito benigno) / `readMatchChoices`;
  **`next_train_focus`**: o `focusBias` da escolha do JOGADOR vira o foco do treino idle do dia
  seguinte (consumido/limpo na tx do `applyTraining`; o claim `'train'` no-op PRESERVA o viés);
  `moral` aplicado na MESMA tx (SPEC-027); `fama`/`risco` declarados-inertes (precedente decisions).
- **C. API:** `POST /v1/matches/choices/answer` (gates temporais → **recompute server-side da
  oferta** → roll com focos/moral VIVOS → repo; retry-safe **pela PK**, não pelo roll); codes
  `choice_not_available`/`choice_resolved`; band **anota** `chosenOptionId`/`result` e expõe
  `risky`/`attr` (aditivo; `effect`/`fail`/chance NUNCA viajam); balde IP `matches` **40** (quinteto
  no NAT durante o replay sincronizado) + 30/conta; `isFocus` exportado de `@camisa-9/player`
  (a rota `training-spend` reusa).
- **D. Scheduler (o timeout):** `processDay` pré-computa o mapa de ONTEM (`yesterdayMatches` — o
  helper que expõe o `MatchRecord` que o `RoundOutcomes` descarta) e injeta nos passes;
  `tryResolveChoices` resolve as pendentes de day−1 com a **conservadora** (`resolvedBy='agent'`,
  moral ≥ 0 por catálogo — cravado por teste; **focusBias NÃO aplica** — viés é agência do jogador);
  conflito benigno POR TEMPLATE; **gate de ENTRADA** (lição SPEC-034) no espaço
  `dueDayIndex(occupiedAt) ≥ day−1` ("a rodada já tinha vencido na entrada"); pula gênese/sem-fixture.
- **E. Cliente WPF:** espelho aditivo/tolerante (`BandMatchChoice`/`BandChoiceOption` + `Choices`);
  overlay dirigido pelo `Frame` do replay (**zero timer novo**; `>=` porque o relógio pula minutos;
  UMA por frame; a próxima substitui a não-respondida); popup no molde da SPEC-045 (`⚡FIS/TEC/TAT/
  MEN` telegrafa o roll); POST com o **round capturado na apresentação**; reconciliação server-first
  que NUNCA reseta overlay em curso e dá o feedback do desfecho pelo `Result` (conjunto de
  pendentes); otimista local desfeito em falha de rede; `StopReplay` zera tudo; fora do replay não
  há affordance (decisão 4).

## Revisão adversarial (Workflow · 2 rodadas · verificação cética)

**Rodada 1 (o draft da SPEC, ANTES do código):** 2 raízes MAJOR corrigidas no texto — o resolver
reabriria a classe SPEC-034 (escolhas-fantasma pro admitido) e o wiring do scheduler estava
sub-especificado (`safeHumanPasses` sem `worldDb`; `RoundOutcomes` descarta o `MatchRecord`) — + 8
MINOR/NIT (teste por strip, variante sem-throw, retry-safety pela PK, IDs mundo×player explícitos,
balde 40, `isFocus` de `@camisa-9/player`, ciclo de vida da anotação, gates de entrega parcial).

**Rodada 2 (a implementação, 3 lentes):** lente do SELO voltou **PASS com zero achados** (goldens
por comando; guardrail; OP-01..17; varredura wipeAll completa nas 19 suítes; zero locks novos —
invariante Neon). **2 MAJOR reais corrigidos:** (1) o gate de entrada comparava em DIA-CALENDÁRIO
(`resolveSlot`) e falhava no caso de produção normal — admissão às ~15h de day−1 → escolhas-fantasma
+ moral (e o teste era vácuo na fronteira: `occupiedAt` real ≫ dias sintéticos) → **fix:**
`dueDayIndex(occupiedAt) ≥ day−1` + teste de FRONTEIRA (16h pula / 10h resolve / real pula);
(2) o cliente lia `_lastRound` VIVO no clique — um poll cruzando as 15h com overlay aberto
responderia a oferta RECOMPUTADA da rodada seguinte → **fix:** round capturado na apresentação.
**MINORs aplicados:** `if` no lugar do `while` (duas escolhas no mesmo minuto — a primeira ganhava
zero tela e ficava irrespondível); otimista nunca desfeito em falha de rede (→ `UnmarkChoice`);
feedback do desfecho perdido quando a próxima escolha abria antes da reconciliação (→ conjunto
`_pendingOutcome`); +6 testes de cobertura (viés no tick ponta-a-ponta, gênese pula sem erro,
corrida REAL `Promise.all`, 429 com Retry-After, janela às 09h de D+1, `occupiedAt` real).

## Desvios de mecanismo (não de produto)

- `choiceContextFrom` vive em **`match-choice-context.ts`** e os lookups em **`match-choice-roll.ts`**
  (a SPEC os listava em `match-choices.ts`, que estouraria as 300 linhas do OP-16 — ficou em 287).
- Cliente: opções renderizadas via `ChoiceOptionRow` projetada no VM (molde `ShopRow` da SPEC-045),
  não binding cru do record de contrato; o feedback do desfecho evoluiu do "CurrentMatchChoice
  único" para o conjunto `_pendingOutcome` (fix da revisão).
- Cenário 2 "streams disjuntos": provado **por construção** (o roll cria RNG próprio e nunca roda na
  geração) + o fixture de strip da oferta; sem teste dedicado "não desloca a nota" (seria vácuo —
  fns puras sem estado compartilhado).

## ⚠️ Consequência declarada (decisão de execução — founder pode reverter com 1 linha)

A **ROTA não gateia** o admitido-de-ontem: quem entrou no fim de day−1 pode, na manhã de D+1,
responder ATIVAMENTE as escolhas da partida que o NPC jogou — consistente com o que a banda JÁ
mostra desde a SPEC-046 (`byMe`/nota da partida herdada do slot). A classe de dano da SPEC-034
(efeito SEM agência) está fechada pelo gate do RESOLVER; a via ativa é agência do jogador sobre uma
partida que a UI apresenta como dele. Fechar a simetria = `if (dueDayIndex(occupation.occupiedAt.
getTime()) >= tickDay) throw gone()` em `resolveShownMatch` (+ omitir a oferta na banda).

## Débitos/limitações registradas

- **Roll com inputs VIVOS** (focos/moral no momento da resposta) → não-recomputável a posteriori; a
  linha persistida é a verdade durável (classe SPEC-029/046; snapshot por rodada = card de auditoria).
- **Escolhas do último dia da temporada expiram** sem conservadora (janela de gênese — a liga antiga
  não é derivável da ocupação pós-viragem). Sem efeito no money path.
- A **resolução do agente nunca aparece no band** (a rodada mostrada vira no mesmo tick) — a
  superfície de história (jornal/perfil) é card futuro.
- Catálogo evoluir entre oferta e resposta → `invalid_option` (recompute); versionamento futuro.

## Smoke (ação do founder)

O render do overlay ao vivo (o momento abrindo no minuto durante o replay, o clique, o feedback do
roll) + o orçamento `<1% CPU`/`<150 MB` = smoke visual do founder (método no
`client/band-wpf/README.md`). Aqui: `dotnet build` 0 avisos + inspeção estrutural.

## Escopo deferido (da SPEC + follow-ups)

Roll que muda o placar (âncora 048); aplicar `fama`/`risco`; unificar o `focusBias` das decisions no
mesmo canal; template result-gated / novos templates; persistir a OFERTA/versionar catálogo; chance
exibida ao jogador; toasts; história no jornal/perfil; localização EN; simetria do gate na rota
(consequência declarada acima).

---

*DONE-050 — método H1VE. O "interagir" fecha o dia de jogo: escolhas ao vivo no replay, roll
determinístico por atributo+moral, moral agora + viés de treino amanhã, conservadora sem punição.
Engine de simulação e os 5 goldens intocados; migration 0011; 709 testes ao vivo.*
