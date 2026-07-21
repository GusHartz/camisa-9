# SPEC-045 — Cliente: escritas de gameplay na faixa (fatia 2 do cliente)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-045 |
| **Feature** | Cliente: escritas de gameplay na faixa (fatia 2 do cliente) |
| **Slug** | cliente-escritas-de-gameplay-na-faixa |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.4 (o cliente/faixa) + 3.7 (interação) — a faixa deixa de ser só-leitura |
| **Appetite** | 14 dias |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-21 |
| **Aprovada em** | {preencher após aprovação} |
| **Aprovada por** | {preencher após aprovação} |
| **Status** | Rascunho |

---

## Objetivo

A faixa deixa de ser um painel de **leitura** e vira o lugar onde o jogador **age**: distribui os
pontos de treino acumulados, **responde as decisões** da carreira, **compra** no catálogo e **pede o
regen** — tudo DIRETO na faixa, pelas 4 rotas POST que a SPEC-041 já entregou. Hoje o jogador vê o
`freePoints` e o número de decisões pendentes, mas não tem onde clicar; esta fatia fecha o loop
"ver → agir → ver o efeito" no mesmo lugar onde a carreira já vive.

---

## Contexto e motivação

A **SPEC-041** entregou as 4 escritas de gameplay no servidor (`POST /v1/training/spend`,
`/v1/decisions/answer`, `/v1/purchases`, `/v1/regen`) — validadas, autorizadas por construção, com
erros tipados. A **SPEC-042** entregou o cliente WPF só-leitura (poll do `GET /v1/band`). Faltava o
elo: **o jogador ainda não consegue agir pela faixa** — as rotas existem, o cliente existe, mas nada
os liga.

O gargalo é o **read-model**: o `/v1/band` hoje só expõe a *contagem* de decisões (`pendingDecisions:
number`) e o `ownedItemIds`/`balance` — **não** a lista de decisões (ids + prompt + opções) nem o
**catálogo** de compras (itemIds + custos). Sem esses dados o cliente não tem como montar as
telas de "responder" e "comprar". Por isso esta fatia é **servidor + cliente** (a escolha do founder,
Opção B): primeiro o `/v1/band` ganha o lado-de-leitura que faltava (aditivo, sem migration, sem tocar
o engine), depois o cliente fia as 4 escritas.

Isso realiza o pilar **"interagir"** (a diretriz do founder na SPEC-043: *tudo voltado para o jogador
curtir e ficar preso interagindo*) e o **"Dia do Jogador"** do R4 — a batida diária (treino de manhã,
decisões à noite) finalmente tem onde ser **jogada**, não só assistida.

---

## Escopo — o que está DENTRO

**Servidor (aditivo ao contrato `/v1` — sem migration, sem tocar engine/goldens):**

- [ ] `services/player-store`: `readPendingDecisions(db, athleteId, day)` — espelho do
  `countPendingDecisions`, devolvendo as **linhas** pendentes do dia (`id` uuid, `templateId`, `type`,
  `ord`), ordenadas por `ord`. Reusa a tabela `decision` existente (zero schema novo).
- [ ] `services/api` — `/v1/band` ganha, **aditivamente** (campo novo pode aparecer; nada existente
  muda de tipo nem some):
  - `BandState.decisions: readonly BandDecision[]` — a lista das decisões pendentes do dia, cada uma
    com `{ id (uuid), templateId, type, prompt, options: [{ id, label }] }`. O `pendingDecisions:
    number` **permanece** (aditivo-only), agora derivado de `decisions.length`.
  - `BandHome.catalog: readonly BandPurchase[]` — o catálogo (de `PURCHASES`), cada item com
    `{ id, name, cost, kind, housingTier (number|null), owned, affordable, available }`, onde
    `available = validatePurchase(balance, owned, id).ok` (pode comprar AGORA) e `affordable =
    canAfford(balance, id)`.
  - `BandAthlete.canRegen: boolean` — `club !== null && age !== null && age >= REGEN_AGE.voluntary`
    (a dica de elegibilidade do regen voluntário; o servidor segue a autoridade real via 409).
- [ ] Testes do agregador (`band-state.test.ts`/`from-world.test.ts`): a lista de decisões casa com as
  pendentes; o catálogo reflete `owned`/`balance` (owned/affordable/available corretos, moradia em
  ordem); `canRegen` por idade/clube; a forma **aditiva** do contrato preservada.

