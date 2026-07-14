# SPEC-002 — Spike motor do mundo

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.
> Rascunho endurecido por um "understand pass" (4 lentes) + verificação adversarial (5 lentes, com repro empírica dos gates).

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-002 |
| **Feature** | Spike motor do mundo |
| **Slug** | spike-motor-do-mundo |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | De-risk **R1** (motor do mundo) — *"primeiro spike do F0"*; rodado **à frente de 0.2/0.4** (prove-the-heart). Adjacente à Fase 1. |
| **Appetite** | 14 dias — **kill-criteria R1: esforço de dev > 3 semanas = reavaliar** |
| **Prioridade** | HIGH (P0 — bloqueador de tese) |
| **Criada em** | 2026-07-14 |
| **Aprovada em** | 2026-07-14 |
| **Aprovada por** | Gustavo Hartz (founder/architect) |
| **Status** | Em desenvolvimento |

---

## Objetivo

Provar — de forma **auditável e reprodutível cross-ambiente** — que a arquitetura determinística do motor do mundo funciona, simulando **1 liga completa (10 clubes NPC, 18 rodadas)** com resolução por seed, **publicação atômica** da rodada e os **testes de propriedade** do money path, ancorados por **vetores golden congelados**. É um **spike de de-risking de R1**: valida a *arquitetura* (determinismo cross-plataforma, semântica de rollback, replay, idempotência sequencial, âncora de fuso) e **mede o custo de compute** por temporada e por K ligas para responder à pergunta de escala de R1 (*"simular todas as ligas"*). Não constrói o motor completo da Fase 1.

**Duas leituras de "custo" de R1, separadas explicitamente:**
- **Esforço de dev (o kill-criteria):** este spike cabe em **< 3 semanas** de desenvolvimento. Medido pelo tempo de calendário da sessão — não por um bench.
- **Custo de compute (evidência de escala):** o bench mede **wall-time por temporada** e por **K ligas**, extrapolado contra o **N-alvo** do mundo e o **orçamento do tick 3×/semana** (ver Cenário 7 — números ratificáveis na aprovação).

---

## Contexto e motivação

A tese — *"o mundo vive sem humanos"* — só se sustenta se a rodada for **determinística e auditável** (SDD D1–D4). **R1** é o maior risco técnico; a mitigação declarada é *"primeiro spike do F0; arquitetura determinística simples; kill-criteria: > 3 semanas = reavaliar"*.

**Resequenciamento (drift resolvido com o founder):** este spike roda **à frente de 0.2 (dados) e 0.4 (segurança)** — ratificado, coerente com *"provar o coração primeiro"* + a mitigação de R1. Como 0.2/0.4 não existem, o spike é **autossuficiente**: persistência **in-memory**, sem rota autenticada. `CLAUDE.md`/`roadmap.md` serão atualizados ao final da sessão.

É o primeiro código de domínio real — substitui o placeholder `packages/example` por **`packages/world-engine`** (nome reservado na SPEC-001).

**Decisões ratificadas pelo founder (2026-07-14):** (1) spike à frente de 0.2; (2) persistência **shim transacional in-memory**; (3) resolução de partida **mínima** (força agregada por clube + PRNG semeado). O princípio de determinismo cross-plataforma (sem transcendentais, sem `Intl`/`Date`, golden commitado) está detalhado no Objetivo, Riscos e Notas.

---

## Escopo — o que está DENTRO

