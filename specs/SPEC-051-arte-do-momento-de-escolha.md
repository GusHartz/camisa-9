# SPEC-051 — Arte do momento de escolha (o handoff do Claude Design no replay)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-051 |
| **Feature** | Arte do momento de escolha (faixa · replay) |
| **Slug** | arte-do-momento-de-escolha |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 3.2 (eventos de escolha) / 3.4 (presença) — veste com arte o overlay entregue estrutural na SPEC-050 |
| **Appetite** | 14 dias (estimativa de trabalho: ~5-7 dias) |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-22 |
| **Aprovada em** | {preencher na aprovação} |
| **Aprovada por** | {preencher na aprovação} |
| **Status** | Rascunho (aguardando aprovação no card — stage `spec`) |

---

## Objetivo

Vestir com o design entregue o **momento de escolha** que a SPEC-050 entregou funcional e feio, e
entregar os **dois estados de desfecho** que hoje não existem (deu certo / não deu). O jogador
passa a ver, durante o replay da própria partida, um momento que se lê em menos de um segundo —
onde a aposta é reconhecível pela cor e pelo chip do atributo — e recebe o **desfecho narrado**
("A RIVAL CALOU.") em vez do texto genérico de hoje.

---

## Contexto e motivação

A tríade *assistir* → *rosto/nota* → *interagir* foi fechada em código (SPEC-043/044, 046, 048,
050), mas o "interagir" está **sem arte**: chips cinza, prompt em texto corrido e a opção arriscada
marcada por um `⚡TEC` colado no rótulo — placeholder que a própria SPEC-050 assumiu como tal.

O Claude Design devolveu o handoff (projeto `4082c853-b329-4826-b4c5-8568445257da`, arquivo
`Momento de Escolha.dc.html`, mais o design system `next-goat-design-system-aabb60d6` com os
tokens) contendo **3 tratamentos** da marcação da aposta e **6 estados** desenhados. Esta SPEC
consome esse handoff.

Desbloqueia: o **smoke visual do founder** (hoje não há o que olhar) e o próximo handoff de arte
(a faixa em si — 3 cenas / avatar / 3 alturas), que herda as convenções fixadas aqui.

### ⚠️ O achado que mudou o escopo: o design pede conteúdo que o servidor não tem

Os estados ③ (deu certo) e ④ (não deu) mostram **narrativa por desfecho**:

- ③ headline `A RIVAL CALOU.` + corpo *"Dancinha na cara da torcida. Golaço assinado, craque."*
- ④ headline `ZAGUEIRO VOOU NO CANTO.` + corpo *"Peitou a jogada e não foi dessa vez. Faz parte — o próximo é seu."*

Hoje o servidor devolve **apenas** `result: 'success' | 'fail' | 'na'`. Esse texto **não existe** em
lugar nenhum — nem no catálogo `MATCH_CHOICES` (que só tem `prompt`/`label`), nem no contrato `/v1`.
Implementar fielmente **exige fatia de servidor**; implementar só no cliente exigiria escrever prosa
de gameplay no C#, contra o padrão de fonte-única do repo (todo texto de gameplay vive na lib pura).

**Segundo achado, menor:** o estado ③ mostra `NOTA 8.7 · +0.4` — um **delta de nota causado pela
escolha**. Essa mecânica **não existe**: o efeito da escolha é `moral` (e `focusBias`), nunca a
nota — a nota é função dos atributos e dos eventos da partida (SPEC-046).

---

## Decisões do founder (TRAVADAS — 2026-07-22)

1. **Tratamento 1a — "aposta acesa"**: botão laranja sólido + chip `⚡ TEC` branco + micro-texto
   *"sua Habilidade decide"*; a segura fica neutra com o selo `GARANTIDO`. É o recomendado pelo
   designer e o único com os 6 estados desenhados por inteiro. **1b e 1c ficam fora.**
2. **Narrativa NO CATÁLOGO (opção A)**: cada opção declara a prosa de sucesso/fracasso na lib
   pura; o servidor hidrata na anotação e o cliente só renderiza.
3. **`MORAL +N` no lugar do delta de nota**: mostra o efeito REAL que a escolha já aplica (a
   `moral` gravada no `effect`). Nenhuma regra de jogo é criada nesta SPEC de arte.

---

## Escopo — o que está DENTRO

**A. Engine (`packages/world-engine`, puro — só DADO, golden-safe)**

