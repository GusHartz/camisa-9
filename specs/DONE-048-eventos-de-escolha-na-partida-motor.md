# DONE-048 — Eventos de escolha na partida (3.2) · fatia 1: o motor

## Metadados
| Campo | Valor |
|---|---|
| **Número** | SPEC-048 / DONE-048 |
| **Owner** | gustavo-hartz (dev) |
| **Concluída em** | 2026-07-21 |
| **Roadmap** | 3.2 (Eventos de escolha + intervenção) — o "interagir" ao vivo |
| **Dependências** | SPEC-043 (timeline) · SPEC-046 (participação na faixa) · SPEC-025 (molde do catálogo) — em `main` |

## Resumo

A partida ganhou **momentos de escolha SEUS**: o **motor** gera **1-5 escolhas + ≤1 intervenção por
tempo**, determinísticas, **ancoradas na timeline** (SPEC-043) — "você marcou, como comemora?", "no
intervalo, o time precisa reagir". Fecha a tríade *assistir* (044) → *rosto/nota* (046) → **interagir**.

**Engine (puro, golden-safe por construção):** `match-choices.ts` — `matchChoices(seed, …, athleteId,
ctx) → MatchChoice[]` (fn PURA, padrão `matchRating` da SPEC-046, stream `'choices'` disjunto,
human-específica); `MATCH_CHOICES` (catálogo ABERTO de 6 templates, molde de `DECISIONS`, com `effect`
DECLARADO + opção `conservative`); `MatchChoice`/`MatchChoiceOption`/`MatchChoiceContext`. Rank estável
por template (`deriveSeed(base, id)`); `select` com cap ≤1 intervenção/tempo; minuto do evento (gol/
lesão/sofrido) ou lull do tempo. **1-5 sempre, ≥1** (as intervenções/lance disparam sempre).

**Faixa (aditivo `/v1/band`, SEM migration):** `BandMatch.choices?` (`{minute, templateId, type, prompt,
options:[{id,label}]}` — a OFERTA; o `effect` NÃO é exposto, é seam server-side). `buildTodayMatch`
deriva o `ctx` dos eventos publicados (gols `byMe`, sofridos, lesão no clube) e chama `matchChoices`.

**Fn PURA, human-específica → NUNCA roda na simulação** → `resolveMatch`/`simulateSeason`/`world-season`
e os **5 goldens INTOCADOS** (`git diff`=0). **SEM migration** (recomputável, como a nota).

## Revisão adversarial (Workflow · 3 lentes · cada achado verificado)

**Núcleo SÓLIDO — zero CRITICAL/MAJOR** (determinismo/golden-safety/1-5/≤1-por-tempo confirmados). 11
brutos → **10 confirmados (MINOR/NIT), todos endereçados:**
- **[MINOR — bug real] `lesao-colega` disparava na lesão do PRÓPRIO humano** (o `clubInjuredMinute` só
  filtrava por clube). **Fix:** excluir o self (`i.athleteId !== ctx.meWorldId`) — "um COMPANHEIRO caiu".
- **[MINOR — cobertura] A derivação events→ctx (a única lógica nova do seam) era não-pinada.** **Fix:**
  testes de linkage (comemoração no minuto do MEU gol, provocação no minuto sofrido, sem-participação →
  os salient ausentes, self-injury → sem `lesao-colega`).
- **[MINOR — feel] `rankByScore` dava odds iguais ao momento SEU (comemoração) e aos fillers.** **Fix:**
  ranking **salient-first** (os momentos seus vêm antes dos fillers sempre-ativos → o payoff "você marcou
  → você comemora" aparece de forma confiável dentro do teto de 5). +teste.
- **[MINOR — drift SPEC↔código] `ChoiceEffect` é `Record<string, number | string>`** (o `focusBias` é
  rótulo, fiel à SPEC-025), mas o Cenário 3/Escopo da SPEC dizia `Record<string, number>`. **Correção
  registrada:** o tipo correto é `number | string`; o teste passou a assertar os tipos de valor.
- **[MINOR/NIT] `MatchChoiceContext.result` é seam reservado** (threaded, nenhum template lê ainda) e o
  **cap ≤1 intervenção/tempo é latente** (as 2 intervenções são de tempos disjuntos). **Fix:** comentados
  como reservados/forward-safety + `choiceTemplateById` ganhou teste de round-trip.
- **[NIT] fallbacks de `pickMinute`** defensivos em templates evento-gatilhados — aceitos (defensivos).

**Refutado (1):** um falso-positivo derrubado na verificação cética.

⚠️ **Correção ao texto da SPEC (registrada):** o Cenário 3/Escopo dizem `effect: Record<string, number>`,
mas o correto (e o implementado) é `Record<string, number | string>` — o `focusBias` é rótulo (molde da
SPEC-025). Não muda comportamento (o efeito é seam declarado, aplicado numa fatia futura).

## Arquivos
- **Engine:** `match-choices.ts` (novo) + `index.ts` + `match-choices.test.ts` (novo).
- **Faixa:** `api/band/types.ts` · `from-world.ts` (+ testes `from-world`/`band-state`).
- **Intocado (DURO):** `resolveMatch`/`simulateSeason`/`world-season`/`match.ts` + os **5 goldens**
  (`git diff`=0). **SEM migration.**

## Gates
- **672 testes** verdes (657 baseline + os SPEC-048 + os fixes da revisão), ao vivo contra Postgres;
  typecheck/eslint/prettier verdes.
- `git diff` engine de placar + 5 goldens = 0; sem migration.

## Escopo deferido / follow-ups
- **A apresentação no CLIENTE** (renderizar a escolha na faixa/replay) — fatia 2.
- **A RESPOSTA + a APLICAÇÃO dos efeitos** (persistir a escolha, aplicar moral/atributos respeitando o
  modelo de treino / "nunca loja de stats") — fatia 3.
- A intervenção que MUDA o placar (reescreveria `resolveMatch`) — fora.

## AI declaration
Implementação por IA (Opus 4.8) em par com o dev; verificada **ao vivo contra Postgres** (motor puro +
faixa); 5 goldens byte-idênticos (fn pura, nunca na sim). Revisão adversarial por Workflow (3 lentes).
Sem revisão humana linha-a-linha; 100% servidor, verificável sem smoke.

*DONE-048 — método H1VE.*
