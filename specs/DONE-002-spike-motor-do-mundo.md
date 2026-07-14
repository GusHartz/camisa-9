# DONE-002 — Spike do motor do mundo

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-002 |
| **SPEC correspondente** | SPEC-002-spike-motor-do-mundo.md |
| **Feature** | Spike do motor do mundo (de-risca R1) |
| **Owner** | gustavo-hartz |
| **Branch** | `feat/gustavo-hartz/spike-motor-do-mundo` |
| **PR** | {preencher ao abrir o PR} |
| **Desenvolvimento iniciado** | 2026-07-14 |
| **Desenvolvimento concluído** | 2026-07-14 |
| **Dias utilizados vs appetite** | <1 dia vs 3 semanas (timebox do spike) |

---

## Resumo do que foi feito

Spike que **de-risca R1** (custo de compute, determinismo, atomicidade e fuso) **antes** da camada de dados (0.2). Entregou a lib de domínio pura **`packages/world-engine`**: PRNG determinístico por seed (cyrb128+sfc32, **só uint32**, sem transcendentais), resolução de partida por modelo "chances × conversão" (inteiro, sem `exp/log/pow`), tabela turno-returno (método do círculo: 10 clubes → 18 rodadas / 90 partidas), classificação 3/1/0 com desempate por ordem total, runner de temporada com **sub-seed por partida** (replay independente da ordem), **store transacional** in-memory (begin/stage/commit/rollback, leitura nunca vê staging) e **publicador atômico** (all-or-nothing + idempotência sequencial/sobreposta sob lock). A **âncora de fuso** resolve a janela ter/qui/sáb 15h Brasília por **aritmética de epoch com offset fixo UTC-3** — sem `Date`/`Intl`. Três conjuntos de **golden vectors** (temporada, PRNG KAT, âncora) são gerados no dev (macOS) e assertados no CI (Linux) → prova de determinismo **cross-ambiente**. A borda impura (`harness/run-season.ts`, `npm run sim`) roda uma temporada real com relógio real e reporta custo de parede. `packages/example` foi removido e o lockfile regenerado. Todos os gates verdes; **48 testes**.

O modelo de partida e os fixes abaixo passaram por um **review adversarial de 5 dimensões** (18 agentes: determinismo, atomicidade, fuso, idempotência/replay, qualidade de testes/OPs), cada achado verificado por refutação independente. Os defeitos confirmados foram corrigidos nesta entrega (ver "Review adversarial").

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `packages/world-engine/package.json` | Pacote `@camisa-9/world-engine` (ESM, `main` = `dist/index.js`). |
| `packages/world-engine/tsconfig.json` | Config do pacote (composite, exclui testes do `dist`). |
| `packages/world-engine/src/types.ts` | Tipos de domínio puros (Club, LeagueState, Fixture, MatchResult, RoundResult, StandingRow, SeasonResult, Seed). |
| `packages/world-engine/src/constants.ts` | Constantes do modelo de partida (ratificáveis pelo founder). |
| `packages/world-engine/src/engine/prng.ts` | PRNG cyrb128+sfc32 (uint32) + `deriveSeed` (codificação injetiva por prefixo de comprimento). |
| `packages/world-engine/src/engine/fixtures.ts` | Tabela turno-returno determinística (método do círculo). |
| `packages/world-engine/src/engine/match.ts` | Resolução de placar "chances × conversão" (sem transcendentais). |
| `packages/world-engine/src/engine/standings.ts` | Classificação 3/1/0 + desempate por ordem total (sem confronto direto). |
| `packages/world-engine/src/engine/season.ts` | Runner de temporada; sub-seed por partida `(seed, liga, temporada, rodada, ids)`. |
| `packages/world-engine/src/orchestration/store.ts` | Store transacional in-memory (swap atômico; leitura isolada do staging). |
| `packages/world-engine/src/orchestration/anchor.ts` | Âncora de fuso sem `Date`/`Intl` (offset fixo UTC-3). |
| `packages/world-engine/src/orchestration/publish.ts` | Publicador atômico (all-or-nothing + idempotência + lock; seam de pré-commit aguardado). |
| `packages/world-engine/src/data/league-seed.ts` | `DEMO_LEAGUE`: 10 clubes NPC **100% fictícios** (regra NUNCA nº1). |
| `packages/world-engine/src/index.ts` | Barrel export da API pública. |
| `packages/world-engine/src/__fixtures__/season.golden.json` | Golden de temporada (seed `golden-seed-001` → campeão c01, 46 pts). |
| `packages/world-engine/src/__fixtures__/prng.golden.json` | Golden KAT do PRNG (seed `kat-seed-42`, 16 uint32). |
| `packages/world-engine/src/__fixtures__/anchor.golden.json` | 9 vetores de âncora (6 positivos + 3 negativos pré-1970), validados por 2 métodos independentes. |
| `packages/world-engine/src/**/*.test.ts` | 9 arquivos de teste (48 casos) — ver "Testes automatizados". |
| `harness/run-season.ts` | Borda impura: roda uma temporada real, `SEED` fail-fast, reporta wall-time. |
| `harness/tsconfig.json` | Config do harness (non-composite, noEmit). |
| `specs/SPEC-002-...md` / `specs/DONE-002-...md` | SPEC aprovada + este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `tsconfig.base.json` | `paths` → `@camisa-9/world-engine`. |
| `tsconfig.json` | Referência `packages/example` → `packages/world-engine`. |
| `tsconfig.typecheck.json` | `types: ["node"]` + inclui `harness/**/*.ts`. |
| `eslint.config.mjs` | Guardrail de determinismo: `Intl.DateTimeFormat` (syntax) + **`no-restricted-properties`** (transcendentais, `Intl.NumberFormat`/`Collator`, `localeCompare`, `performance.now`, `process.hrtime`, `crypto.getRandomValues`, `Date.parse`). |
| `package.json` | Script `sim`; devDep `tsx`. |
| `package-lock.json` | Regenerado (add `tsx`; remoção do example). |
| `README.md` | Bloco "Estrutura" (`example/` → `world-engine/` + `harness/`); convenção de determinismo. |
| `docs/projeto/roadmap.md` | Linha 0.1.5 (spike) marcada ✅. |
| `CLAUDE.md` | Seção "Estado atual" atualizada. |
| `packages/example/**` | **Removido** (placeholder da SPEC-001). |

