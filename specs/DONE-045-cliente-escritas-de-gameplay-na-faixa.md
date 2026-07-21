# DONE-045 — Cliente: escritas de gameplay na faixa (fatia 2 do cliente)

> Registro de conclusão. Par obrigatório da SPEC-045. Nenhum PR é válido sem este DONE.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-045 / DONE-045 |
| **Feature** | Cliente: escritas de gameplay na faixa (fatia 2 do cliente) |
| **Slug** | cliente-escritas-de-gameplay-na-faixa |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.4 (o cliente/faixa) + 3.7 (interação) |
| **Concluída em** | 2026-07-21 |
| **Dependências** | SPEC-041 (as 4 rotas POST) · SPEC-042 (o cliente WPF) · SPEC-038 (o agregador `/v1/band`) — todas em `main` |

---

## Resumo do que foi feito

A faixa deixou de ser **só-leitura** e virou **interativa**: o jogador **distribui pontos de treino**,
**responde decisões**, **compra** e **pede regen** direto na faixa, pelas 4 rotas POST da SPEC-041,
reconciliando via **re-leitura** do `/v1/band` (o servidor é a autoridade). A escolha do founder foi a
**Opção B** (servidor + cliente): o read-model ganhou o lado-de-leitura que faltava (aditivo, sem
migration, sem tocar engine/goldens), e o cliente fiou as 4 escritas.

**Servidor (leitura ADITIVA ao `GET /v1/band` — SEM migration, engine e os 5 goldens INTOCADOS):**
- `readPendingDecisions(db, athleteId, day)` no player-store — espelho do `countPendingDecisions`,
  devolvendo as **linhas** pendentes (`id`, `templateId`) ordenadas por `ord`.
- `BandState.decisions[]` — `{ id, templateId, type, prompt, options:[{id,label}] }`, hidratado do
  catálogo por `templateById` (fonte única). `pendingDecisions` **permanece** (= `decisions.length`).
- `BandHome.catalog[]` — todo `PURCHASES` com `owned`/`affordable`/`available`
  (`available = validatePurchase(...).ok`, a autoridade da regra reusada).
- `BandAthlete.canRegen` — dica (`club !== null && age >= REGEN_AGE.voluntary`).

**Cliente (WPF, estrutural — thin renderer, OP-17):**
- Espelho do contrato (`BandState.cs`): `BandDecision`/`BandDecisionOption`/`BandPurchase` + `Decisions`
  /`Home.Catalog`/`Athlete.CanRegen` (tolerante a null/ausente, default aditivo).
- `BandApiClient` ganhou os 4 POST → `WriteOutcome` roteado pelo `code` estável (OP-11); **nunca lança**.
- `BandActions` (novo) — o coordenador de escrita: POST → no sucesso/conflito **reconcilia** via
  `BandPoller.RefreshNow()`; 401 → reauth; cancela requests em voo no `Stop()` (não coordena pós-teardown).
- `BandPoller.RefreshNow()` — poll imediato fora-de-cadência, com **refresh enfileirado** (se um poll
  voa, re-dispara no `finally` — a reconciliação nunca se perde por 60s).
- `BandViewModel` — o estado das affordances (treino inline, `CurrentDecision`, `ShopItems`, regen em
  2 passos) + a linha de feedback transitória.
- `MainWindow` — treino inline (4 chips), `Popup`s de **decisão** e **loja**, o gesto de **regen com
  confirmação de 2 passos**; `e.Handled` (não fecha a faixa).

---

## Desvios da SPEC (mecanismo/necessidade, não de produto) — registrados

1. **`App.xaml.cs` NÃO foi tocado** (a SPEC o listava). O composition-root do `BandActions` ficou no
   `MainWindow` — é lá que vive o `BandPoller` (que o `RefreshNow` reconcilia), e a faixa (com poller +
   actions) é recriada por sessão no reauth. Wire mais coeso, um arquivo a menos.
2. **`WriteOutcome.cs` criado** (previsto na SPEC) — o resultado tipado da escrita (`WriteResult` +
   `code`), roteado pelo `code` estável.
3. **Regen com confirmação de 2 passos + glifo próprio (⚑)** — não estava na SPEC; entrou como fix da
   revisão (ação destrutiva num produto de baixa atenção). Ver revisão, achado 2.