- [ ] `MatchChoiceOption` ganha `outcome?`: `Partial<Record<'success'|'fail'|'na', ChoiceOutcomeText>>`,
      com `ChoiceOutcomeText = { readonly title: string; readonly body: string }`.
- [ ] As **12 opções** do catálogo ganham narrativa em `match-choice-copy.ts` (arquivo novo — o
      `match-choices.ts` está a 287 das 300 linhas do OP-16): as 4 arriscadas com `success` +
      `fail`; as 8 determinísticas com `na`. Tom do design system (*glória com deboche*, segunda
      pessoa) e, no fracasso, **sem punir** (anti-culpa do charter).
- [ ] Teste de regressão por **strip** estendido: remover `outcome` (além de `risky`) antes de
      comparar com o fixture da SPEC-048 → a geração continua provada byte-idêntica.
- [ ] Invariante testada: toda opção declara a narrativa de **todo desfecho que ela pode produzir**
      (arriscada → `success` e `fail`; demais → `na`).

**B. Servidor (`services/api` — leitura aditiva ao `/v1`, SEM migration)**

- [ ] `BandChoiceOption`/`BandMatchChoice` ganham `resultTitle?`, `resultBody?` e `moralDelta?`,
      hidratados **server-side** a partir do catálogo + da linha `match_choice` já persistida.
- [ ] Presentes **só** quando a escolha está anotada (junto de `chosenOptionId`/`result`); omitidos
      enquanto pendente — política aditiva-only preservada.

**C. Cliente (`client/band-wpf`)**

- [ ] Espelho C# dos 3 campos novos (aditivo/tolerante, defaults `null`).
- [ ] **Popup no tratamento 1a**, fiel às medidas do handoff: largura **462**, fundo `#1B2440`,
      borda 1px `rgba(255,255,255,.08)`, **topo 2px `#E8722A`**, cantos 4px só no topo.
- [ ] **Header**: `NO LANCE` (Pixelify 9px, tracking .06em, `#E8722A`) + minuto à direita
      (Silkscreen 10px, `#6B769A`), com divisória embaixo.
- [ ] **Prompt**: Pixelify 15px, tracking .02em, line-height 1.15, CAIXA ALTA, `#EAF0FF`.
- [ ] **Opção segura**: fundo `#232F52`, borda 1px `#3D4E80`, raio 4, padding 9/11; rótulo Segoe UI
      13px/600 `#EAF0FF`; selo `GARANTIDO` (Pixelify 8px `#8A93B4` sobre `rgba(255,255,255,.06)`).
- [ ] **Opção arriscada**: fundo `#E8722A`, sem borda; rótulo 13px/600 `#2A1405`; chip `⚡ TEC`
      (Pixelify 8px, `#E8722A` sobre `#FFFFFF`) + micro-texto *"sua Habilidade decide"* (9px,
      `rgba(42,20,5,.72)`), variando por atributo.
- [ ] **Estado ③ GLÓRIA**: topo 2px `#E8C168`, header ouro, sprite `goat-celebrate.png` 52px,
      headline Pixelify 16px ouro com sombra dura `#A87E2C`, corpo 12px `#A9B4D0`, coluna `MORAL +N`.
- [ ] **Estado ④ FOI ASSIM**: topo 2px `#5A648A`, header `#8A93B4`, sprite `goat-idle.png` 50px a
      85% de opacidade, headline 15px `#EAF0FF`, corpo 12px. **Sem vermelho.**
- [ ] **Estado ⑤ prompt longo**: prompt cai para 14px e quebra em 2 linhas; selos ancoram na base
      do botão; o popup cresce ~20px, não mais.
- [ ] `goat-celebrate.png` embarcado como `Resource`, render `NearestNeighbor`.
- [ ] Movimento **one-shot**: entrada (opacidade + 8px, 320ms, ease-out) e pop do sprite da glória
      (500ms, bounce), via `Storyboard` em `Opacity`/`RenderTransform`.

---

## Escopo — o que está FORA

- ⚠️ **A FAIXA que aparece no mockup** (sprite do bode, badge de posição, placar `GOA 2×1 BXD`,
  pulso `AO VIVO`, painel `SUA NOTA`) — é uma proposta de **redesenho da faixa inteira**; pertence
  ao handoff de arte da faixa (3 cenas / avatar / 3 alturas). A faixa atual não é tocada.