---

## Mudanças de schema aplicadas

Nenhuma. O spike é **in-memory** por decisão ratificada (persistência real = SPEC 0.2). OP-01 não se aplica.

---

## Critérios de aceitação — verificação

| Cenário | Status | Observação |
|---|---|---|
| 1 — Determinismo + golden cross-ambiente | ✅ | `season.test.ts`: `simulateSeason ==` golden byte-a-byte + 2× idêntico. Golden gerado no dev (macOS), assertado no CI (Linux). |
| 2 — Âncora de fuso (positivo + golden + TZ) | ✅ | `anchor.test.ts`: 9 vetores golden (incl. negativos); idêntico sob `TZ=Pacific/Kiritimati`. Impl não lê `Date`/`Intl`/TZ. |
| 3 — Contrato de publicação / falha parcial | ✅ | `publish.test.ts` + `store.test.ts`: rollback total (falha **síncrona e assíncrona**); leitura nunca vê intermediário. |
| 4 — Idempotência (sequencial + sobreposta) | ✅ | `publish.test.ts`: 2ª publicação sequencial = `idempotent`; 2 chamadas sobrepostas = 1 `published` + 1 `locked`. |
| 5 — Replay auditável | ✅ | `season.test.ts`: cada partida reconstruída de `(seed, liga, temporada, rodada, ids)` re-derivando a sub-seed (não é re-rodar a temporada). |
| 6 — Fixtures + classificação | ✅ | `fixtures.test.ts`/`standings.test.ts`: 18×5=90, cada par 2× (mando invertido); 3/1/0 + desempate estável por id. |
| 7 — Custo + escala (K=64, <100 ms) | ✅ | `season.test.ts`: 1 temporada ~1 ms (teto ratificado 100 ms); K=64 < 100 ms/temporada. **Resposta R1: GO** (folga ~10.000× vs orçamento do tick). |
| 8 — Gates verdes (clean checkout) | ✅ | `lint`/`typecheck`/`test` (48)/`build` + `sim` todos exit 0; `example` removido, lockfile regenerado. |

---

## Review adversarial (5 dimensões) — achados confirmados e correções

Review de 18 agentes; cada achado verificado por refutação independente. Nenhum **blocker** sobreviveu à verificação (os 2 "blockers" iniciais eram artefatos de probe injetados pelos próprios agentes e o guardrail já os pegava). Confirmados e **corrigidos nesta entrega**:

| # | Sev. | Achado | Correção |
|---|---|---|---|
| 1 | **major** | `onBeforeCommit` chamado sem `await` e tipado `() => void` → uma rejeição **assíncrona** no seam de pré-commit commitava a rodada mesmo assim (erro virava `unhandledRejection`). Quebra o all-or-nothing quando o trabalho real (DB, na 0.2) é async. | `publish.ts`: tipo → `() => void \| Promise<void>` e `await onBeforeCommit?.()`. Novo teste de rollback com rejeição assíncrona. |
| 2 | minor | `leagueId` fora da sub-seed → duas ligas com mesmo seed/temporada/ids geravam mundos byte-idênticos; chave de replay não-única. | `season.ts`: liga entra na `deriveSeed`. Novo teste de distinção entre ligas. Golden regenerado. |
| 3 | minor | `deriveSeed` juntava com `\|` sem escape → ids contendo `\|` colidiam (dois jogos, um só stream de RNG). | `prng.ts`: codificação por prefixo de comprimento (`len:valor`), **injetiva**. Novo teste de não-colisão. Golden regenerado. |
| 4 | minor | `anchor.test.ts` afirmava cobrir "positivos e negativos", mas o golden só tinha `epochMs` positivo → regressão no ramo de módulo negativo passaria no CI. | 3 vetores negativos (pré-1970) adicionados, validados por 2 métodos independentes; teste que **exige** cobertura negativa. |
| 5 | nit | Guardrail de determinismo cobria só 4 construtos (deixava transcendentais, `Intl.NumberFormat`/`Collator`, `localeCompare`, relógio e entropia passarem). | `eslint.config.mjs`: `no-restricted-properties` (verificado empiricamente — barra 11 construtos, permite `Math.floor`/`imul`/`sqrt`). |