- [ ] **`packages/world-engine`** — substitui `packages/example`; duas árvores de módulo, **ambas sob o guardrail de determinismo** (relógio e aleatoriedade sempre injetados):
  - **`src/engine/` — simulação PURA determinística cross-plataforma:**
    - **PRNG semeado** — hash da seed (cyrb128) + gerador (sfc32), **só aritmética uint32** (`>>> 0`), saída `(x >>> 0) / 2**32` (exata: divisão por potência de 2). Estado `{a,b,c,d}` serializável. Sub-seeds por rodada/partida derivadas da seed da temporada. **Vetor known-answer (KAT) commitado.**
    - **Fixtures** — turno-returno determinístico: 10 clubes → 18 rodadas, 5 partidas/rodada, 90 partidas, mando ida/volta.
    - **Resolução de partida** — `(forçaCasa, forçaFora, bônusMando, rng) → placar`, **sem transcendentais**: gols amostrados por **CDF de Poisson tabelada em ponto-fixo/inteiro** (tabela pré-computada e commitada como constante) comparada contra uniforme uint32 — só `+,-,*,/` e comparação. Constantes de força/spread/mando centralizadas (ver Notas). **Alvo verificável de credibilidade:** taxa de vitória do favorito na temporada dentro de **~45–70%** (teste).
    - **Classificação** — pontos **3/1/0**, desempate **pontos → saldo → gols pró → ordem estável por id** (ordem total determinística). **Sem confronto direto** (Fase 1).
    - **Season runner** — função pura `(seed, estadoInicial) → { rodadas[], tabelaFinal }`.
  - **`src/orchestration/` — coordenação** (relógio injetado como valor; pura o suficiente p/ o guardrail):
    - **Store transacional in-memory** — `begin/stage/commit/rollback` via staging + swap; a API de leitura **nunca** expõe estado intermediário.
    - **Publicador da rodada** — publica as 5 partidas de **uma rodada** all-or-nothing; **chave de idempotência** `(ligaId, temporadaId, nºRodada)` + **lock** (publish **async** com ponto de await entre check e commit, p/ o lock não ser decorativo); retry sequencial in-process é no-op idempotente.
    - **Anchor de fuso** — `(epochMs) → parts de parede em UTC-3` por **aritmética de epoch** (offset fixo -3h), **sem `Intl`/ICU/`Date`**. Decide o slot ter/qui/sáb 15h Brasília. **Vetor golden commitado** (epochMs → decisão), incluindo vetores na fronteira do dia.
  - `src/types.ts` · `src/index.ts` · `src/data/league-seed.ts` (10 clubes NPC + forças, dado puro) · `src/constants.ts` (força base, spread, bônus de mando) · `src/__fixtures__/` (golden: PRNG KAT, temporada canônica, âncora).
- [ ] **`harness/run-season.ts`** (top-level, **fora** de `packages/*/src`): a **única borda impura** — lê `SEED` do env (**fail-fast** com erro genérico se ausente/vazia — OP-11) + o relógio real, roda 1 temporada e reporta wall-time. Evidência de custo de compute.
- [ ] **Testes de propriedade (money path)** — `*.test.ts`, com **golden congelado como âncora cross-ambiente**:
  - **Determinismo + golden de temporada** — mesma seed → temporada bit-idêntica em ≥2 execuções **E** bate com o hash golden commitado (dos 90 placares + tabela final). É o teste que reprova quando o ambiente diverge.
  - **PRNG KAT** — os primeiros K outputs de uma seed batem com o vetor commitado.
  - **Fuso (positivo, golden)** — `epochMs` conhecidos → slot de parede UTC-3 esperado, incluindo fronteira de dia; independência de TZ validada em **processo separado** (`TZ=Pacific/Kiritimati`), restaurando TZ em `afterEach`.
  - **Replay** — re-derivar de (seed + estado) bate com o snapshot publicado (e com o golden).
  - **Contrato de publicação / falha parcial** — falha injetada na **N-ésima** das 5 partidas → rollback total; **nenhum leitor** jamais observa estado intermediário (o commit é o único ponto de mutação visível).
  - **Idempotência sequencial** — re-executar a rodada (chave + lock) não duplica; duas chamadas **async sobrepostas** resultam em **uma** publicação (exercita o lock).
- [ ] **Bench de custo (compute) + escala** — teste que roda 1 temporada e reporta wall-time (`performance.now()`), com **teto NUMÉRICO** (Cenário 7); e um **loop de K ligas** (mesma orquestração, K seeds) medindo custo total p/ validar **escala ~linear** e ausência de contenção no store/lock.
- [ ] **Integração no monorepo** — `world-engine` como workspace com project reference + `paths` **relativos** (sem `baseUrl`); `node` types onde há globals; remoção do `packages/example`; guardrail estendido p/ barrar `Intl.DateTimeFormat`/`Date` em `packages/*/src`; os 4 gates verdes.

---

## Escopo — o que está FORA