- **Pulso infinito** do `AO VIVO` (loop de 1.1s) — animação contínua conflita com o orçamento
  `<1% CPU` de uma janela aberta 8h/dia. Só entraria com medição.
- Tratamentos **1b/1c** — só o escolhido é implementado (decisão 1).
- **Mecânica de nota alterada pela escolha** — mudaria regra de jogo (decisão 3); card próprio.
- `crown.svg`/`crown-mono.svg` — WPF não carrega SVG; a coroa já existe desenhada por retângulos
  (SPEC-049) e não é usada neste overlay.
- **Localização EN** — os ids já viajam no contrato; a prosa nova nasce PT-BR, como o resto.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `packages/world-engine/src/engine/match-choices.ts` | modificar | `outcome?` + `ChoiceOutcomeText` no tipo; catálogo referencia a cópia. |
| `packages/world-engine/src/engine/match-choice-copy.ts` | criar | As narrativas das 12 opções (OP-16 — separado do catálogo). |
| `packages/world-engine/src/index.ts` | modificar | Export aditivo do tipo `ChoiceOutcomeText`. |
| `packages/world-engine/src/engine/match-choices.test.ts` | modificar | Invariante da narrativa + strip estendido. |
| `services/api/src/band/types.ts` | modificar | `resultTitle?`/`resultBody?`/`moralDelta?` no contrato. |
| `services/api/src/band/from-world.ts` | modificar | Hidratação da narrativa pelo `result` + `moralDelta` do `effect`. |
| `services/api/src/band/band-state.ts` | modificar | Passa o `effect` da linha anotada ao builder. |
| `services/api/test/from-world.test.ts` | modificar | Anotação hidratada; omissão quando pendente. |
| `services/api/test/band-state.test.ts` | modificar | Ida-e-volta ao vivo (responder → narrativa no band). |
| `client/band-wpf/Api/BandState.cs` | modificar | Espelho dos 3 campos. |
| `client/band-wpf/View/ChoiceCard.cs` | criar | O desenho do popup 1a + os 3 estados de desfecho. |
| `client/band-wpf/MainWindow.xaml` | modificar | Troca do popup placeholder pelo `ChoiceCard`. |
| `client/band-wpf/MainWindow.xaml.cs` | modificar | Handler do clique sobre a superfície nova. |
| `client/band-wpf/View/BandViewModel.cs` | modificar | Estado do desfecho (narrativa + moralDelta). |
| `client/band-wpf/Assets/goat-celebrate.png` | criar | Sprite do handoff. |
| `client/band-wpf/BandClient.csproj` | modificar | O sprite novo como `Resource`. |
| `client/band-wpf/README.md` | modificar | Método de smoke do overlay + origem do asset. |
| `specs/SPEC-051-arte-do-momento-de-escolha.md` | criar | Esta SPEC. |
| `specs/DONE-051-arte-do-momento-de-escolha.md` | criar | O DONE. |

---

## Mudanças de schema (se aplicável)

**Nenhuma mudança de schema nesta feature.** A narrativa é dado do catálogo (lib pura), hidratada
na leitura; o `moralDelta` sai do `effect` jsonb que a `match_choice` (migration `0011`, SPEC-050)
já grava. Sem migration.

---

## Mudanças de API (se aplicável)

Nenhuma rota nova. Extensão **aditiva** do contrato `/v1` (política aditiva-only preservada):

```
GET /v1/band  (aditivo)
  club.todayMatch.choices[]:
    {
      minute, templateId, type, prompt,
      options: [{ id, label, risky?, attr? }],

      chosenOptionId?: string,          // já existente (SPEC-050)
      result?: 'success'|'fail'|'na',   // já existente (SPEC-050)

      resultTitle?:  string,   // NOVO — headline do desfecho ("A RIVAL CALOU.")
      resultBody?:   string,   // NOVO — corpo narrativo do desfecho
      moralDelta?:   number    // NOVO — o moral aplicado (ex.: 6 → "MORAL +6"); pode ser negativo
    }
    // Os 3 campos novos só aparecem junto de `chosenOptionId`/`result` (escolha resolvida).
    // Omitidos enquanto pendente e quando o catálogo não declara narrativa para aquele desfecho.
```

Sem mudança nas rotas de escrita (`POST /v1/matches/choices/answer` inalterada).

---

## Critérios de aceitação

