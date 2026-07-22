# SPEC-052 — O corpo da faixa: as 3 cenas + o recorte de 3 alturas (fatia 1 de 3)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-052 |
| **Feature** | O corpo da faixa — cenário pixel-art (fatia 1: as 3 cenas + as 3 alturas) |
| **Slug** | corpo-da-faixa-as-3-cenas |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.4 (Presença 3 níveis) — a faixa deixa de ser blocos de cor |
| **Appetite** | 14 dias (estimativa de trabalho: ~6-8 dias) |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-22 |
| **Aprovada em** | {preencher na aprovação} |
| **Aprovada por** | {preencher na aprovação} |
| **Status** | Rascunho (card criado; aguardando aprovação `spec → dev`) |

---

## Objetivo

A faixa ganha **cenário**: no lugar dos blocos de cor de hoje, uma pintura pixel-art atrás do
conteúdo, que **troca com a fase do dia** (CT ao amanhecer · a casa onde você dorme · o vestiário
da véspera), evolui com a sua **moradia** (pensão → cobertura), reage ao **jogo ter acontecido**, e
**recorta** para as três alturas da faixa sem virar três desenhos. É o que faz o produto parecer um
jogo em vez de um widget.

---

## Contexto e motivação

O cliente WPF existe desde a SPEC-042 e renderiza **estrutural**: texto, números e retângulos de
cor chapada — a arte foi deferida desde então ("os assets não estão no repo"). As fatias seguintes
(escritas, replay, card compartilhável, momento de escolha) encheram a faixa de **função** sem lhe
dar **cara**.

O Claude Design entregou o handoff do corpo da faixa (projeto `222a226c`,
`Faixa - corpo e avatar.dc.html`): pixel art **desenhada em código**, num grid lógico **120×28**,
com apenas duas primitivas (`P` = pixel, `R` = retângulo) — o mesmo idioma que o repo já usa na
coroa do card de partida (`CardDraw.DrawCells`, SPEC-049) e no momento de escolha (SPEC-051). O
port é **1:1 por primitivas**: nenhuma curva, nenhum gradiente, nenhuma imagem — logo, zero
dependência nova e nenhum asset binário a transferir (o gotcha que travou a SPEC-051).

**Por que só as cenas nesta fatia:** o handoff traz três subsistemas independentes — (a) as cenas,
(b) o avatar em camadas, (c) micro-momentos por evento. O **avatar está bloqueado** por ativos que
o designer ainda não produziu (ver §Ativos que faltam): o contrato entrega o kit como **índices**
(12 primárias × 12 secundárias × 16 escudos) e o handoff entregou **6 uniformes nomeados** e
**nenhum escudo**. As cenas não dependem de nada disso e entregam o payoff visual inteiro.

---

## ⚠️ Defeitos encontrados no handoff (endereçados aqui, devolvidos ao designer)

1. **Não-determinismo no desenho.** `Math.random()` em dois pontos (janelas do prédio no CT, luzes
   da laje na pensão) — **25 pixels** que mudariam a cada repintura. Numa faixa que repinta por
   evento, a arte **pisca sozinha**, e dois jogadores veriam mundos diferentes. Vira **máscara
   determinística** (o próprio arquivo já usa esse idioma nas outras cenas: `(x+y*3)%5<2`).
2. **O placar aceso viola a linha segura que o próprio handoff define.** Na véspera pós-jogo ele
   ocupa as linhas 2-9, **acima** da faixa segura (linhas 12-27): em 88px aparece cortado ao meio e
   em **64px some por completo** — justo o pixel mais informativo. Movido para dentro da faixa
   segura.
3. **A terceira barra (FÔLEGO) não existe.** O mockup desenha três barras; o contrato tem **duas**
   (Forma e Moral) porque o **R4 FINAL cortou o fôlego diário** — e há teste travando `bars` em
   exatamente esses dois campos. **Não será implementada.**
4. **Escala anisotrópica na altura "cena":** 28 linhas em 110px dá 3,93× (borra pixel art), contra
   4,0× exatos nas outras duas. Ver decisão 2.
5. Menores: o `?` do estado sem-clube **não renderiza** (a fonte 3×5 só tem `0-9`); o recorte do
   busto corta a linha 0 (topo de afro/topete/moicano/coque); a escada da casa é numerada 1..4 no
   design e 0..3 no contrato (off-by-one); o scrim de base é chapado onde a intenção aparente era
   uma rampa.

---

## Decisões do founder (TRAVADAS — 2026-07-22)

