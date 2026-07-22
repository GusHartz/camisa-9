# NEXT GOAT — cliente da faixa (WPF) · leitura + escritas + card de partida + o corpo da faixa

O **primeiro cliente do repo** (C#/WPF, .NET 8, Windows-only). A **fatia 1** (SPEC-042) entregou o
**pipe vertical fino** — a faixa ancora acima da taskbar, faz login, faz poll do `GET /v1/band` real e
desenha o dia do atleta com primitivas WPF (texto/formas/blocos de cor). A **fatia 2** (SPEC-045)
a deixa **interativa**: o jogador **distribui pontos de treino**, **responde decisões**, **compra** e
**pede regen** direto na faixa, pelas 4 rotas POST da SPEC-041, reconciliando via re-leitura do
`/v1/band`. A **SPEC-052** dá **corpo** a ela: o fundo deixa de ser chapado e ganha **cenário
pixel-art** (CT ao amanhecer · a casa onde você dorme · o vestiário da véspera), composto por
primitivas e recortado para **3 alturas** a partir de uma arte só.

> **Thin renderer (OP-17):** o cliente só apresenta affordances e dispara POSTs — **zero regra de
> jogo, zero anti-fraude**. TODA validação (saldo, ordem de moradia, opção válida, elegibilidade do
> regen, pontos livres) é do servidor; `canRegen`/`available` são **dicas de render** (o 409/400 é
> sempre tratado). A presença segue escrita de graça (abrir a faixa carimba `markActive`).

## Pré-requisitos

- Windows 10/11 (x64) + **.NET 8 SDK** (`dotnet --version` → 8.x).
- Para o smoke ao vivo: a stack do servidor no ar (Postgres + `services/api` + um mundo semeado + uma
  conta). Ver **Bring-up** abaixo.

## Build & run

```powershell
dotnet build client/band-wpf/BandClient.csproj      # compila (WinExe, framework-dependent)
dotnet run   --project client/band-wpf/BandClient.csproj
# ou o exe direto:
client/band-wpf/bin/Debug/net8.0-windows/BandClient.exe
```

A base URL da API vem de `config.json` (ao lado do exe); default `http://127.0.0.1:3000`. O token de
sessão é persistido via **DPAPI** (escopo do usuário) em `%LOCALAPPDATA%\NextGoat\band-token.bin` —
nunca em texto plano. Apagar esse arquivo força um novo login.

## Bring-up da stack viva (para o smoke)

⚠️ Os `services/*` resolvem os `packages/*` por `dist/` — **rode `npm run build` na raiz ANTES** de
subir a API/o scheduler via `tsx` (senão crash `does not provide an export`).

```powershell
# 0) build dos packages (uma vez)
npm run build

# 1) Postgres local (porta 5434 — o docker-compose.yml do repo usa POSTGRES_PORT)
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:5434/camisa9_dev"
$env:WORLD_SEED   = "beta"

# 2) migrations + mundo semeado + ancoragem da temporada (harness de ops — SPEC-039)
#    (aplique as migrations do world-store e do player-store; depois:)
$env:SEED = $env:WORLD_SEED; npx tsx harness/seed-world.ts

# 3) uma conta + atleta (não há signup no v1 — Decisão do founder)
npx tsx harness/create-account.ts craque@teste.com senha-bem-forte-123 "Craque" FWD

# 4) a API na porta 3000
$env:PORT = "3000"; npx tsx services/api/src/main.ts

# 5) (opcional) rode o tick ao menos 1× para popular clube/elenco/jogo do dia;
#    sem isso, club/squad/todayMatch vêm null e a faixa mostra o estado "na fila / sem clube"
#    (o pipe ainda é exercido ponta-a-ponta).
npx tsx services/scheduler/src/main.ts
```

Depois entre no cliente com `craque@teste.com` / `senha-bem-forte-123`.

## O smoke (o método — o gate desta fatia)

Os critérios de aceite são verificados à mão (sem C# na CI — precedente dos spikes). Roteiro:

1. **Compila** — `dotnet build client/band-wpf` → `0 Erro(s)` (o único critério automatizável; já verde).
2. **Ancora** — a faixa aparece opaca (88px) acima da taskbar, no canto; **fora do Alt-Tab/Task View**,
   nunca rouba foco. Confirme o estilo estendido vivo `WS_EX_TOOLWINDOW|NOACTIVATE|TOPMOST`
   (`~0x08000080`) com Spy++ ou `GetWindowLong`.
3. **Re-ancora por evento** — mova a taskbar / troque a resolução → a faixa reposiciona (sem polling).
4. **Login + DPAPI** — logue; depois abra `%LOCALAPPDATA%\NextGoat\band-token.bin` e confirme que o
   **token NÃO aparece em texto plano** (busque a string do token no arquivo → ausente).
5. **Pipe ao vivo** — a faixa mostra Forma/Moral, atleta (#nº, OVR, posição), fase, clube+placar
   (só quando `played=true`), elenco, decisões, fila; seções `null` ficam **escondidas**, sem crash.
6. **Replay da partida (SPEC-044)** — com uma rodada tickada com gols (rode o scheduler; a partida do
   seu clube com placar > 0), abra a faixa: o replay **auto-toca 1×** — durante `replayWatchSeconds`
   (default 240 = ~4 min, em `config.json`) o `MatchLine` vira `⏱ NN'  M–N`, o relógio corre 0'→90' e
   o placar **sobe** nos minutos dos gols, com o flash ⚽ (verde=seu, laranja=deles). Ao fim, o placar
   == o final. Clique **↻ re-assistir** → reinicia do 0'. Um novo poll (mesma rodada) NÃO re-dispara.
7. **Escritas de gameplay (SPEC-045)** — com o atleta no mundo:
   - **Treino** — quando há ponto livre (`freePoints>0`), os chips `+Fís/+Téc/+Tát/+Men` aparecem na
     linha 4; clique → o atributo sobe +1 e o `freePoints` cai (a faixa relê o `/v1/band`).
   - **Decisões** — clique `Decisões: N ▸` → o painel abre com o enunciado + as opções; escolha uma →
     a decisão sai da lista (reconcilia) e a próxima aparece; sem mais, o painel fecha.
   - **Loja** — clique `🛒 Loja` → o catálogo; "comprar" só nas linhas disponíveis (moradia em ordem,
     com saldo) → o item vira `adquirido` e o saldo cai; o próximo degrau de moradia destrava.
   - **Regen** — quando `canRegen` (tem clube + idade ≥ 25), o `↻ regen` aparece; clique → "renascimento
     solicitado" (a viragem executa). Sem elegibilidade a dica não aparece; se clicar via 409 → feedback.
   - **Erro por code** — sem pontos/saldo, decisão já resolvida, 429 → feedback **genérico** roteado pelo
     `code` (nunca a frase do servidor); a faixa **não** trava e reconcilia.
8. **Card de partida (SPEC-049)** — com uma rodada tickada com a sua nota (jogo publicado), o affordance
   **`📸 card`** aparece na linha do clube; clique → renderiza a imagem **1080×1080** pixel-art (sua nota
   gigante em ouro, o placar, o momento com os seus gols, o rodapé com o mascote + NEXT GOAT), **copia
   p/ a área de transferência** (cole no WhatsApp) **e** salva em `%USERPROFILE%\Pictures\NextGoat\`. O
   feedback confirma ("card copiado ✓"). Sem jogo/nota → o affordance **não** aparece.
   - As cores mudam com o resultado (verde vitória / slate empate / vermelho derrota); 0×0 → "SEM GOLS";
     sem participação → placar + nota, sem "VOCÊ". Confira o PNG salvo (colar no WhatsApp mostra o card).
9. **O cenário e as 3 alturas (SPEC-052)** — a faixa abre com **cenário pixel-art** atrás do conteúdo,
   que muda com a hora do dia: **CT ao amanhecer** (manhã) · **a casa onde você dorme** (noite —
   pensão nos degraus 0-1, cobertura nos 2-3) · **o vestiário da véspera** (tarde; depois das 15h com
   o jogo publicado, o placar acende em verde/cinza/vermelho). Troque `bandHeightDip` no `config.json`
   para **64**, **88** e **112** e reabra: a arte é a mesma, **recortada de baixo** — em 64 o essencial
   (campo/gol/bola no CT, placar e banco na véspera) continua visível. Confirme também que **nada
   pisca**: o cenário é composto uma vez por chave e cacheado — durante o replay, que notifica ~2×/s,
   o fundo fica imóvel.
10. **Erro por code (leitura)** — pare a API → "sem conexão"; deixe o token expirar (ou apague-o
   server-side) → **401 volta ao login**; force o rate limit → respeita o `Retry-After`.
11. **Orçamento SOB REDE + DURANTE O REPLAY** — deixe ≥10 min ocioso-com-poll **e** meça também durante
   uma janela de replay (~4 min); reusa o script do spike:

   ```powershell
   spikes/widget-taskbar/measure-usage.ps1 -ProcessName BandClient -Seconds 600
   ```

   Alvo: **CPU média `<1%`** da máquina **E** RAM (working set) **`<150MB`**, sem drift ilimitado —
   inclusive com o replay rodando (o tick é coarse, a animação é leve).
12. **Saída graciosa** — duplo-clique fecha; o `Mutex` impede uma 2ª faixa.

### Card de partida — fontes, assets e render fiel (SPEC-049)

O card é **100% cliente**, WPF puro (zero dependência NuGet): compõe o PNG por primitivas
(`DrawingContext` → `RenderTargetBitmap` → `PngBitmapEncoder`), fiel ao handoff de design (tokens do
design system Next Goat, os 5 estados). Os assets em `Assets/` são **embarcados** no exe (`Resource`):

- **Fontes** (`Assets/fonts/`): **Pixelify Sans** (display) + **Silkscreen** (numérica — a nota/placar),
  **OFL** (as licenças `OFL-*.txt` acompanham). O Pixelify é a fonte **variável** — o WPF usa a instância
  default e sintetiza o "bold"; aceitável no pixel-art (confira o smoke). O design system marca as faces
  como substitutas — a troca por faces de marca finais é um swap de asset futuro.
- **Mascote** (`Assets/goat-idle.png`); a **coroa** é desenhada como retângulos (o crown.svg do handoff).

**Render fiel sem GUI (o método de verificação visual):** um harness headless (STA + `RenderTargetBitmap`)
compõe os 5 estados (vitória/empate/derrota/0×0/nome-longo) para PNG, sem subir a faixa — foi assim que a
fidelidade foi conferida na implementação (build 0 avisos + inspeção dos PNGs). O harness vive fora do
repo (scratchpad); para re-gerar, linke `View/{CardDraw,CardChip,MatchCardModel,MatchCardRenderer}.cs` +
`Api/BandState.cs` num console `net8.0-windows`/`UseWPF` que embarque `Assets/`, e renderize modelos de
exemplo. O smoke real (colar no WhatsApp + orçamento) é ação do founder.

### O cenário — como é feito e como se verifica (SPEC-052)

O fundo é **pixel-art composta por primitivas**, no mesmo espírito do card de partida: nenhum asset
binário, nenhuma dependência. `View/PixelCanvas.cs` expõe as duas primitivas do handoff (`R`
retângulo lógico, `P` pixel) sobre um grid de **120×28**, a **4 DIP por pixel lógico**;
`View/SceneRenderer.cs` pinta as 4 cenas; `View/ScenePalette.cs` congela a paleta do design (fonte
única — a fatia 2, o avatar, reusa a mesma); `View/SceneModel.cs` projeta o `BandState` numa
`SceneKey` (thin renderer, OP-17 — o cliente não decide nada, só lê a fase, a casa e o placar).

- **As 3 alturas saem de uma arte só**: 112 DIP mostra as 28 linhas, 88 mostra 22, 64 mostra 16,
  sempre **ancorado embaixo**. Por isso a régua da "faixa segura": o que precisa sobreviver ao
  recorte compacto mora nas linhas de baixo.
- **Determinismo**: o handoff sorteava 25 pixels com `Math.random()` (janelas do prédio, luzes da
  laje) — no WPF isso faria a arte **mudar a cada repintura**. Viraram máscara determinística; o
  harness compõe a mesma chave duas vezes e compara os bytes.
- ⚠️ **Ordem de inicialização estática**: o cache de brushes do `ScenePalette` é declarado **antes**
  dos brushes que o usam. Inicializadores de campo estático rodam em ordem de declaração — o cache no
  fim da classe derruba o type initializer na primeira composição.

**Verificação sem GUI**: o mesmo método do card — um console `net8.0-windows`/`UseWPF` que linka
`View/{ScenePalette,PixelCanvas,SceneRenderer,SceneModel}.cs`, chama `SceneRenderer.Compose(key)` e
salva PNG. Foi assim que as 4 cenas × 3 alturas foram conferidas uma a uma.

## Escopo deferido (fatias futuras)

**O avatar** (fatia 2 da SPEC-052 — bloqueada pelos ativos: 12+12 cores de kit indexadas, 16 escudos,
as cenas de quitinete e apê, o glifo `?`), toasts WinRT, autoupdate + code-signing, o fix do Win+D
(parenting à WorkerW — hoje a faixa **some** no Mostrar Desktop, ratificado aceitável), a Postura B
(AppBar), e o build self-contained para distribuição. A escolha do FOCO do treino (hoje o acúmulo é
idle no scheduler) e a otimista-UI (hoje reconcilia por re-leitura). O **layout da UI em 64 DIP**
(esta fatia recorta o cenário; o que o conteúdo mostra nessa altura é decisão de UI, não de arte).
