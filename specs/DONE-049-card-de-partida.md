# DONE-049 — Card de partida (imagem compartilhável)

## Metadados
| Campo | Valor |
|---|---|
| **Número** | SPEC-049 / DONE-049 |
| **Owner** | gustavo-hartz (dev) |
| **Concluída em** | 2026-07-22 |
| **Roadmap** | 4.3 / 3.x — o artefato compartilhável do dia de jogo |
| **Dependências** | SPEC-046 (`myRating`/`scorer`/`assist` no `/v1/band`) · SPEC-042 (o cliente WPF) — em `main` · o handoff de design (bundle `Card de Partida`) — fornecido |

## Resumo

Depois do jogo, o jogador gera com **1 toque** um **card de partida** — uma imagem **1080×1080**
pixel-art com a **sua nota** (SPEC-046), o **placar** e o **momento** (seus gols) — e a **compartilha**
(cola no WhatsApp). Dá forma compartilhável ao "rosto/nota" que o servidor já computa; é o gancho social
do loop diário. **Implementa o design entregue** (handoff do Claude Design: `Card de Partida.dc.html` +
tokens do design system Next Goat + assets), **fiel** ao spec de implementação (grid, tokens HEX,
tipografia em px, os 5 estados).

**Fatia 100% CLIENTE** (C#/WPF, `client/band-wpf/`), **zero dependência NuGet nova**: compõe o PNG por
primitivas WPF (`DrawingContext` → `RenderTargetBitmap` @96dpi → `PngBitmapEncoder`). O servidor não
muda — o dado vem do `GET /v1/band`.

**Contrato (espelho C#, aditivo/tolerante):** `BandMatch.MyRating` + `BandGoal.ByMe`/`Scorer`/
`AssistByMe`/`Assist` (SPEC-046 eram só-servidor; o cliente só tinha `{Minute, IsMine}`).

**Assets embarcados** (`Assets/`, `Resource` no `.csproj`): **Pixelify Sans** (display) + **Silkscreen**
(numérica — a nota/placar), **OFL** (licenças `OFL-*.txt` incluídas, copiadas ao output); o mascote
`goat-idle.png`; a **coroa** desenhada como retângulos (o `crown.svg` do handoff — WPF não carrega SVG).

**Render (`MatchCardRenderer` + `CardDraw` + `CardChip`), fiel ao design:** borda 6px na cor do
resultado, scanlines, moldura interna, IDENTIDADE (nome Pixelify 54 + badge posição/nº), a **NOTA
gigante** (Silkscreen 280, ouro com sombra dura), o **selo** V/E/D, o **placar** (grid meu-clube × rival,
ellipsis), os **chips de gol** (bola pixel + minuto na cor do resultado + VOCÊ em ouro / nome + assist.),
o **rodapé** (temporada·rodada + mascote + coroa + wordmark NEXT GOAT). **5 estados:** vitória / empate /
derrota + 0×0 "SEM GOLS" + sem-participação/nome-longo. Ouro (`#E8C168`) exclusivo da nota / do "VOCÊ" /
do "assist. você" / da coroa / do wordmark GOAT.

**Compartilhar (`MatchCardShare`, `BandViewModel.ShareMatchCard`, o affordance `📸 card`):** render →
copia p/ o clipboard (`Clipboard.SetImage`) **e** salva em `%USERPROFILE%\Pictures\NextGoat\`. Gate: só
quando `played` + `myRating != null` (`CardAvailable`). Best-effort, nunca lança.

**Verificação visual sem GUI:** um harness headless (STA + `RenderTargetBitmap`) renderizou os 5 estados
para PNG e **eu inspecionei cada um** — o card sai fiel ao handoff. `dotnet build` 0 avisos.

## Revisão adversarial (Workflow · 3 lentes · cada achado verificado ceticamente)

**Núcleo SÓLIDO — zero CRITICAL/MAJOR.** 10 brutos → **5 confirmados (2 raízes reais), 5 refutados:**

- **[MINOR — real, via primária] `MatchCardShare.Share` salvava ANTES do clipboard, num try único** →
  um erro de IO (pasta não-gravável / `MyPictures` vazio) abortava **antes** do `TrySetClipboard`,
  perdendo a **via primária (colar no WhatsApp)** e devolvendo "não deu para gerar o card" mesmo com o
  render OK. **Fix:** render num try próprio; save e clipboard viram best-effort **independentes**
  (`TrySave`), a mensagem reflete o que de fato deu (copiado > salvo > falhou). (3 agentes confirmaram a
  mesma raiz.)
- **[NIT — defensivo] chips de gol sem `ellipsis`** (a régua "nomes longos → ellipsis" do design, que a
  identidade/placar já aplicam, não valia p/ os chips) → um nome patológico estouraria o chip. **Fix:**
  clampa `Label`/`Assist` com `maxWidth`+ellipsis (verificado: nomes normais **não** truncam — o `.Width`
  do WPF devolve a largura natural; o clamp só engata no patológico).

**Refutados (5), corretamente:** o wordmark **GOAT** em ouro é **identidade de marca do próprio handoff**
(não UI comum — fora do escopo da régua "ouro exclusivo"); `Goals` null + `GoalsFor>0` → "SEM GOLS" com
placar não-zero é **inalcançável** (o contrato manda `goals` quando `played`); colisão de nome de arquivo
`card-s0-r0.png` **inalcançável** (seasonId numérico, round presente); nota fora de 3.0-10.0 **limitada
pelo servidor** (e "10.0" centra sem clipping).

## Arquivos
- **Contrato:** `Api/BandState.cs` (`BandMatch.MyRating`; `BandGoal.ByMe/Scorer/AssistByMe/Assist`).
- **Novos:** `View/MatchCardModel.cs` · `View/CardDraw.cs` · `View/CardChip.cs` ·
  `View/MatchCardRenderer.cs` · `View/MatchCardShare.cs`.
- **Wiring:** `View/BandViewModel.cs` (`CardAvailable` + `ShareMatchCard`) · `MainWindow.xaml`(+`.cs`)
  (o `📸 card` + `OnShareCardClick`) · `BandClient.csproj` (fontes/goat como `Resource`).
- **Assets:** `Assets/fonts/{PixelifySans-VF,Silkscreen-Regular}.ttf` + `OFL-*.txt` · `Assets/goat-idle.png`.
- **Docs:** `README.md` (o card + fontes/licença + o método de render headless).
- **Intocado (o SELO):** `packages/*` + `services/*` + os **5 goldens** (`git diff` = 0 — o `client/` é
  isolado dos workspaces npm). **SEM migration.**

## Gates
- `dotnet build client/band-wpf` → **0 avisos / 0 erros**.
- Os **5 estados** renderizados headless e **inspecionados** (fiéis ao handoff).
- **Selo:** `git diff` `packages/`/`services/`/5 goldens = 0; `client/` fora do prettier/eslint; os gates
  TS **não são afetados** (o cliente é isolado dos workspaces — 672 testes intactos por construção).

## Escopo deferido / follow-ups
- **A Share UI nativa do Windows** (`DataTransferManager`) — fiddly no WPF unpackaged; hoje o 1-toque é
  clipboard + save.
- **A pose `goat-celebrate` na vitória**, o mascote gigante atrás da nota, a versão story (1080×1350),
  as faces de fonte de **marca** finais (hoje as OFL substitutas).
- **"SEM GOLS" num 0×N** (meu clube não marcou, adversário sim) usa o mesmo chip do 0×0 — aceitável
  (o placar mostra o real); refinar a redação se o founder quiser.
- **O smoke real** (render na tela + colar no WhatsApp + orçamento `<1% CPU`/`<150 MB`) = **ação do
  founder** (método no `client/band-wpf/README.md`).
- Card de outros jogadores / do time / da liga; a nota "ao vivo" animada; deep-link direto no WhatsApp.

## AI declaration
Implementação por IA (Opus 4.8) em par com o dev. Design fornecido pelo founder (handoff do Claude
Design). Verificada por `dotnet build` (0 avisos) + **render headless dos 5 estados inspecionado
visualmente** (fidelidade ao handoff). Revisão adversarial por Workflow (3 lentes + verificação cética;
2 raízes reais corrigidas, 5 refutadas). Sem revisão humana linha-a-linha. 100% cliente; o smoke na
máquina (colar no WhatsApp + orçamento) é ação do founder. `packages/`/`services/`/5 goldens byte-idênticos.

*DONE-049 — método H1VE.*