- **Camada de dados real (Postgres/Neon, schema, migrations)** — SPEC 0.2. Persistência é **in-memory**; OP-01 não se aplica (sem schema). **A atomicidade transacional de BANCO (commit parcial, isolamento, queda no COMMIT) permanece ABERTA e migra para a 0.2** — o spike prova o *contrato* do publicador, não atomicidade de DB.
- **Concorrência/durabilidade reais** — lock distribuído, dedup de fila, chave **durável** (retry pós-crash sobrevivendo a restart), cron sobreposto/dois workers na mesma rodada — migram para a 0.2/orquestração deployada. O spike prova **idempotência sequencial in-process**.
- **Protocolo de falha PÚBLICA ("evento de reparação"/post-mortem ao usuário)** — o 5º item do gate money path; o spike prova a **semântica técnica** de rollback/adiamento, e o protocolo público vira **precondição rígida de 1.2** (ver Checklist).
- **Infra de auditoria durável (event-sourcing persistido, seed por temporada em DB)** — 0.3. Replay aqui é **re-derivação + golden commitado**.
- **Baseline de segurança (auth → autz → validação)** — 0.4. Sem rota HTTP exposta (OP-09 não se aplica).
- **Todas as ligas / múltiplas divisões / gradiente / promoção-rebaixamento** — Fase 1/4. Spike é **1 liga, 1 divisão** (o loop de K ligas é só medição de custo, não domínio novo).
- **Riqueza de partida** — 12 atributos, moral dinâmica, forma/fôlego, eventos de escolha, minuto-a-minuto, lesões/cartões, **confronto direto** — Fase 2/3 / feature 1.1.
- **Ciclo de vida do NPC (1.3), transferências (1.4), painel de auditoria UI (1.5)** — Fase 1.
- **Copa/calendário Liga-Copa** — `3×/semana` é só a cadência do job; spike é pontos corridos.
- **Cron deployado, cliente/UI, i18n, CPU <1%** — server-only, fora do spike.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição |
|---|---|---|
| `packages/world-engine/package.json` | criar | Package `@camisa-9/world-engine`, scripts `build`/`test`. |
| `packages/world-engine/tsconfig.json` | criar | Estende base; `composite`, `outDir dist`, exclui testes/fixtures do build. |
| `packages/world-engine/src/index.ts` | criar | API pública (barrel). |
| `packages/world-engine/src/types.ts` | criar | Tipos de domínio. |
| `packages/world-engine/src/constants.ts` | criar | Força base, spread, bônus de mando (ratificáveis). |
| `packages/world-engine/src/data/league-seed.ts` | criar | Estado inicial (10 clubes NPC + forças), dado puro. |
| `packages/world-engine/src/engine/prng.ts` (+ `.test.ts`) | criar | PRNG uint32 (cyrb128+sfc32), estado serializável; teste KAT. |
| `packages/world-engine/src/engine/fixtures.ts` (+ `.test.ts`) | criar | Turno-returno (10→18). |
| `packages/world-engine/src/engine/match.ts` (+ `.test.ts`) | criar | Placar por CDF Poisson tabelada (sem transcendentais); teste de credibilidade. |
| `packages/world-engine/src/engine/standings.ts` (+ `.test.ts`) | criar | 3/1/0 + desempate estável (sem confronto direto). |
| `packages/world-engine/src/engine/season.ts` (+ `.test.ts`) | criar | Season runner; testes **determinismo + golden**, **replay**, **bench + K-ligas**. |
| `packages/world-engine/src/orchestration/store.ts` (+ `.test.ts`) | criar | Store transacional in-memory; teste de **contrato/falha parcial**. |
| `packages/world-engine/src/orchestration/anchor.ts` (+ `.test.ts`) | criar | Âncora UTC-3 por aritmética de epoch (sem Intl/Date); teste **golden de fuso**. |
| `packages/world-engine/src/orchestration/publish.ts` (+ `.test.ts`) | criar | Publicador async; testes **idempotência (sequencial + sobreposta)**. |
| `packages/world-engine/src/__fixtures__/*.json` | criar | Golden: PRNG KAT, temporada canônica (hash), âncora. |
| `harness/run-season.ts` | criar | Borda impura (`SEED` env fail-fast + relógio real); reporta wall-time. |
| `harness/tsconfig.json` | criar | Non-composite, `noEmit`, `types:["node"]` (p/ tsx/editor). |
| `tsconfig.json` | modificar | Trocar reference `./packages/example` por `./packages/world-engine`. **NÃO** referenciar harness. |
| `tsconfig.base.json` | modificar | `paths` **relativos** (`"@camisa-9/world-engine": ["./packages/world-engine/src/index.ts"]`). **Sem `baseUrl`** (TS6: deprecado). |
| `tsconfig.typecheck.json` | modificar | Incluir `harness/**/*.ts` + `"types": ["node"]`. |
| `eslint.config.mjs` | modificar | Estender o guardrail p/ barrar `Intl.DateTimeFormat` (e manter `Date`) em `packages/*/src`. |
| `package.json` | modificar | Script `sim` = `npm run build && tsx harness/run-season.ts`; devDep `tsx`. |
| `package-lock.json` | modificar | Regenerado (adiciona `tsx`, novo workspace, remove `example`). |
| `README.md` | modificar | Bloco "Estrutura": remover `example/`, listar `world-engine/` (engine/ + orchestration/). |
| `packages/example/**` | deletar | Remover o placeholder (4 arquivos). |
| `specs/DONE-002-spike-motor-do-mundo.md` | criar | DONE ao final da sessão, antes do PR. |
| `CLAUDE.md` | modificar | "Estado atual" + nota de resequenciamento. |
| `docs/projeto/roadmap.md` | modificar | Registrar o spike à frente de 0.2/0.4 (R1). |