**Cliente (WPF, estrutural — thin renderer, OP-17):**

- [ ] `Api/BandState.cs`: espelha `BandDecision`, `BandDecisionOption`, `BandPurchase`,
  `Decisions`, `Home.Catalog`, `Athlete.CanRegen` (tolerante a null/ausente).
- [ ] `Api/BandApiClient.cs`: os 4 POST — `SpendTrainingAsync(attribute)`,
  `AnswerDecisionAsync(decisionId, optionId)`, `PurchaseAsync(itemId)`, `RegenAsync()` — cada um
  devolvendo um `WriteOutcome(status, code, retryAfterSec)` roteado pelo `code` estável do servidor
  (nunca pela frase, OP-11), e que **nunca lança** (o padrão do `GetBandAsync`: catch final).
- [ ] `State/BandActions.cs` (novo): o coordenador de escrita — dispara a POST e, no sucesso,
  **reconcilia** relendo o `/v1/band` (a autoridade é o servidor). Contraparte de escrita do
  `BandPoller`.
- [ ] `State/BandPoller.cs`: `RefreshNow()` — um poll imediato fora-de-cadência (a reconciliação
  pós-escrita), respeitando o `_busy`/`_stopped`.
- [ ] `View/BandViewModel.cs`: o estado das affordances (os 4 botões de treino quando `freePoints>0`;
  a decisão corrente + opções; o catálogo; `canRegen`) + uma **linha de feedback transitória** da
  ação ("+1 no físico", "comprado!", "sem saldo", "elegível a partir dos 25").
- [ ] `MainWindow.xaml`/`.cs`: as affordances **estruturais** — treino inline (4 botões-texto) e
  `Popup`s compactos para **decisão** (prompt + opções) e **loja** (itens compráveis); o "pedir regen"
  quando `canRegen`. Cada gesto → `BandActions` → reconcilia. `e.Handled` para não fechar a faixa.
- [ ] `App.xaml.cs`: fia o `BandActions` na composição (o composition-root).

---

## Escopo — o que está FORA

- **Qualquer regra de gameplay no cliente** (OP-17): o cliente só renderiza affordances e dispara
  POSTs; **toda** validação (saldo, ordem de moradia, opção válida, elegibilidade do regen, pontos
  livres) é do servidor — `canRegen`/`available`/`affordable` são **dicas de render**, nunca a
  autoridade (o 409/400 é sempre tratado).
- **Idempotência do `spend`** (débito conhecido da SPEC-041): a distribuição de ponto segue
  at-least-once (sem token de dedup — exigiria migration). A faixa reconcilia relendo o `/v1/band`.
  Fora desta fatia.
- **Localização (EN)**: o produto é BR-first no F0/beta. O contrato manda o `templateId`/`optionId`/
  `itemId` (localização-ready) **junto** do texto PT-BR (o cliente exibe hoje sem uma tabela de
  strings própria; quando o EN entrar, a fronteira de i18n vira um sistema keyed — follow-up nomeado).
- **Arte/polish**: avatar em camadas, ícones, animação de compra, otimista-UI. Render estrutural
  (texto/botões/blocos de cor) — a arte é fatia futura (herda a SPEC-042).
- **Novas rotas/schema**: nenhuma rota nova, nenhuma coluna/tabela nova. Só leitura aditiva no
  `/v1/band` + consumo das 4 POST existentes.
- **Efeitos do outcome de decisão / trade-off de compra**: já são seams aplicados por outros sistemas
  (a 2.3 aplica moral; a viragem executa transferência). O cliente não os aplica.