---

## Revisão adversarial (Workflow · 3 lentes em paralelo · cada achado verificado ceticamente)

**Núcleo SÓLIDO — zero CRITICAL/MAJOR.** As 3 lentes (servidor/contrato · ciclo-de-vida/threading do
cliente · UI/contrato do cliente) confirmaram: a reconciliação server-first correta, o cancelamento
pós-teardown (a classe do MAJOR SPEC-042/044) coberto por `BandActions.Stop()`, o `RefreshNow`
enfileirado sem corrida, o espelho C# fiel, o `MapCode` completo vs o `DOMAIN_MAP`, OP-17 respeitado
(o cliente só dispara POSTs; o servidor valida), e **engine/5 goldens/schema intocados**. **8 achados
brutos → 5 confirmados (todos MINOR/NIT), todos corrigidos:**

- **[MINOR — servidor/teste] Buraco de cobertura da regra de ORDEM da moradia.** O `available` do
  catálogo não era isolado por teste: uma regressão que dropasse a checagem de próximo-degrau (só
  `canAfford`) passava verde (nos casos existentes, `casa` fora-de-ordem também era inacessível por
  saldo). **Fix:** assertar `cobertura` (tier3, affordable a 100k, fora de ordem) `available:false` —
  pina a regra de ORDEM isolada da affordability.
- **[MINOR — cliente/UI] Regen destrutivo com 1 clique + glifo compartilhado.** O `↻ regen` (ação
  IRREVERSÍVEL — encerra a carreira na virada) disparava com um clique e reusava o `↻` do inofensivo
  re-assistir → num produto de baixa atenção, um misclique perdia a carreira. **Fix:** **confirmação de
  2 passos** (armar → confirmar sim/não) + **glifo próprio ⚑ "renascer carreira"**.
- **[NIT — cliente/UI] `ToShopRow`/decisões sem guarda de null.** Um elemento null na lista (JSON
  hostil) lançava NRE e abortava o `Apply` no meio (render parcial) — o `MeOf` (Squad) já defendia esse
  caso, o catálogo/decisões não. **Fix:** `.Where(x => x is not null)` antes de mapear ambas as listas.
- **[NIT — cliente/UI] Formato de moeda inconsistente.** O custo da loja usava `int.ToString()` cru
  ("R$ 50000") vs o saldo `N0`/Culture ("R$ 50,000"). **Fix:** `p.Cost.ToString("N0", Culture)`.
- **[NIT — cliente/UI] `CurrentDecision` re-disparava a cada poll (churn).** O record compara `Options`
  por REFERÊNCIA → cada poll criava uma decisão "diferente" e regenerava os chips (um clique sob o
  cursor se perderia). **Fix:** diff por **identidade** (`Id`) — só re-atribui quando o Id muda.

**Refutados (3):** um alegado risco de coordenação pós-teardown no `BandActions` (já coberto pelo
`_stopped` + `_cts`), e dois que o verificador cético derrubou lendo o código.

---

## Arquivos modificados

**Servidor (6):** `services/player-store/src/store/decision-repo.ts` · `services/player-store/src/index.ts`
· `services/api/src/band/types.ts` · `services/api/src/band/from-player.ts` · `services/api/src/band/band-state.ts`
· `services/api/test/band-state.test.ts`.

**Cliente (novos):** `client/band-wpf/Api/WriteOutcome.cs` · `client/band-wpf/State/BandActions.cs`.
**Cliente (editados):** `client/band-wpf/Api/BandState.cs` · `Api/BandApiClient.cs` · `State/BandPoller.cs`
· `View/BandViewModel.cs` · `MainWindow.xaml` (+`.cs`) · `README.md`.

**Docs:** `specs/{SPEC,DONE}-045-...md`.

**Intocado (o critério DURO):** `packages/world-engine` + os **5 goldens** (`git diff` = 0) · **SEM
migration/schema novo** · `App.xaml.cs` não tocado.

---

## Critérios de aceitação

1. **Decisões no read-model** ✅ — `decisions` casa com as pendentes (contagem + hidratação do catálogo);
   `pendingDecisions === decisions.length`. (teste)