> A IA só toca arquivos desta lista. Qualquer arquivo fora dela exige aprovação prévia.

---

## Mudanças de schema (se aplicável)

Nenhuma migration. Persistência **in-memory**. O schema versionado é a **SPEC 0.2** — e a atomicidade transacional de banco é explicitamente adiada para lá.

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API. Job/harness interno, sem rota HTTP.

---

## Critérios de aceitação

**Cenário 1 — Determinismo + golden cross-ambiente**
- Dado a mesma seed + estado inicial
- Quando rodo a temporada (18 rodadas / 90 partidas) ≥2× **e** comparo com o hash golden commitado
- Então os resultados são bit-idênticos entre si **e** batem com o golden — e, por o golden ter sido gerado no dev e assertado no CI (OS/Node diferentes), isso prova determinismo cross-ambiente.

**Cenário 2 — Âncora de fuso (positivo + golden)**
- Dado `epochMs` conhecidos (incluindo fronteira de dia) e o offset fixo UTC-3
- Quando calculo o slot de parede da rodada (sem `Intl`/`Date`)
- Então bate com o vetor golden; e rodando o teste sob `TZ=Pacific/Kiritimati` (processo separado) o resultado é idêntico.

**Cenário 3 — Contrato de publicação / falha parcial**
- Dado a publicação de uma rodada com falha injetada na **N-ésima** partida
- Quando a transação falha
- Então há rollback total e **nenhum leitor** observa estado intermediário (commit é o único ponto de mutação visível). *(Nota: prova o contrato do publicador, não atomicidade de DB — essa é a 0.2.)*

**Cenário 4 — Idempotência (sequencial + sobreposta)**
- Dado uma rodada
- Quando a publico 2× em sequência **e** com duas chamadas async sobrepostas (mesma chave, sob lock)
- Então há **uma** publicação; o mundo não avança 2×; retry in-process reproduz o mesmo resultado. *(Concorrência real/durável é 0.2.)*

**Cenário 5 — Replay auditável**
- Dado o snapshot publicado
- Quando re-derivo de (seed + estado)
- Então bate 100% com o publicado e com o golden.

**Cenário 6 — Fixtures + classificação**
- Dado 10 clubes → **18 rodadas, 5 partidas/rodada, 90 partidas**, cada par 2× (mando invertido); classificação 3/1/0 + desempate estável por id.

**Cenário 7 — Custo de compute + escala (números ratificáveis)**
- Dado o bench
- Quando rodo 1 temporada e um loop de **K = 64** ligas
- Então: (a) 1 temporada **< 100 ms** em CI (asserção NUMÉRICA); (b) K ligas escalam **~linear** (sem contenção do store/lock); (c) extrapolando para o **N-alvo do mundo** contra o **orçamento do tick** a resposta de R1 é go/no-go. *(**N-alvo e orçamento propostos, a ratificar na aprovação:** N ≈ 256 ligas; tick 3×/semana deve fechar em < 5 min no hardware-alvo → orçamento ≈ 1,17 s/liga; com < 100 ms/temporada há folga de ~10×.)*

**Cenário 8 — Gates verdes (clean checkout)**
- Dado o monorepo com `world-engine` (e `packages/example` removido, lockfile regenerado)
- Quando rodo `npm ci && npm run lint && npm run typecheck && npm test && npm run build` e `npm run sim`
- Então tudo termina com código 0 (guardrail respeitado; `sim` builda antes de rodar).

---

## Segurança (se aplicável)

