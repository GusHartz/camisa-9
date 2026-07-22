# DONE-052 — O corpo da faixa: as 3 cenas + o recorte de 3 alturas (fatia 1 de 3)

> Artefato de conclusão do desenvolvimento (par da `SPEC-052`).

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-052 |
| **SPEC correspondente** | `SPEC-052-corpo-da-faixa-as-3-cenas.md` |
| **Feature** | O corpo da faixa — cenário pixel-art (fatia 1) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/o-corpo-da-faixa-as-3-cenas` |
| **PR** | https://github.com/GusHartz/camisa-9/pull/56 |
| **Desenvolvimento iniciado** | 2026-07-22 |
| **Desenvolvimento concluído** | 2026-07-22 |
| **Dias utilizados vs appetite** | 1 dia vs 14 dias de appetite |
| **Baseline** | `main` @ `399ad4b` |
| **Selo** | `packages/*` e `services/*` **intocados** (`git status` = 0); sem migration |

---

## Resumo do que foi feito

A faixa deixou de ser blocos de cor: ganhou **cenário pixel-art** atrás do conteúdo, que troca com a
fase do dia — **CT ao amanhecer**, **a casa onde você dorme** (pensão → cobertura, o patrimônio da
SPEC-024 virando imagem) e **o vestiário da véspera** (com o placar aceso depois do jogo). A arte foi
portada do handoff do Claude Design (projeto `222a226c`) **por primitivas** — nenhuma dependência
nova, nenhum asset binário (o gotcha que travou a SPEC-051 não se aplica aqui).

As **três alturas** da faixa (112 · 88 · 64 DIP) saem de **uma arte só**, por recorte ancorado
embaixo — 28, 22 e 16 linhas do mesmo grid lógico de 120×28. O cenário é composto **uma vez por
chave** e cacheado, então nem o poll de 60s nem os ~2 eventos/s do replay o repintam.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `client/band-wpf/View/ScenePalette.cs` | A paleta do handoff congelada, com a mesma nomenclatura (`n0..n6`, `or*`, `gold*`, `f*`, `clay*`, `dawn*`, `night*`, `wall*`), memoizada por hex. Fonte única — a fatia 2 (avatar) reusa. |
| `client/band-wpf/View/PixelCanvas.cs` | As duas primitivas do design (`R` retângulo lógico / `P` pixel) sobre `DrawingContext` + a fonte bitmap 3×5 dos dígitos. Escala fixa **4 DIP por pixel lógico**. |
| `client/band-wpf/View/SceneRenderer.cs` | As 4 pinturas no grid 120×28 (CT · pensão · cobertura · véspera pré/pós), o scrim de base e o recorte por altura. |
| `client/band-wpf/View/SceneModel.cs` | Projeta o `BandState` numa `SceneKey` (record). Thin renderer — o cliente não decide nada (OP-17). |
| `specs/SPEC-052-corpo-da-faixa-as-3-cenas.md` | A SPEC aprovada. |
| `specs/DONE-052-corpo-da-faixa-as-3-cenas.md` | Este documento. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `client/band-wpf/View/BandViewModel.cs` | Expõe a `Scene` (a chave) e a recalcula no `Apply`; recebe a altura da faixa por construtor. |
| `client/band-wpf/MainWindow.xaml` | Raiz em 3 camadas: `Image` (cenário) · `Rectangle` (scrim) · `Border` com o conteúdo atual, agora transparente. |
| `client/band-wpf/MainWindow.xaml.cs` | Compõe e **cacheia** a cena por chave; assina **só** `nameof(BandViewModel.Scene)` — nunca o `PropertyChanged` genérico. |
| `client/band-wpf/App.xaml.cs` | `LoadBandHeight()` lê a altura do `config.json` (aceita apenas 64/88/112; qualquer outro valor cai no default 88). |
| `client/band-wpf/config.json` | Expõe a chave `bandHeightDip` no valor default. |
| `client/band-wpf/README.md` | Como o cenário é feito, a régua da faixa segura, os dois gotchas e o passo 9 do smoke (as 3 alturas). |
| `CLAUDE.md` | Seção "Estado atual" atualizada + entrada na lista de concluídos. |
| `docs/projeto/roadmap.md` | Item 3.4 atualizado (as cenas entregues; a fatia 2 e os ativos que a bloqueiam declarados). |

---

## Mudanças de schema aplicadas

**Nenhuma migration neste DONE.** A fatia é 100% renderização no cliente.

---

## Mudanças de API entregues

**Nenhuma mudança de API neste DONE.** As cenas consomem campos que o `GET /v1/band` já entregava
desde a SPEC-038/045: `phase`, `home.lifestyleTier`, `club.todayMatch.played/goalsFor/goalsAgainst`.

---

## Critérios de aceitação — verificação

| Critério | Status | Observação |
|---|---|---|
| Cenário 1 — as 3 fases | ✅ | CT, casa (pensão e cobertura) e véspera renderizados e inspecionados em PNG; o conteúdo lê por cima em todas, com o scrim de base. |
| Cenário 2 — as 3 alturas, uma arte só | ✅ | 112→28 linhas · 88→22 · 64→16, ancorado embaixo. Nos PNGs de 64 sobrevivem campo/gol/cones/bola/banco/banca (CT), piso/colchão/TV (pensão) e placar/banco (véspera). |
| Cenário 3 — determinismo | ✅ | O harness compõe a mesma chave duas vezes e compara os bytes: `IDENTICO` para CT e pensão. Os dois `Math.random()` do handoff foram substituídos. |
| Cenário 4 — a casa evolui | ✅ | `lifestyleTier` 0-1 → pensão, 2-3 → cobertura (decisão 3); sem estado intermediário quebrado. |
| Cenário 5 — véspera pré × pós | ✅ | Mesma cena, só os pixels de estado mudam; placar aceso em verde/cinza/vermelho e **dentro da faixa segura** (provado em `vespera-pos-vitoria-64.png`). |
| Cenário 6 — orçamento | ✅ (estrutural) | Composição por chave + `Freeze()` + cache; a View assina só `Scene`. Nenhuma animação contínua introduzida. A **medição** ao vivo é ação do founder. |
| Cenário 7 — erro / degradação | ✅ | `SceneModel.From(null)` e payloads sem `club`/`home` caem na cena padrão sem exceção; `phase` desconhecida idem. |
| Cenário 8 — o selo | ✅ | `git status packages services` vazio; sem migration; typecheck verde; `dotnet build` **0 avisos**. |

---

## Como testar manualmente

```
1. Suba a stack (client/band-wpf/README.md §Bring-up) e entre na faixa.
2. Confirme o cenário de fundo conforme a hora: de manhã o CT ao amanhecer;
   à tarde o vestiário da véspera; à noite a casa (pensão nos degraus 0-1
   de moradia, cobertura nos 2-3).
3. Depois das 15h, com a rodada tickada, confirme o PLACAR ACESO no vestiário,
   colorido pelo resultado (verde vitória / cinza empate / vermelho derrota).
4. Edite bandHeightDip no config.json para 112, depois 88, depois 64, reabrindo
   a faixa a cada troca.
   Resultado esperado: a MESMA arte, recortada de baixo; em 64 o placar continua
   inteiro e o chão/objetos-chave permanecem visíveis.
5. Durante um replay de partida (~4 min), observe o fundo.
   Resultado esperado: o cenário fica IMÓVEL — nada pisca, nada recompõe.
```

**Dados de teste necessários:**
- Uma conta com atleta no mundo e um clube (senão a faixa mostra "na fila", que cai na cena padrão).
- Uma rodada tickada com o jogo do seu clube publicado, para a véspera pós-jogo.
- Moradia em degraus diferentes (compre na loja) para ver pensão × cobertura.

---

## Testes automatizados

**Nenhum teste automatizado novo** — a fatia é 100% cliente e o repositório **não tem C# na CI**
(precedente dos spikes SPEC-003/005/006 e de todas as fatias de cliente: SPEC-042/044/045/049/051).
A verificação é o **harness headless**, o método que a SPEC-049 estabeleceu:

| Artefato de verificação | O que verifica |
|---|---|
| harness `scenecheck` (console `net8.0-windows`/`UseWPF`, fora do repo) | Linka os **arquivos reais** do cliente e compõe pelo **mesmo `SceneRenderer`** da faixa; emitiu **12 PNGs** (4 cenas × 3 alturas + véspera pós em V/E/D + o recorte de 64), inspecionados um a um. |
| o mesmo harness, modo determinismo | Compõe a mesma chave **duas vezes** e compara os bytes → `IDENTICO` (CT e pensão). |

Os gates automatizados que se aplicam:

```bash
npm run typecheck          # verde (o cliente é isolado dos workspaces npm)
dotnet build client/band-wpf/BandClient.csproj   # 0 Aviso(s), 0 Erro(s)
```

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `client/band-wpf/View/ScenePalette.cs` | 100% | não (pendente QA) |
| `client/band-wpf/View/PixelCanvas.cs` | 100% | não (pendente QA) |
| `client/band-wpf/View/SceneRenderer.cs` | 100% | não (pendente QA) |
| `client/band-wpf/View/SceneModel.cs` | 100% | não (pendente QA) |
| `client/band-wpf/View/BandViewModel.cs` | 100% | não (pendente QA) |
| `client/band-wpf/MainWindow.xaml` | 100% | não (pendente QA) |
| `client/band-wpf/MainWindow.xaml.cs` | 100% | não (pendente QA) |
| `client/band-wpf/App.xaml.cs` | 100% | não (pendente QA) |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → as **3 correções sobre o handoff** foram levantadas na redação da SPEC e **aprovadas
  antes do código** (§As 3 correções): `Math.random`→máscara determinística, placar movido para
  dentro da faixa segura, 112 DIP no lugar de 110. Além delas, dois itens menores decididos na
  implementação e registrados aqui: o placar passou a usar o **placar real** (`goalsFor`/
  `goalsAgainst`) no lugar dos literais `2`/`1` do mockup, e a chave `bandHeightDip` foi exposta no
  `config.json` para o knob ser descoberto sem ler o código. Nada disso toca `packages/*` ou
  `services/*`.

---

## As 3 correções sobre o handoff (decididas na SPEC)

1. **Determinismo** — os dois `Math.random()` (janelas do prédio no CT, luzes da laje na pensão)
   viraram máscara determinística na mesma densidade. **Provado**: o harness compõe a mesma chave
   duas vezes e compara os bytes → `IDENTICO`.
2. **O placar aceso saiu de cima da linha segura** — estava nas linhas 2-9, acima da faixa segura
   que o próprio handoff define, e **sumia por completo na altura de 64**. Movido para as linhas
   14-21 e desenhado por último. **Provado**: `vespera-pos-vitoria-64.png` mostra o `2 - 1` verde
   inteiro no recorte compacto.
3. **112 DIP em vez de 110** — escala inteira 4× nas três alturas.

---

## Bug encontrado durante a implementação

**Ordem de inicialização estática em C#** — `ScenePalette` declarava o dicionário de cache
**depois** dos brushes que o consomem; como inicializadores de campo estático rodam em ordem de
declaração, o primeiro `B(...)` encontrava `Cache` nulo e o type initializer explodia
(`TypeInitializationException`). O harness pegou na primeira execução. Corrigido movendo o cache
para o topo, com comentário explicando por quê — é uma armadilha que se repete.

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo do desvio |
|---|---|---|
| Placar da véspera com os literais do mockup | Usa `goalsFor`/`goalsAgainst` do contrato | O mockup é estático; a faixa mostra o jogo real (thin renderer). |
| Altura só no `config.json` | A chave `bandHeightDip` foi **escrita** no `config.json` versionado, no default | O knob existia mas era invisível; expor no default não muda comportamento. |
| Fonte 3×5 e o glifo `?` | Não implementado | O estado sem-clube que o usaria é do **avatar** (fatia 2); o glifo está na lista de ativos pedidos. |

Fora isso, a implementação seguiu a SPEC.

---

## Limitações conhecidas

- **Kit neutro na véspera**: a camisa pendurada usa o laranja do acento, não as cores do clube — as
  cores indexadas são a fatia 2 (o contrato manda 12 primárias × 12 secundárias e o handoff entregou
  6 uniformes nomeados).
- **Escada da casa**: 2 cenas para 4 degraus (`0-1 → pensão`, `2-3 → cobertura`), conforme a decisão
  3. Some quando a arte da quitinete e do apê chegar.
- **Layout compacto (64)**: esta fatia recorta o **cenário**; o que a UI mostra em 64 continua como
  está — decidir o que sobrevive nessa altura é decisão de UI, não de arte.
- **Smoke ao vivo** (a faixa na tela com o cenário + o orçamento `<1% CPU`) = **ação do founder**.

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Mapa provisório da casa (2 cenas para 4 degraus) | Baixo | Quando o designer entregar quitinete e apê. |
| Sem C# na CI: a fidelidade depende de harness manual fora do repo | Médio | SPEC própria (um projeto de teste C# + o harness versionado) — débito herdado desde a SPEC-042. |
| O layout do conteúdo em 64 DIP não foi redesenhado | Médio | Próxima fatia de UI da faixa. |

---

## Devolutiva ao designer (pendente de envio — está na SPEC-052 §Devolutiva)

Oito itens, com destaque para: os dois `Math.random()`; o placar acima da própria linha de
segurança; a **3ª barra (FÔLEGO) que não existe no jogo**; o seletor de número 1-99 que contraria a
SPEC-040; o `ESCALAR ⚡` sem dado; e — pela **terceira vez** — a cadência "Tue/Thu/Sat" no `readme`
do design system. Mais o pedido dos **ativos que destravam a fatia 2**: 12+12 cores de kit
indexadas, 16 escudos, as 2 cenas de casa que faltam e o glifo `?`.

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (1-8)
- [x] Verificação criada e passando (harness headless: 12 PNGs + determinismo; **sem C# na CI**)
- [x] Typecheck limpo
- [x] Lint limpo (`client/` está fora do prettier/eslint por convenção)
- [x] Nenhum log de debug em código de produção
- [x] Nenhum tipo `any` introduzido
- [x] Nenhum segredo hardcoded
- [x] AI Declaration preenchida acima e submetida no card
- [x] `CLAUDE.md` seção "Estado atual" atualizada
- [x] `docs/projeto/roadmap.md` item 3.4 atualizado
- [x] `packages/*` e `services/*` intocados; **sem migration**
- [x] `dotnet build` com **0 avisos**
- [x] Este DONE está completo e commitado na branch

---

*DONE-052 — método H1VE. A faixa ganhou cara: 4 pinturas pixel-art portadas por primitivas,
determinísticas, recortadas para 3 alturas a partir de uma arte só e cacheadas por chave. 100%
cliente. O avatar é a fatia 2, bloqueada pelos ativos que faltam.*