- **Escolher o foco do treino** (o `spend` distribui 1 ponto num atributo; o *foco da sessão* de
  treino é o passe automático do scheduler, não uma escrita da faixa).

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `services/player-store/src/store/decision-repo.ts` | modificar | `readPendingDecisions(db, athleteId, day)` → linhas pendentes (`id`, `templateId`, `type`, `ord`). |
| `services/player-store/src/index.ts` | modificar | Exporta `readPendingDecisions` + o tipo da linha. |
| `services/api/src/band/types.ts` | modificar | `BandDecision`/`BandDecisionOption`/`BandPurchase`; `decisions` em `BandState`; `catalog` em `BandHome`; `canRegen` em `BandAthlete`. |
| `services/api/src/band/from-player.ts` | modificar | `buildDecisions(rows)`, `buildCatalog(wallet)`; `buildHome` ganha `catalog`; `buildAthlete` ganha `canRegen` (param). |
| `services/api/src/band/band-state.ts` | modificar | Lê as decisões pendentes (lista → `decisions` + `pendingDecisions=length`); calcula `canRegen` (`REGEN_AGE.voluntary`); passa o catálogo. |
| `services/api/test/band-state.test.ts` | modificar | Casos: lista de decisões, catálogo (owned/affordable/available/moradia), `canRegen`, forma aditiva. |
| `services/api/test/from-world.test.ts` | modificar | (Se necessário) fixtures do lado-mundo p/ `canRegen`/idade. |
| `client/band-wpf/Api/BandState.cs` | modificar | Espelha `BandDecision`/`BandDecisionOption`/`BandPurchase`, `Decisions`, `Home.Catalog`, `Athlete.CanRegen`. |
| `client/band-wpf/Api/BandApiClient.cs` | modificar | Os 4 POST + `WriteOutcome`; roteia pelo `code`; nunca lança. |
| `client/band-wpf/Api/WriteOutcome.cs` | criar | O resultado tipado de uma escrita (status + code + retryAfter). |
| `client/band-wpf/State/BandActions.cs` | criar | Coordenador de escrita: POST → reconcilia (`RefreshNow`). |
| `client/band-wpf/State/BandPoller.cs` | modificar | `RefreshNow()` — poll imediato fora-de-cadência. |
| `client/band-wpf/View/BandViewModel.cs` | modificar | Estado das affordances + feedback transitório da ação. |
| `client/band-wpf/MainWindow.xaml` | modificar | Affordances estruturais: treino inline + `Popup`s de decisão e loja + pedir regen. |
| `client/band-wpf/MainWindow.xaml.cs` | modificar | Handlers de clique → `BandActions`; `e.Handled`. |
| `client/band-wpf/App.xaml.cs` | modificar | Fia o `BandActions` na composição. |
| `client/band-wpf/README.md` | modificar | Documenta as 4 escritas + o método de smoke. |
| `specs/SPEC-045-...md` / `specs/DONE-045-...md` | criar | Esta SPEC + o DONE. |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema nesta feature. Todo o dado novo do read-model deriva de colunas/tabelas
existentes: a lista de decisões vem da tabela `decision` (SPEC-025); o catálogo vem da constante pura
`PURCHASES` (SPEC-024) cruzada com `balance`/`ownedItemIds`; `canRegen` deriva de `age` (overlay do
mundo) + `REGEN_AGE.voluntary`. **Sem migration.**

---

## Mudanças de API (se aplicável)

**Nenhuma rota nova.** As 4 escritas já existem (SPEC-041) e são consumidas como estão. A única
mudança de API é **aditiva** ao `GET /v1/band` (contrato `/v1`, política aditiva-only):

```
GET /v1/band  (aditivo — campos novos)
  athlete.canRegen: boolean
  home.catalog: [{ id, name, cost, kind, housingTier: number|null,
                   owned: boolean, affordable: boolean, available: boolean }]
  decisions: [{ id: uuid, templateId, type, prompt,
                options: [{ id, label }] }]
  // pendingDecisions: number  — PERMANECE (= decisions.length)

Rotas consumidas (SPEC-041, inalteradas):
  POST /v1/training/spend   Body: { attribute: 'fisico'|'tecnico'|'tatico'|'mental' }  → 200 { ok }
  POST /v1/decisions/answer Body: { decisionId: uuid, optionId: string }               → 200 { ok }
  POST /v1/purchases        Body: { itemId: string }                                    → 200 { ok }
  POST /v1/regen            (sem body)                                                  → 200 { ok }
  Erros tipados: 400 invalid_input/invalid_option · 409 no_free_points/decision_resolved/
                 insufficient_balance/already_owned/conflict/regen_ineligible · 429 (Retry-After)
```

**i18n:** o contrato manda o `templateId`/`optionId`/`itemId` (localização-ready) **junto** do texto
PT-BR (`prompt`/`label`/`name`), de fonte única (as libs puras `decisions.ts`/`economy.ts`). Hoje o
cliente exibe o texto direto (zero tabela de strings, zero drift); quando o EN entrar, o cliente passa
a localizar pelos ids (a fronteira de i18n) — follow-up nomeado. Isto é conteúdo de gameplay, distinto
da prosa de erro/chrome que o "zero prosa na API" (OP-11) proíbe.