1. **Fatiar em 3** — esta SPEC entrega **as cenas + as alturas**. O **avatar** é a fatia 2
   (destravada quando o designer mandar a paleta de kit indexada e os 16 escudos); os
   **micro-momentos** (frame de gol/lesão/contrato) são a fatia 3. Nada de avatar improvisado: kit
   errado em metade dos clubes viraria retrabalho quando a paleta certa chegar.
2. **Altura "cena" = 112 DIP** (não 110): fecha as três alturas em escala inteira **4×**
   (16·4=64 · 22·4=88 · 28·4=112) e mantém o pixel art nítido em 100/125/150/175/200% de DPI.
3. **Mapa da casa:** `lifestyleTier 0-1 → pensão`, `2-3 → cobertura` — provisório, some quando a
   arte dos degraus 1 e 2 (quitinete, apê) chegar.

---

## Escopo — o que está DENTRO

**A. Paleta e primitivas (`client/band-wpf/View/`)**

- [ ] `ScenePalette.cs`: espelho **congelado** da paleta do handoff, com a mesma nomenclatura
      (`n0..n6`, `or/or4/or6/or7`, `gold/gold6/gold7`, `f3/f5/f7/f8`, `clay5/6/7`, `wood/wood2`,
      `dawnTop/dawnMid/dawnWarm/dawnWarm2/sun`, `night/night2/citylight/moon`, `wall/wall2/floorW`,
      `chalk/win/loss/draw/live`) — fonte única, reusável pela fatia 2.
- [ ] `PixelCanvas.cs`: as duas primitivas do handoff sobre `DrawingContext` —
      `R(x,y,w,h,cor)` → `DrawRectangle` em coordenadas lógicas × escala; `P(x,y,cor)` = `R(...,1,1)`;
      cache de `Brush` congelado por hex; `EdgeMode.Aliased`.

**B. As 3 cenas (`SceneRenderer.cs`) — grid lógico 120×28**

- [ ] **`ct`** — CT ao amanhecer: céu em faixas, sol, prédios ao fundo com **janelas por máscara
      determinística**, alambrado, campo com faixas de corte, gol com rede, meia-lua de cal, cones,
      barro em primeiro plano, bola, banco e a banca de jornal do mundo.
- [ ] **`casa` (pensão)** — parede com reboco descascado, janela para a laje (**luzes
      determinísticas**), lâmpada pendente, pôster, piso de tábuas, colchão no chão, engradado-mesa,
      TV de tubo.
- [ ] **`casa` (cobertura)** — vidro do chão ao teto, **skyline determinístico** (18 prédios de
      alturas fixas, janelas por máscara `(x+y+i)%3`), lua, sofá, TV de parede, estante de troféus
      em ouro, planta, tapete.
- [ ] **`vespera`** — vestiário/arquibancada com torcida por máscara, refletores, e a variação
      **pré-jogo × pós-jogo** (camisa pendurada → jogada na banca; chuteiras limpas → enlameadas;
      placar aceso, **reposicionado para dentro da faixa segura**, colorido por V/E/D).
- [ ] **Scrim de base**: as 10 linhas de baixo recebem preto a 5% (um retângulo só, `#0D000000`)
      para o texto ler em qualquer fundo.

**C. O recorte de 3 alturas**

- [ ] `logicalRowsFor(altura)`: 112→28 · 88→22 · 64→16, com o corte **ancorado embaixo** (descarta
      as linhas de cima) — uma arte só, três recortes.
- [ ] A altura vira configurável (`config.json`, molde do `replayWatchSeconds`) e reusa o
      `ReAnchor()`/`TaskbarAnchor.Compute` que já existem.

**D. Composição e orçamento**

- [ ] `SceneModel.From(BandState)` (molde do `MatchCardModel.From`): projeta o estado numa **chave
      de cena** — fase, degrau da casa, jogado/resultado, altura, tier do clube — com null-guard em
      tudo. O renderer é burro (OP-17).
- [ ] A cena é composta **uma vez por chave** num `DrawingVisual` → `RenderTargetBitmap` →
      `Freeze()` → cache → `Image` com `NearestNeighbor`. **Repinta só quando a chave muda** — o
      poll de 60s e os ~2 eventos/s do replay **não** tocam o cenário.
- [ ] O XAML da raiz vira 3 camadas: `Image` (cenário) · `Rectangle` (scrim lateral) · conteúdo
      atual com fundo transparente.

---

## Escopo — o que está FORA