**Cenário 1 — fidelidade ao handoff**
- Dado o momento aberto com uma opção arriscada e uma segura
- Quando o popup é renderizado
- Então ele bate com o tratamento 1a em largura (462), cores (os HEX do escopo C), famílias e
  tamanhos de fonte e espaçamentos — verificado **sem GUI** pelo harness headless (STA +
  `RenderTargetBitmap`, técnica da SPEC-049) que exporta os estados ①③④⑤ em PNG para inspeção.

**Cenário 2 — desfecho de sucesso**
- Dado que respondi a opção arriscada e o roll deu `success`
- Quando o cliente reconcilia com o servidor
- Então aparece o estado ③ (moldura ouro, header `GLÓRIA`, sprite comemorando) com a headline e o
  corpo **vindos do catálogo** para aquela opção, e a coluna mostra o `MORAL +N` real da linha
  persistida.

**Cenário 3 — desfecho de fracasso**
- Dado que respondi a opção arriscada e o roll deu `fail`
- Quando o cliente reconcilia
- Então aparece o estado ④ com a narrativa de `fail`, moldura **slate** (`#5A648A`), **sem nenhum
  vermelho** e sem linguagem de punição.

**Cenário 4 — desfecho determinístico**
- Dado que respondi a opção segura (`result = 'na'`)
- Quando o cliente reconcilia
- Então aparece a narrativa `na` da opção, na moldura neutra.

**Cenário 5 — prompt/rótulo longos**
- Dado um prompt que ocupa 2 linhas e um rótulo de opção longo
- Quando o popup é renderizado
- Então o prompt cai para 14px, quebra em 2 linhas, os selos ancoram na base dos botões e a altura
  total do popup cresce no máximo ~20px.

**Cenário 6 — erro / degradação**
- Dado um payload sem os campos novos (servidor antigo) ou uma opção sem `outcome` no catálogo
- Quando o cliente renderiza o desfecho
- Então cai no feedback genérico atual (moldura + sprite, sem prosa) **sem exceção e sem campo
  vazio na tela**.

**Cenário 7 — o selo**
- Dado o merge desta SPEC
- Quando rodo os gates
- Então `resolveMatch`/`simulateSeason`/`world-season` e os **5 goldens** ficam byte-idênticos
  (`git diff` = 0), não há migration, `dotnet build` sai com **0 avisos**, nenhuma animação
  contínua foi introduzida e a faixa fora do replay permanece inalterada.

---

## Segurança (se aplicável)

**Sem superfície de segurança nova.** Nenhuma rota é criada ou alterada; a fatia é **leitura
aditiva** + render.

- **Autorização** — inalterada e por construção: a narrativa viaja no `GET /v1/band`, cuja rota não
  aceita identificador de ator (o `athleteId` vem sempre da sessão, SPEC-038). Um jogador só recebe
  a narrativa das escolhas que **ele** resolveu.
- **Input não-confiável** — nenhum. O cliente não envia nada novo; o texto é **conteúdo do
  servidor** (catálogo da lib pura), nunca entrada do usuário — não há caminho de injeção de prosa.
- **Vazamento de mecânica** — a chance do roll e o `effect` bruto **continuam server-side**: só a
  narrativa e o `moralDelta` (o efeito **já aplicado**) atravessam. O jogador segue sem ver a
  probabilidade (invariante da SPEC-050).
- **OP-11** — a narrativa é conteúdo de gameplay, não mensagem de erro; nenhum detalhe interno
  (stack, SQL, code interno) entra no contrato.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Escopo vazar para o redesenho da faixa inteira (o mockup a mostra por completo) | **Alta** | Explicitamente FORA; critério 7 exige a faixa inalterada; o diff do cliente é revisado contra essa lista. |
| Sombra/glow do design (`box-shadow`, glow duplo) sem equivalente direto em WPF | Média | Aproximar com camadas de borda/retângulo; onde não der, registrar o desvio no DONE (precedente da coroa em retângulos, SPEC-049). |
| A prosa nova inflar `match-choices.ts` além do OP-16 (287/300 linhas) | Média | Narrativa em arquivo próprio (`match-choice-copy.ts`) desde o início. |
| Tom da narrativa violar o anti-culpa do charter no estado de fracasso | Média | Regra explícita ("faz parte — o próximo é seu"), cravada no critério 3 (sem vermelho, sem punição). |
| Fontes substitutas (o design system marca Pixelify/Silkscreen como stand-in) | Baixa | Já embarcadas sob OFL desde a SPEC-049; troca futura é swap de asset. |
| Regressão silenciosa da geração de escolhas ao mexer no catálogo | Baixa | Strip estendido no teste de regressão + os 5 goldens no critério 7. |