---

## Critérios de aceitação

**Cenário 1 — o read-model expõe as decisões pendentes**
- Dado um atleta com N decisões pendentes geradas no dia (`generateForDay`)
- Quando o cliente lê `GET /v1/band`
- Então `decisions` tem N itens com `id`/`templateId`/`prompt`/`options` corretos (o `prompt`/`options`
  hidratados do catálogo por `templateId`), e `pendingDecisions === N`.

**Cenário 2 — o read-model expõe o catálogo com estado**
- Dado um atleta com `balance` B e `ownedItemIds` O
- Quando o cliente lê `GET /v1/band`
- Então `home.catalog` lista todo `PURCHASES` com `owned` (∈ O), `affordable` (`cost ≤ B`) e
  `available` (`validatePurchase.ok` — não possuído, moradia no próximo degrau, com saldo) corretos.

**Cenário 3 — distribuir um ponto de treino pela faixa**
- Dado um atleta com `freePoints ≥ 1` e a faixa aberta
- Quando o jogador clica `+Físico`
- Então o cliente faz `POST /v1/training/spend {attribute:'fisico'}`, no 200 reconcilia relendo o
  `/v1/band`, e a faixa mostra o `fisico` +1 e o `freePoints` −1.

**Cenário 4 — responder uma decisão pela faixa**
- Dado um atleta com ao menos 1 decisão pendente
- Quando o jogador abre a decisão e escolhe uma opção
- Então o cliente faz `POST /v1/decisions/answer {decisionId, optionId}`, no 200 reconcilia, e a
  decisão sai da lista (`pendingDecisions` −1).

**Cenário 5 — comprar e pedir regen**
- Dado um item `available` no catálogo (e, em outro caso, um atleta com `canRegen=true`)
- Quando o jogador clica "comprar" (resp. "pedir regen")
- Então o cliente faz `POST /v1/purchases {itemId}` (resp. `POST /v1/regen`), no 200 reconcilia (o item
  vira `owned`, o saldo cai; resp. o pedido é registrado com feedback).

**Cenário 6 — erro / edge case**
- Dado um `spend` sem pontos (409 `no_free_points`), uma compra sem saldo (409 `insufficient_balance`),
  uma decisão já resolvida por corrida (409 `decision_resolved`), um regen inelegível (409
  `regen_ineligible`) ou um 429
- Quando a POST retorna o erro
- Então a faixa mostra um feedback **genérico e amigável** roteado pelo `code` (nunca a frase do
  servidor), **não** derruba nem trava, e reconcilia (o estado real vence a suposição do cliente).

**Cenário 7 — o selo (100% aditivo, engine intocado)**
- Dado o build completo
- Então `packages/world-engine` + os 5 goldens estão byte-idênticos (`git diff` = 0), não há migration,
  o `client/` segue fora do prettier/eslint, e os gates TS ficam verdes.

---

## Segurança (se aplicável)

- **Autorização por construção (OP-09, `sdd.md:84`)**: as 4 rotas já derivam o `athleteId` da sessão
  (`requireAthlete`); **nenhuma** aceita identificador de ator. O cliente manda só `attribute`/
  `decisionId`/`optionId`/`itemId` (recursos do próprio atleta) — nunca um id de ator. O read-model
  novo (decisões/catálogo/canRegen) é do atleta da sessão, por construção.
- **Validação server-side é a autoridade**: o cliente não confia nas dicas (`available`/`canRegen`);
  o servidor revalida sob `FOR UPDATE` (compra/decisão) e trava idade (regen). Uma dica desatualizada
  vira um 409 tratado, nunca um estado inválido.
- **Rate limit**: os baldes por-conta + por-IP já existem (SPEC-041) — treino 40/IP, os demais 10/IP.
  A faixa respeita o 429 (Retry-After) e reconcilia. Sem superfície nova de rate limit.
- **OP-11**: o cliente roteia pelo `code` estável, nunca exibe a frase do servidor; o servidor segue
  devolvendo só `code` + status.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| A faixa é fina — 4 affordances não cabem no resting | Alta | Resting fica fino (a promessa ambiente); a interação abre em `Popup` acima da faixa (decisão/loja) + treino inline curto. Estrutural, sem arte. |