- **O AVATAR em camadas** (o busto, a paleta indexada, os estados lesionado/sem-clube) — **fatia
  2**, bloqueada pelos ativos que faltam (§abaixo).
- **Micro-momentos por evento** (frame de gol, de lesão, de contrato) — fatia 3.
- **A 3ª barra (FÔLEGO)** — não existe no charter (R4 FINAL) nem no contrato; **não implementar**.
- **`ESCALAR ⚡`** — não há dado: o engine não modela onze inicial para o humano ("estou escalado
  hoje?" está deferido desde a SPEC-038).
- **Cena de antecipação com o PRÓXIMO adversário** — o contrato só tem `todayMatch`; exigiria uma
  fatia de servidor (`club.nextMatch`) e fica para quando a véspera precisar do nome do rival.
- **Textura por tier do mundo** (várzea→elite) — o handoff declara o eixo mas não especifica a
  textura.
- **Escudo do clube** (`crest`, 16 valores) — nenhum foi desenhado.
- **Colegas de elenco na cena** — o avatar do handoff é singular ("VOCÊ").

---

## Ativos que faltam (pedido ao designer — bloqueiam a fatia 2)

1. **12 cores primárias + 12 secundárias de kit**, indexadas — o contrato manda `primaryColor` 0-11
   e `secondaryColor` 0-11; o handoff trouxe 6 uniformes nomeados.
2. **16 escudos** em pixel art para `crest` 0-15 (hoje o mockup usa um triângulo em CSS).
3. **As 2 cenas de casa que faltam** (quitinete, apê) — degraus 1 e 2.
4. **O glifo `?`** na fonte 3×5 (ou o descarte do estado que o usa).

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `client/band-wpf/View/ScenePalette.cs` | criar | A paleta do handoff congelada (fonte única). |
| `client/band-wpf/View/PixelCanvas.cs` | criar | `R`/`P` sobre `DrawingContext` + cache de brush. |
| `client/band-wpf/View/SceneRenderer.cs` | criar | As 4 pinturas (ct · pensão · cobertura · véspera) + scrim. |
| `client/band-wpf/View/SceneModel.cs` | criar | `BandState` → chave de cena (projeção, null-guard). |
| `client/band-wpf/View/BandViewModel.cs` | modificar | Expõe a chave de cena; notifica só quando ela muda. |
| `client/band-wpf/MainWindow.xaml` | modificar | Raiz em 3 camadas (cenário / scrim / conteúdo). |
| `client/band-wpf/MainWindow.xaml.cs` | modificar | Compõe e cacheia a cena; assina só a chave. |
| `client/band-wpf/App.xaml.cs` | modificar | Altura da faixa lida do `config.json` (64/88/112). |
| `client/band-wpf/README.md` | modificar | As 3 alturas + o método de smoke do cenário. |
| `specs/SPEC-052-corpo-da-faixa-as-3-cenas.md` | criar | Esta SPEC. |
| `specs/DONE-052-corpo-da-faixa-as-3-cenas.md` | criar | O DONE. |

⚠️ **Nenhum arquivo de `packages/*` ou `services/*`** — a fatia é 100% cliente, e o espelho C# do
contrato **já cobre** todos os eixos que as cenas usam (`phase`, `home.lifestyleTier`,
`todayMatch.played/goalsFor/goalsAgainst`, `club.tier`).

---

## Mudanças de schema (se aplicável)

**Nenhuma mudança de schema nesta feature.** Sem migration. A fatia é de renderização no cliente.

---

## Mudanças de API (se aplicável)

**Nenhuma mudança de API nesta feature.** As cenas consomem campos que o `GET /v1/band` já entrega:

```
GET /v1/band  (nada muda — só consumo)
  phase                        → escolhe a cena (ct | casa | vespera)
  home.lifestyleTier           → degrau da casa (0-3 → pensão | cobertura, mapa provisório)
  club.todayMatch.played       → véspera pré-jogo × pós-jogo
  club.todayMatch.goalsFor/Against → cor do placar aceso (V/E/D, derivado no cliente)
  club.tier                    → reservado p/ a textura de tier (fora desta fatia)
```

---

## Critérios de aceitação

**Cenário 1 — as 3 fases**
- Dado um `BandState` com `phase` = `ct`, depois `casa`, depois `vespera`
- Quando a faixa renderiza
- Então o cenário de fundo é a pintura correspondente, e o conteúdo (texto, barras, chips) segue
  legível por cima em todas as três.

**Cenário 2 — as 3 alturas, uma arte só**
- Dado a mesma cena e as alturas 112, 88 e 64
- Quando a faixa renderiza
- Então a arte é **a mesma**, recortada e **ancorada embaixo** (28 · 22 · 16 linhas lógicas), e
  **nenhum elemento essencial** (chão, objetos-chave, placar) some no recorte de 64.

**Cenário 3 — determinismo**
- Dado o mesmo estado renderizado duas vezes (e em duas execuções do processo)
- Quando comparo os PNGs
- Então são **byte-idênticos** — nenhuma janela acesa muda de lugar, nenhum `Math.random` sobrou.

**Cenário 4 — a casa evolui**
- Dado `home.lifestyleTier` variando de 0 a 3
- Quando a fase é `casa`
- Então o degrau baixo mostra a pensão e o alto a cobertura, sem estado intermediário quebrado.

**Cenário 5 — véspera pré × pós**
- Dado a fase `vespera` com `todayMatch.played` falso e depois verdadeiro (com vitória, empate e
  derrota)
- Quando a faixa renderiza
- Então a cena é a mesma e só os pixels de estado mudam (camisa, chuteiras, placar aceso na cor do
  resultado), **com o placar dentro da faixa segura** (visível também em 64).

**Cenário 6 — orçamento**
- Dado a faixa aberta com poll de 60s e um replay de partida rodando (~2 eventos/s)
- Quando observo a composição da cena
- Então ela é composta **uma vez por chave** e reusada do cache — nenhuma recomposição por poll,
  por frame de replay ou por mudança de texto; nenhuma animação contínua foi introduzida.

**Cenário 7 — erro / degradação**
- Dado um payload sem `club` (jogador na fila), sem `home`, ou com `phase` desconhecida
- Quando a faixa renderiza
- Então cai numa cena padrão sem exceção e sem área vazia — a faixa nunca fica sem fundo.

**Cenário 8 — o selo**
- Dado o merge desta SPEC
- Quando rodo os gates
- Então `packages/*` e `services/*` estão **intocados** (`git diff` = 0), não há migration, os
  gates TS seguem verdes e `dotnet build` sai com **0 avisos**.

---

## Segurança (se aplicável)

**Sem superfície de segurança relevante.** A fatia é 100% renderização no cliente, sobre dados que
o `GET /v1/band` já entrega ao dono da sessão.

- **Autorização** — inalterada: nenhuma rota nova; a faixa continua lendo só o estado do atleta da
  sessão (autorização por construção, SPEC-038).
- **Input não-confiável** — nenhum. O cenário é desenhado por código a partir de campos tipados; o
  cliente não recebe nem interpreta arte vinda da rede.
- **Segredos** — nenhum; nada é lido de disco além do `config.json` já existente.
- **Superfície visual** — o cenário não exibe dado novo: nenhum campo sensível passa a aparecer na
  tela que já não aparecia.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Cenário repintado por poll/replay estourar o `<1% CPU` | **Alta** se ingênuo | Composição por CHAVE + `Freeze()` + cache; assinar só as propriedades da chave (nunca o `PropertyChanged` genérico — durante o replay o VM dispara ~2 notificações/s). Cravado no critério 6. |
| Pixel art borrada por escala não-inteira | Alta (110px) | Decisão 2 (112 DIP) + `NearestNeighbor` + `EdgeMode.Aliased`. |
| Arte "piscando" por não-determinismo | Certa se portar cru | Máscaras determinísticas no lugar dos dois `Math.random`; critério 3 compara PNGs byte a byte. |
| Cenário competir com o texto (ilegibilidade) | Média | Scrim de base (5% × 10 linhas) + scrim lateral; a regra da faixa segura mantém o essencial embaixo. |
| Recorte de 64px inviabilizar o conteúdo atual (4 linhas de UI) | Média | O layout compacto é **decisão de UI**, não de cenário: nesta fatia o cenário recorta; o que a UI mostra em 64 fica como está (e vira card se apertar). |
| Divergência de escada da casa (2 cenas × 4 degraus) | Média | Mapa provisório da decisão 3, documentado; some quando os degraus 1-2 chegarem. |

**Dependências:**
- **SPEC-042** (o cliente WPF e o shell da faixa) · **SPEC-049** (as primitivas de `CardDraw`, as
  fontes e a técnica do harness headless) · **SPEC-038** (o contrato que alimenta a chave de cena) —
  todas em `main`.
- **Handoff do Claude Design** — projeto `222a226c` (importado; salvo localmente).
- **Não depende** de nenhum ativo pendente do designer (esses bloqueiam só a fatia 2).

---

## Notas de implementação

- **Ordem de construção:** paleta → primitivas → uma cena completa (a `vespera`, que exercita
  pré/pós e o placar) → as outras três pinturas → o recorte de alturas → o cache por chave → o
  harness de verificação.
- **O port é mecânico:** cada `R(x,y,w,h,cor)` do handoff vira uma linha de `DrawRectangle` em
  coordenadas lógicas × 4. **Não "melhore" a arte no caminho** — divergência do handoff se resolve
  com o designer, não no port (precedente do card de partida).
- **Determinismo:** substituir os dois `Math.random()` por máscara na mesma densidade original
  (CT: ~30% de 20 janelas; pensão: ~50% de 5 luzes), usando o idioma que as outras cenas já usam.
  Se um dia quiser variedade **por jogador**, derive de hash do `clubId`/`athleteId` (o padrão
  FNV-1a já existe em `packages/player`), nunca de relógio ou RNG.
- **Cache:** `RenderTargetBitmap` congelado por chave, num dicionário pequeno; a chave inclui a
  altura (o recorte muda a arte).
- **Verificação sem GUI:** reusar o harness headless (STA + `RenderTargetBitmap`) que a SPEC-049
  estabeleceu e a SPEC-051 já reconstruiu — emitir PNG de **3 fases × 3 alturas** (9) + pensão ×
  cobertura + véspera pré/pós em V/E/D, e inspecionar. ⚠️ Congelar animações antes de renderizar
  (gotcha registrado na SPEC-051: sem message pump o PNG sai vazio).
- **OP-17:** o renderer não decide nada — `SceneModel.From` projeta o `BandState` e o resto é
  desenho. O V/E/D sai do sinal de `goalsFor − goalsAgainst` (derivação de render, precedente
  `MatchCardModel`).

---

## Devolutiva ao designer (enviar junto)

1. ⚠️ **`Math.random()` no desenho** (CT e pensão): 25 pixels que mudam a cada repintura — a arte
   piscaria ~1×/min. Trocado por máscara determinística; confirme a densidade.
2. ⚠️ **O placar aceso está acima da linha segura que você mesmo definiu** — some por completo na
   altura de 64. Movido para dentro das 16 linhas de baixo.
3. ⚠️ **A 3ª barra (FÔLEGO) não existe no jogo** — o R4 FINAL cortou o fôlego diário; o contrato
   tem só Forma e Moral. Remova do mockup ou proponha outro uso para o slot.
4. **O seletor de número 1-99 precisa sair**: o número é derivado de pools fechados por posição
   (SPEC-040) — a arte pode assumir no máximo 2 dígitos.
5. **`ESCALAR ⚡` não tem dado** — o engine não modela onze inicial para o humano.
6. Menores: o `?` do estado sem-clube não renderiza (a fonte 3×5 só tem `0-9`); o recorte do busto
   corta a linha 0 (topo de afro/topete/moicano/coque); a escada da casa é 1..4 no design e 0..3 no
   contrato; o scrim de base ficou chapado (a intenção parecia ser rampa) — confirme qual vale.
7. **Ativos que destravam a fatia 2**, na ordem: 12 cores primárias + 12 secundárias de kit
   indexadas · 16 escudos · as 2 cenas de casa que faltam · o glifo `?`.
8. **A cadência no `readme` do design system continua errada** ("Tue/Thu/Sat"): é **diária, 7/7**.
   É a terceira vez que sinalizo — enquanto não corrigir, todo mockup nasce com o mesmo drift.

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
- [x] **Card criado no board** e esta SPEC publicada nele — 2026-07-22
- [x] Decisão 1 — **fatiar em 3** (cenas agora · avatar quando os ativos chegarem · micro-momentos)
- [x] Decisão 2 — altura "cena" **112 DIP** (escala inteira 4×)
- [x] Decisão 3 — mapa da casa (`tier 0-1 → pensão`, `2-3 → cobertura`)
- [ ] **Aprovação no card (`spec → dev`)** — gate do arquiteto; o código não começa antes

---

*SPEC-052 — método H1VE. A faixa ganha cenário: 4 pinturas pixel-art num grid lógico 120×28,
portadas por primitivas (zero dependência, zero asset binário), recortadas para 3 alturas a partir
de uma arte só, compostas uma vez por chave e cacheadas. 100% cliente: `packages/*` e `services/*`
intocados, sem migration. O avatar é a fatia 2.*