**Confirmados e NÃO alterados (com justificativa):**
- **Bench 100 ms "frouxo" (minor)** — o teto é o **orçamento ratificado na SPEC** (Cenário 7), não um tripwire de regressão; o lock byte-a-byte é o golden. Documentado em comentário; um assert de baseline seria flaky em CI.
- **Bandas de credibilidade largas (nit)** — intencionais (documentam o alvo de design); o golden é o lock exato de qualquer drift de constante.
- **`isMatchWindow` cobre 15:00–15:59 (refutado)** — contrato pretendido (hora == 15), não defeito.

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| Todo o `packages/world-engine`, `harness/`, configs e docs desta entrega | ~100% | Sim — gerado por agente, verificado por execução real dos 4 gates + `sim`, **review adversarial de 5 dimensões** com refutação independente, e prova empírica do guardrail (probe removido após o teste). |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → Todas **dentro da intenção** da SPEC-002 (determinismo/atomicidade/replay são invariantes explícitos):
  - **Tuning do modelo de partida** — a constante `homeAdvantage` (em pontos de força) era quantizada a zero pela divisão inteira para times equilibrados (o mando "sumia"). Trocada por `homeConversionBonus` (bônus de conversão direto), calibrada contra o motor real (casa 43,7% / empate 23,2% / fora 33,1%). Achado por um teste de direção, não pelo review.
  - **5 correções do review adversarial** (tabela acima) — fixes de defeitos confirmados nos próprios invariantes da SPEC.
  - Nenhuma mudança de escopo de produto (sem persistência, sem auth, sem UI).

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo |
|---|---|---|
| Sub-seed `(seed, temporada, rodada, ids)` | Incluído `leagueId` | Chave de replay única por liga (review #2). |
| `deriveSeed` (concat simples) | Codificação injetiva por prefixo | Elimina colisão de delimitador (review #3). |
| Guardrail lint só com `Intl.DateTimeFormat` | Expandido (`no-restricted-properties`) | Defense-in-depth alinhado ao invariante de determinismo (review #5). |
| Âncora TZ em "processo separado" | Flip in-process de `TZ` | A impl comprovadamente não lê `Date`/`Intl`/TZ; o flip in-process + guardrail é evidência suficiente. Vetor negativo cobre o ramo frágil. |

---

## Limitações conhecidas

- **In-memory** — store/publisher provam o *contrato* de atomicidade, não isolamento de DB real (SPEC 0.2). Concorrência é in-process (lock), não distribuída/durável.
- **Modelo de partida mínimo** — só força agregada (0..100) + mando; sem moral/química/fôlego (Fase 1+). Constantes ratificáveis pelo founder.
- **1 liga / 1 divisão** — múltiplas ligas/divisões e promoção/rebaixamento ficam para a Fase 1.
- **Bench não é tripwire fino** — mede custo e checa o teto ratificado; regressões sutis de performance não disparam (o golden pega mudanças de resultado).

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Persistência real + atomicidade de DB (transação, idempotência durável, retry pós-crash) | Alto (é o money path) | SPEC 0.2 / 0.3. |
| `no-floating-promises`/`no-misused-promises` desligados (eslint sem type-check) — não pegariam o bug do seam async antes do fix | Médio | SPEC de endurecimento (ligar preset type-checked do tseslint). |
| Validação de charset de `id`/`seed` (a codificação é robusta, mas ids são free-form) | Baixo | Quando entrar entrada humana/dados (0.2). |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (8/8)
- [x] Testes criados e passando (48/48)
- [x] Typecheck limpo (inclui testes + harness)
- [x] Lint limpo (ESLint + Prettier); guardrail de determinismo provado empiricamente
- [x] Nenhum log de debug em código de produção
- [x] Nenhum tipo `any` (OP-14); função ≤50 linhas (OP-15); arquivo ≤300 linhas (OP-16)
- [x] Nenhum segredo hardcoded
- [x] Review adversarial (5 dimensões) executado; defeitos confirmados corrigidos
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` "Estado atual" atualizado
- [x] `docs/projeto/roadmap.md` status do item atualizado
- [x] Este DONE está completo *(commit pendente de confirmação do founder)*

---

*DONE-002 — método H1VE. Ver `specs/README.md` para o fluxo SPEC→DONE.*
