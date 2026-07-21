# NEXT GOAT — cliente da faixa (WPF) · fatia 1

O **primeiro cliente do repo** (C#/WPF, .NET 8, Windows-only) — a fatia 1 da SPEC-042: o **pipe
vertical fino**. Uma faixa que ancora acima da taskbar, faz login, faz poll do `GET /v1/band` real e
desenha o dia do atleta com primitivas WPF (texto/formas/blocos de cor). **Zero arte** (os assets não
estão no repo — deferidos); o objetivo é provar que o shell (SPEC-003/006) + o auth+read-model
(SPEC-037/038) se sustentam **juntos, ao vivo, dentro do orçamento** (`<1% CPU` / `<150MB RAM`).

> **Thin renderer (OP-17):** o cliente só apresenta o estado que o servidor computou. Zero regra de
> jogo, zero anti-fraude. Só-leitura nesta fatia (a presença é escrita de graça: abrir a faixa carimba
> `markActive` no servidor). As escritas de gameplay são a fatia 2.

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
7. **Erro por code** — pare a API → "sem conexão"; deixe o token expirar (ou apague-o server-side) →
   **401 volta ao login**; force o rate limit → respeita o `Retry-After`.
8. **Orçamento SOB REDE + DURANTE O REPLAY** — deixe ≥10 min ocioso-com-poll **e** meça também durante
   uma janela de replay (~4 min); reusa o script do spike:

   ```powershell
   spikes/widget-taskbar/measure-usage.ps1 -ProcessName BandClient -Seconds 600
   ```

   Alvo: **CPU média `<1%`** da máquina **E** RAM (working set) **`<150MB`**, sem drift ilimitado —
   inclusive com o replay rodando (o tick é coarse, a animação é leve).
9. **Saída graciosa** — duplo-clique fecha; o `Mutex` impede uma 2ª faixa.

## Escopo deferido (fatias futuras)

Arte (avatar em camadas, 3 cenas ilustradas), as 3 alturas (64/88/110), toasts WinRT, autoupdate +
code-signing, as 4 escritas de gameplay, o fix do Win+D (parenting à WorkerW — hoje a faixa **some** no
Mostrar Desktop, ratificado aceitável), a Postura B (AppBar), e o build self-contained para distribuição.