**Dependências:**
- **SPEC-050** (o overlay funcional + a tabela `match_choice` + o `result`) — em `main`.
- **SPEC-049** (fontes OFL embarcadas + a técnica do harness headless) — em `main`.
- **SPEC-048** (o catálogo `MATCH_CHOICES` que recebe a narrativa) — em `main`.
- **Handoff do Claude Design** — projeto `4082c853-b329-4826-b4c5-8568445257da` (importado).

---

## Notas de implementação

- **Ordem de construção** (server-first, como nas fatias anteriores): engine (tipo + cópia) →
  servidor (hidratação + contrato) → cliente (popup + estados) → harness de verificação.
- **Golden-safety pela mesma prova do `risky` (SPEC-050):** `outcome` é dado carregado nas opções;
  não toca `trigger`/rank/`minuteOf`/consumo de RNG. O motor de escolhas **nunca roda na
  simulação** — os goldens são intocados por construção, e o teste de strip prova a estrutura.
- **Fonte única do texto:** a prosa vive na lib pura e é hidratada pelo servidor. O cliente **não
  pode** ganhar tabela de texto de gameplay (o precedente é o `templateById`/`optionById` das
  decisões e escolhas — a borda hidrata, o renderizador só desenha).
- **Desenho no WPF:** seguir o padrão do card de partida (SPEC-049) — primitivas, `NearestNeighbor`
  para pixel art, nada de SVG. Sombra/glow por camadas de retângulo; se o resultado divergir do
  handoff, documentar no DONE em vez de forçar.
- **Orçamento:** nenhum timer novo e nenhuma animação contínua. As duas animações são `Storyboard`
  one-shot disparados por evento — e todo estado novo de replay tem de morrer no `StopReplay`
  (gotcha do timer zumbi, SPEC-044).
- **Mapa atributo → micro-texto** (a fechar na implementação, mantendo o tom do design):
  `tecnico` → "sua Habilidade decide" · `fisico` → "seu Físico decide" · `tatico` → "sua Leitura
  decide" · `mental` → "sua Cabeça decide".
- **Verificação sem GUI:** reusar o harness headless da SPEC-049 (STA + `RenderTargetBitmap`),
  renderizando os 4 estados em PNG — é o que permitiu inspecionar fidelidade sem smoke.

---

## Devolutiva ao designer (enviar junto da resposta)

1. ⚠️ **O `readme` do design system ainda diz que o mundo joga "Tue/Thu/Sat at 15h".** É **falso**
   desde o R4 FINAL: **todo dia, 7/7, às 15h**. Já sinalizado uma vez; enquanto não corrigir, todo
   mockup novo nasce com o mesmo drift.
2. **Camisa: 10** (a pergunta do readme). O codinome do repo é `camisa-9`, mas a identidade
   ratificada é o bode coroado de **camisa 10**.
3. **A narrativa de desfecho foi adotada** — e exigiu fatia de servidor (o texto virou dado de
   catálogo). Nos próximos momentos, mande sempre os pares sucesso/fracasso.
4. **O `+0.4` na nota não existe como mecânica** — a escolha mexe na moral, não na nota. Trocado
   por `MORAL +N`.
5. **`ng-pulse` infinito no "AO VIVO" não passa** no orçamento de <1% CPU para uma janela aberta o
   dia inteiro. Movimento one-shot (rise/pop) está aprovado.

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
- [x] Decisão 1 — tratamento **1a** (aposta acesa) — travada em 2026-07-22
- [x] Decisão 2 — **narrativa no catálogo** (opção A) — travada em 2026-07-22
- [x] Decisão 3 — **`MORAL +N`** (sem criar mecânica de nota) — travada em 2026-07-22

---

*SPEC-051 — método H1VE. Veste o momento de escolha (SPEC-050) com o handoff do Claude Design:
tratamento 1a, desfechos com narrativa vinda do catálogo, sprite de comemoração. Sem migration;
engine de simulação e os 5 goldens intocados; a faixa fora do replay não é tocada.*