| Drift do contrato C#↔TS (campo novo/tipo) | Média | O espelho C# é tolerante (ignora desconhecido, absorve null); mapa de seams lido da fonte; testes do agregador cobrem os campos novos. |
| `spend` at-least-once gasta 2 pontos num retry | Baixa | Débito conhecido/aceito (SPEC-041); dano limitado (nunca negativo, cai no atributo escolhido); reconcilia relendo. |
| Timer/lifecycle zumbi (herança da SPEC-044) | Média | `BandActions`/`RefreshNow` não criam timer novo; qualquer request em voo usa o `CancellationToken` do poller; sem estado após teardown. |
| Enviar prosa PT-BR no contrato conflita com "zero prosa na API" | Média | Distinção registrada: erro/chrome (proibido) vs. conteúdo de gameplay (fonte única, ids junto = localização-ready). Follow-up EN nomeado. |

**Dependências:**
- **SPEC-041** (as 4 rotas POST) — em `main`.
- **SPEC-042** (o cliente WPF só-leitura) — em `main`.
- **SPEC-038** (o agregador `/v1/band`) — em `main`.
- SPEC-043/044 (o replay) — em `main`; esta fatia empilha sobre o cliente atual, sem conflito.

---

## Notas de implementação

- **Sem migration, sem tocar engine/goldens** — o critério DURO. Toda a mudança de servidor é leitura
  aditiva sobre tabelas/constantes existentes. Provar com `git diff` (engine + 5 goldens = 0).
- **`readPendingDecisions` espelha `countPendingDecisions`** (mesmo filtro `status='pending' AND day`,
  ordenado por `ord`). O agregador troca a *contagem* pela *lista* e deriva `pendingDecisions =
  list.length` (uma query no lugar de duas). Hidrata `prompt`/`options` por `templateById` (a fonte
  única; a tabela `decision` guarda só o `templateId`/`ord`/`type`).
- **`canRegen`** usa `REGEN_AGE.voluntary` (=25, exportado do world-store) + `age` (do overlay do
  mundo, já resolvido no agregador via `ageOfMe(squad)`) + `club !== null`. É dica; o servidor é a
  autoridade (o 409 `regen_ineligible` do `requestRegen`).
- **Reconciliação server-first**: cada escrita bem-sucedida chama `BandPoller.RefreshNow()` — o
  servidor é a autoridade, o cliente relê. Sem otimista-UI nesta fatia (é polish).
- **`WriteOutcome` roteado pelo `code`**: `no_free_points`, `decision_resolved`, `invalid_option`,
  `insufficient_balance`, `already_owned`, `conflict`, `regen_ineligible`, `invalid_input`, `429` →
  cada um vira um feedback PT-BR curto no ViewModel. O `BandApiClient` nunca lança (catch final, como
  o `GetBandAsync`).
- **UI estrutural + thin (OP-17)**: treino = 4 botões-texto inline (quando `freePoints>0`); decisão e
  loja = `Popup`s compactos ancorados a uma affordance; regen = um gesto curto quando `canRegen`.
  `MouseLeftButtonDown` + `e.Handled` (não fechar a faixa, o padrão do `OnReWatchClick`). Flash/estado
  transitório via propriedades do VM (diff-update, sem re-render de árvore).
- **Sem projeto de teste C#** (herança da SPEC-042/044): o cliente é verificado por `dotnet build` + a
  revisão adversarial + o smoke do founder; a lógica testável (o read-model novo) é coberta pelos
  testes TS do agregador (ao vivo contra Postgres).
- **Revisão adversarial** por 2-3 Agentes paralelos (o padrão da sessão): lentes contrato/OP-17/escopo,
  ciclo-de-vida/threading do cliente, e concorrência/reconciliação da escrita.

---

## Checklist de aprovação

> A ser preenchido pelo arquiteto ou founder antes de aprovar a SPEC.

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (nenhuma)
- [ ] Critérios de aceitação são testáveis
- [ ] Riscos e superfície de segurança foram avaliados
- [ ] Appetite é razoável para o escopo definido
- [ ] Não há conflito com SPECs abertas em paralelo

---

*SPEC-045 — método H1VE. A faixa vira interativa: o jogador distribui treino, responde decisões,
compra e pede regen direto na faixa, pelas 4 rotas POST da SPEC-041. Servidor: leitura aditiva no
`/v1/band` (lista de decisões + catálogo + `canRegen`), sem migration, engine e os 5 goldens
intocados. Cliente: as 4 escritas fiadas, estruturais, reconciliando server-first.*