Sem superfície de auth/autz (baseline é a 0.4). A **seed** é insumo via env (`SEED`), nunca hardcoded/commitada (**OP-12/OP-02**); ausente/vazia → **fail-fast** com erro genérico (**OP-11**), sem stack/segredo em log. Determinismo/atomicidade são as propriedades de integridade centrais (base do anti-fraude server-side, SDD §3).

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Não-determinismo cross-plataforma** (float transcendental / ICU) corrompe replay/auditoria | Alta→Baixa | **Sem transcendentais** (Poisson tabelado inteiro) e **sem Intl/Date** (UTC-3 aritmético); **golden commitado** assertado no CI (dev≠CI = teste cross-ambiente). |
| **R1 se materializa** — esforço de dev > 3 semanas | Média | Escopo mínimo travado; sem gold-plating (cortado confronto direto); decomposição em módulos pequenos. |
| Custo de compute em N ligas estoura o tick | Média | Bench com **teto numérico** + loop de K ligas + extrapolação contra N-alvo/orçamento (Cenário 7). |
| Shim in-memory prova menos que DB | Média (aceito) | Claim honesto: prova **contrato** do publicador; atomicidade de DB e concorrência migram para 0.2 (registrado em FORA). |
| Integração no monorepo (typecheck pré-build) | Baixa | `paths` relativos sem `baseUrl`; harness só no typecheck (não em references); `node` types; validado rodando os 4 gates. |

**Dependências:** SPEC-001 (feito/mergeado). **Não** depende de 0.2/0.4.

---

## Notas de implementação

- **PRNG/Placar/Âncora** (detalhados em DENTRO): só aritmética uint32/inteira; CDF de Poisson **tabelada** (sem `exp/log/pow`); âncora por **aritmética de epoch UTC-3** (sem `Intl`/`Date`). Constantes em `constants.ts` (ratificáveis); alvo: vitória do favorito ~45–70%/temporada.
- **Guardrail:** estender `eslint.config.mjs` p/ barrar `Intl.DateTimeFormat` (além de `Date`) em `packages/*/src`. O único `Date.now` mora no `harness/`.
- **Golden como gate cross-ambiente:** commitar hash da temporada canônica + KAT do PRNG + vetor de âncora; assertar no CI (o gap dev↔CI já dá 2 ambientes; matriz multi-Node no `ci.yml` é hardening futuro, fora do escopo).
- **tsconfig:** `paths` relativos (com `./`) no base, **sem `baseUrl`** (TS6→TS5101). Harness **fora** de `references` (evita TS6310 sob `--noEmit`); type-check via `tsconfig.typecheck.json` com `"types":["node"]`. `sim` builda antes do tsx.
- **Store/publish:** `commit` = swap atômico; leitura nunca vê staging. `publish` **async** (await entre check e commit → lock real).
- **OPs herdadas:** TS strict, sem `any` (OP-14), ≤50 linhas/função (OP-15), ≤300/arquivo (OP-16), Node ≥20.19.
- **Ritual de fim de sessão:** criar `DONE-002` (seções CI-lint: `## Resumo do que foi feito`, `## Arquivos modificados`, `## Critérios de aceitação`, `## AI Declaration` — copiar de `DONE-TEMPLATE.md`), atualizar `CLAUDE.md`/`roadmap.md`/`README.md`, abrir PR + `nf done`.

---

## Checklist de aprovação

- [ ] Objetivo claro (spike de de-risk; determinismo cross-ambiente por golden)
- [ ] Escopo bem delimitado; FORA barra Fase 1/1.1 e reconcilia os carve-outs
- [ ] Arquivos corretos e completos (inclui `package-lock.json`, `README.md`, `eslint.config.mjs`, remoção do `example`, DONE-002)
- [ ] Critérios de aceitação testáveis (golden congelado; teto numérico de custo)
- [ ] Riscos avaliados (determinismo cross-plataforma no centro)
- [ ] Appetite (14 dias) coerente com o kill-criteria de 3 semanas
- [ ] **Carve-out consciente do gate money path:** os 4 itens exercitáveis (determinismo, fuso, replay, falha parcial) são provados; o 5º — **protocolo de falha PÚBLICA** — é adiado (spike sem superfície pública/cron) e vira **precondição rígida de 1.2**, para o Data sign-off não travar.
- [ ] **Números de R1 ratificados:** teto de compute (< 100 ms/temporada) · N-alvo (≈256 ligas) · orçamento do tick (< 5 min)
- [ ] **Decisões ratificadas:** spike à frente de 0.2 · persistência in-memory · resolução mínima (força + PRNG)

---

*SPEC-002 — método H1VE. Rascunho para aprovação do founder. Ver `specs/README.md` para o fluxo SPEC→DONE.*
