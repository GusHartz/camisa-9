# SPEC-049 — Card de partida (imagem compartilhável)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-049 |
| **Feature** | Card de partida (imagem compartilhável) |
| **Slug** | card-de-partida |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 4.3 / 3.x — o artefato compartilhável do dia de jogo |
| **Appetite** | 14 dias |
| **Prioridade** | MEDIUM |
| **Status** | Rascunho (aguardando aprovação no board) |

---

## Objetivo

Depois do jogo, o jogador gera com **1 toque** um **card de partida** — uma imagem **1080×1080** com a
**sua nota** (SPEC-046), o **placar** (vs o adversário) e o **momento** (seu gol / o artilheiro) — e a
**compartilha** (colar no WhatsApp). Dá forma compartilhável ao "rosto/nota" que a SPEC-046/048 já
computa no servidor; é o gancho social ("olha a minha nota de hoje") do loop diário.

**Esta SPEC IMPLEMENTA o design entregue** (handoff do Claude Design, `Card de Partida.dc.html` +
tokens do design system Next Goat + assets). Não é mais estrutural/sem-arte — é o card pixel-art final.

---

## Contexto e motivação

O servidor já entrega o material (o `todayMatch` do `GET /v1/band`: placar, timeline de gols com
`byMe`/`scorer`/`assist` [SPEC-046], a `myRating`). O que falta é o **artefato visual** compartilhável.
É **100% cliente** (WPF): compor a imagem pixel-art e disparar o compartilhamento; o servidor não muda
(o dado já existe). O design foi entregue com **spec de implementação completa** (grid/posições, tokens
de cor em HEX, tipografia em px, regras de estado) + **5 variações** (vitória / empate / derrota + dois
estados de borda) + **assets** (o mascote `goat-idle.png`, a coroa pixel).

---

## Escopo — o que está DENTRO

**Cliente (WPF, `client/band-wpf/`):**

- **Espelhar os campos que faltam** no contrato C# (`BandState.cs`, aditivo/tolerante):
  `BandMatch.MyRating` (SPEC-046) + `BandGoal.ByMe`/`Scorer`/`AssistByMe`/`Assist` (SPEC-046) — hoje o
  cliente só tem `BandGoal(Minute, IsMine)` e o `BandMatch` não tem a nota.
- **Empacotar as fontes + o asset** no projeto (`BandClient.csproj` ganha `Resource`s):
  - **Pixelify Sans** (display/pixel) + **Silkscreen** (numérica — a nota gigante, o placar) — fontes
    **OFL** (uso livre), embarcadas como `Assets/fonts/*.ttf` e referenciadas por URI de recurso WPF.
  - **`goat-idle.png`** (384×496, o mascote do rodapé) como `Resource`. A **coroa** é desenhada como
    retângulos (pixel-art de 2 tons de ouro) — sem depender de SVG (WPF não carrega SVG nativo).
- **`MatchCardRenderer`** (novo): compõe o **card 1080×1080** por primitivas WPF
  (`DrawingContext`/`DrawingVisual` → `RenderTargetBitmap` @96dpi → PNG via `PngBitmapEncoder`),
  **fiel ao design**: borda 6px na cor do resultado, scanlines, moldura interna, IDENTIDADE (nome +
  badge posição/nº), a **NOTA gigante** (Silkscreen 280px, ouro com sombra dura + glow), o **selo**
  V/E/D, o **placar** (grid meu-clube × rival), os **chips de gol** (minuto + VOCÊ/nome + assist.),
  o **rodapé** (temporada·rodada + mascote + coroa + wordmark NEXT GOAT). **5 estados** (ver Regras).
- **Compartilhar (1 toque):** um gesto na faixa (quando `played` + `myRating != null`) → renderiza o
  PNG → **copia a imagem para a área de transferência** (`Clipboard.SetImage`, colar no WhatsApp) **e**
  salva em `%USERPROFILE%\Pictures\NextGoat\card-<seasonId>-<round>.png`. Feedback ("card copiado").
- **Wiring:** `BandViewModel` (o estado "pode compartilhar?" + o gesto + feedback transitório) +
  `MainWindow` (o affordance, gateado por `played` + `myRating`).

**Regras de estado (do design):**
- **0×0 / sem gols** → um chip único tracejado "SEM GOLS" no lugar da linha de chips.
- **Sem participação** (nenhum gol meu/assist.) → placar + nota normais, nenhum "VOCÊ"/ouro nos chips.
- **Nomes longos** → ellipsis; nome do clube nunca quebra linha; nome do jogador máx. ~700px.
- **4+ gols** → reduzir o padding/fonte dos chips (o design prevê; ≤3 por linha).
- **Ouro (`#E8C168`)** é exclusivo da NOTA, do "VOCÊ" e da coroa — nunca em UI comum.