2. **Catálogo no read-model** ✅ — `owned`/`affordable`/`available` corretos vs saldo/posse, moradia em
   ordem (a regra de ORDEM isolada por teste). (teste)
3. **Distribuir treino** ✅ — chip `+Fís` → `POST /v1/training/spend` → reconcilia. (implementado; smoke)
4. **Responder decisão** ✅ — opção → `POST /v1/decisions/answer` → reconcilia → próxima aparece. (implementado; smoke)
5. **Comprar / regen** ✅ — `POST /v1/purchases` / `POST /v1/regen` (2 passos) → reconcilia. (implementado; smoke)
6. **Erro/edge** ✅ — feedback genérico pelo `code`, não trava, reconcilia. (implementado; smoke)
7. **O selo** ✅ — engine + 5 goldens byte-idênticos (`git diff` = 0); sem migration; `client/` fora do
   prettier/eslint; gates TS verdes.

⚠️ **Verificação:** o **servidor** (critérios 1-2, 7) foi verificado **ao vivo contra Postgres real**
(21 casos no `band-state.test.ts`, dentro dos 629 da suíte); o **cliente** (3-6) foi verificado por
`dotnet build` (0 avisos) + a revisão adversarial (3 lentes) — o **smoke visual medido é a ação do
founder** (método no `client/band-wpf/README.md`, passo 7).

---

## Gates de qualidade

- **629 testes** verdes (623 da base + 6 novos: decisões, catálogo com regra de ordem, canRegen), ao
  vivo contra Postgres; typecheck/eslint/prettier verdes.
- **`dotnet build` do cliente verde** (0 avisos/erros), antes E depois dos 5 fixes da revisão.
- **`git diff` engine + 5 goldens = 0**; **sem migration/schema**; `client/` fora dos gates npm.
- ⚠️ O **smoke ao vivo do cliente** (as 4 escritas na tela, o orçamento) é a **ação do founder** (headless aqui).

---

## Escopo deferido / follow-ups (nomeados)

- **A escolha do FOCO do treino** (hoje o acúmulo é idle no scheduler; o `spend` distribui no atributo
  escolhido, mas o foco da sessão é automático).
- **Otimista-UI** (hoje reconcilia por re-leitura — server-first).
- **Idempotência do `spend`** (débito da SPEC-041 — exigiria migration).
- **Localização (EN)** — o contrato já manda os `ids` junto do texto PT-BR (localização-ready); a
  fronteira keyed é fatia futura.
- **Arte/polish** — avatar em camadas, ícones, animação de compra (herda a SPEC-042).

---

## AI declaration

Implementação conduzida por agente de IA (Claude Code / Opus 4.8) em par com o dev. O servidor
(read-model aditivo) foi escrito e **verificado ao vivo contra Postgres real** (6 casos novos, 629 na
suíte). O cliente WPF foi escrito e **build-verificado** (`dotnet build`, 0 avisos). Uma **revisão
adversarial por Workflow (3 lentes em paralelo, cada achado verificado ceticamente)** confirmou o
núcleo sólido (zero CRITICAL/MAJOR) e pegou **5 achados MINOR/NIT** (buraco de cobertura da ordem de
moradia, regen destrutivo sem confirmação, guardas de null, formato de moeda, churn de decisão),
**todos corrigidos** e re-verdes. **Não houve revisão humana linha-a-linha**, e o **smoke visual do
cliente (as 4 escritas na tela + o orçamento) ainda não foi rodado** (ambiente headless) — o rigor veio
dos testes ao vivo, do build e da revisão; o smoke medido é a ação do founder. Os desvios (o `App.xaml.cs`
não tocado, o regen em 2 passos) estão registrados acima.

---

*DONE-045 — método H1VE. A faixa vira INTERATIVA: o jogador distribui treino, responde decisões, compra
e pede regen direto na faixa (SPEC-041), reconciliando server-first. Servidor: leitura aditiva no
`/v1/band` (decisões + catálogo + `canRegen`), SEM migration, engine e os 5 goldens INTOCADOS. Cliente:
as 4 escritas fiadas, estruturais, thin renderer (OP-17). Revisão adversarial: 5 MINOR/NIT corrigidos.*