---

## Escopo — o que está FORA

- **Qualquer mudança de SERVIDOR** — o dado já está no `/v1/band` (a fatia SÓ consome; zero rota, zero
  migration; engine/goldens intocados por construção — o `client/` é isolado dos workspaces npm).
- **A UI de share nativa do Windows** (`DataTransferManager`) — fiddly no WPF unpackaged (interop de
  HWND, nem sempre lista o WhatsApp); a cópia-para-clipboard é o **1-toque confiável**. Follow-up.
- **A pose `goat-celebrate`** na vitória / o mascote gigante atrás da nota / a versão story
  (1080×1350) — o design os sugere como variações; ficam como polish futuro (uso `goat-idle` em todas,
  fiel ao card entregue).
- **Fontes licenciadas finais** — o design system marca as faces como substitutas OFL ("supply final
  licensed faces"); embarco as OFL (Pixelify Sans + Silkscreen), a troca por faces de marca é um swap
  de asset futuro.
- **Card de outros jogadores / do time / da liga**; a nota "ao vivo" animada; deep-link direto no
  WhatsApp — fora.

---

## Arquivos que serão tocados

| Arquivo | Ação | Descrição |
|---|---|---|
| `client/band-wpf/Api/BandState.cs` | modificar | `BandMatch.MyRating`; `BandGoal.ByMe`/`Scorer`/`AssistByMe`/`Assist` (aditivo, tolerante). |
| `client/band-wpf/View/MatchCardRenderer.cs` | criar | Compõe o card 1080×1080 pixel-art → PNG (fiel ao design + 5 estados). |
| `client/band-wpf/View/BandViewModel.cs` | modificar | Estado "pode compartilhar?" + o gesto (render→clipboard→save) + feedback. |
| `client/band-wpf/MainWindow.xaml` (+`.cs`) | modificar | O affordance "compartilhar card" (gate `played`+`myRating`); handler. |
| `client/band-wpf/BandClient.csproj` | modificar | `Resource` das fontes (`Assets/fonts/*.ttf`) + do `goat-idle.png`. |
| `client/band-wpf/Assets/fonts/*.ttf` · `Assets/goat-idle.png` | criar | Fontes OFL + o mascote (do handoff). |
| `client/band-wpf/README.md` | modificar | Documenta o card + o método de smoke + a origem/licença das fontes. |
| `specs/SPEC-049-...md` / `specs/DONE-049-...md` | criar | Esta SPEC + o DONE. |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema. **Sem migration.** (Fatia 100% cliente; o servidor não muda.)

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API. O cliente consome o `todayMatch` do `GET /v1/band` que já existe (placar, gols
com `byMe`/`scorer`/`assist`, `myRating`). Só o **espelho C#** ganha os campos que faltavam (aditivo).

---

## Critérios de aceitação

**Cenário 1 — compila + espelha o contrato + embarca os assets**
- `dotnet build client/band-wpf` → 0 avisos; `BandMatch.MyRating`/`BandGoal.*` tolerantes a null/ausente;
  as fontes e o `goat-idle.png` resolvem por URI de recurso (o build empacota).

**Cenário 2 — renderiza o card fiel ao design (smoke)**
- Dado um jogo publicado com a minha nota
- Quando aciono "compartilhar card"
- Então um PNG 1080×1080 é gerado **fiel ao handoff** (borda por resultado, nota gigante ouro, selo
  V/E/D, placar, chips de gol, rodapé com mascote/coroa/wordmark); salvo em `Pictures\NextGoat\`; e a
  imagem vai para a área de transferência (colar no WhatsApp mostra o card).

**Cenário 3 — os 5 estados + degradação**
- Vitória / empate / derrota trocam cor de borda/selo/glow; 0×0 → "SEM GOLS"; sem participação → sem
  "VOCÊ"; nome longo → ellipsis. Pré-jogo / sem `myRating` → o affordance NÃO aparece; payload sem os
  campos novos → o cliente não quebra.

**Cenário 4 — o selo**
- `packages/*` + `services/*` + os 5 goldens INTOCADOS (`git diff` = 0; o `client/` é isolado); sem
  migration; `client/` fora do prettier/eslint; os gates TS verdes.

---

## Segurança (se aplicável)

Sem superfície de segurança nova. O card usa só o dado do atleta da sessão (já autorizado por construção
no `/v1/band`). O PNG é salvo localmente (Pictures do usuário) — sem upload, sem rede nova. As fontes
embarcadas são **OFL** (redistribuição permitida; a licença acompanha o asset).

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Fontes ausentes → card renderiza com fallback errado | Média | Embarcar Pixelify Sans + Silkscreen como `Resource` e referenciar por URI de recurso (nunca só o nome de família de sistema); build empacota. |
| Métricas de fonte diferem do browser (kerning/altura) | Média | O design é pixel-art (tamanhos fixos); ajustar baseline/tracking no render; smoke visual do founder confere. |
| Render fora da UI thread / `RenderTargetBitmap` | Média | Renderizar na UI thread; `Freeze()` o bitmap; sem timer novo; gesto one-shot. |
| Verificação sem smoke visual | Alta | `dotnet build` + análise fiel ao spec; o **smoke medido (render + colar no WhatsApp) é ação do founder** (headless aqui; método no README). |
| `Clipboard.SetImage` engolir alpha/formato | Baixa | Salvar PNG (fonte-da-verdade) + copiar; o clipboard é conveniência. |

**Dependências:** SPEC-046 (`myRating`/`scorer`/`assist` no `/v1/band`) · SPEC-042 (o cliente WPF) — em
`main`. O **handoff de design** (bundle `Card de Partida`) — fornecido.

---

## Notas de implementação

- **100% cliente, zero dependência NuGet** (WPF puro: `DrawingContext`/`RenderTargetBitmap`/
  `PngBitmapEncoder`/`Clipboard`/`GlyphTypeface`/`FormattedText`). O `client/` é isolado dos workspaces
  npm → o selo (`git diff` services/packages/goldens = 0) é por construção.
- **Fiel ao design (thin renderer, OP-17):** o card só APRESENTA o dado que o servidor computou; zero
  regra de jogo (o resultado V/E/D vem do sinal de `goalsFor − goalsAgainst`, uma derivação de render).
- **Tokens do handoff** (resumo): fundo gradiente → `#0B0F1C`; topo tingido pelo resultado
  (vit `#13291D`/borda `#1E7E43`/acento `#35C46A` · emp `#161D33`/`#3D4E80`/`#8A93B4` · der
  `#2A161C`/`#9E2620`/`#E0433B`); nota `#E8C168` (ouro) sombra `#A87E2C` + glow; texto `#EAF0FF`/
  `#A9B4D0`/`#6B769A`; badge posição fundo `#E8722A` texto `#2A1405`. Tipografia: nome Pixelify 700
  54px · nota Silkscreen 280px · selo Pixelify 700 32px · placar Silkscreen 92px · chip minuto
  Silkscreen 26px / nome Pixelify 700 30px / assist. Segoe UI 24px · rodapé Silkscreen 22px.
- **Posição → rótulo PT** (GK→GOL, DEF→ZAG/DEF, MID→MEI, FWD→ATA) para o badge (a badge do design usa
  `ATA`/`GOL`). Confirmar o mapa no README.
- **1-toque = clipboard + save:** `Clipboard.SetImage(bitmap)` + `PngBitmapEncoder` →
  `Pictures\NextGoat\card-<seasonId>-<round>.png`. Feedback transitório na faixa.
- **Smoke:** `dotnet build` verde aqui; o render visual (os 5 estados) + o colar-no-WhatsApp =
  **ação do founder** (método no README).

---

## Checklist de aprovação

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora)
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (nenhuma)
- [ ] Critérios de aceitação são testáveis
- [ ] **Decisão: implementa o DESIGN entregue (pixel-art), não mais estrutural** — aceita
- [ ] **Decisão: embarcar as fontes OFL (Pixelify Sans + Silkscreen)** — aceita
- [ ] **Decisão: 1-toque = copiar p/ clipboard + salvar PNG** (Share UI nativa = follow-up) — aceita

---

*SPEC-049 — método H1VE. O card de partida: com 1 toque, uma imagem 1080×1080 pixel-art (sua nota +
placar + momento), fiel ao design entregue, copiada p/ o clipboard (colar no WhatsApp) + salva em
Pictures. 100% cliente (WPF puro, fontes OFL embarcadas, zero dep NuGet); o servidor não muda
(`services/*`/`packages/*`/5 goldens INTOCADOS), sem migration. Smoke visual = ação do founder.*
