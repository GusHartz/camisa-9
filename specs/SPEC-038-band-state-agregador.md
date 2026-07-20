# SPEC-038 — `readBandState` + `GET /v1/band` (Faixa: a vida no CT — card 2 de 4)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-038 |
| **Feature** | `readBandState` + `GET /v1/band` — **card 2 de 4** do card original "Faixa: a vida no CT" |
| **Slug** | band-state-agregador |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | **0.4 — baseline de segurança** (`roadmap.md:18`), junto da SPEC-037. Card 3 = **3.7**; card 4 = **3.4** + o *render* de 3.7. |
| **Appetite** | **2 a 3 dias** (agregador + readers novos ~1,5d · suíte ao vivo campo a campo ~1d · patches ~0,5d). |
| **Prioridade** | ALTA — é a rota que a faixa lê; sem ela a SPEC-037 entrega um servidor que só sabe autenticar. |
| **Criada em** | 2026-07-20 |
| **Status** | **PROPOSTA — aguardando aprovação do founder.** ⚠️ **Dependência DURA: a SPEC-037 precisa estar mergeada** (esta SPEC consome `createApiServer`, o middleware `AuthedHandler` e o seam `RouteCtx` que ela entrega). |

### O card original virou 4 cards

| Card | Entrega |
|---|---|
| **1 — SPEC-037** (0.4) | **O servidor**: `services/api` (`node:http`, seam `RouteCtx`), sessão opaca, `/healthz` + `/v1/auth/login` + `/v1/auth/logout`, rate limit, migration `0010_session`, harness de operador. |
| **2 — SPEC-038** (esta, 0.4) | **A rota de leitura + o agregador**: `GET /v1/band`, o contrato `BandState`, os readers novos (world-store + player-store), as regras puras novas em `packages/player`, o `markActive`. |
| **3 — SPEC futura** (3.7) | **Escritas de gameplay** (`POST /v1/training`, `/decisions/:id/answer`, `/purchases`, `/regen`) — as ações que estes dois cards só expõem como estado. ~15 linhas cada, sobre função já testada. |
| **4 — SPEC futura** (3.4) | A faixa **visual**: WPF portando o interop de `spikes/widget-taskbar/`, as 3 alturas (64/88/110), a arte, o avatar em camadas, `appearanceFromId`. **Já nasce ACIONÁVEL**, porque o card 3 a precede. |

A ordem segue `roadmap.md:149` (*"server-first — a UI só apresenta o que o motor já garante"*) ⇒ **a cláusula "a faixa é read-only por construção" morre**.

---

## Decisões travadas com o founder (2026-07-20)

0. **Esta SPEC depende da SPEC-037 — dependência DURA, não convenção.** O `GET /v1/band` é registrado no `src/router.ts`, servido pelo `createApiServer` e protegido pelo middleware `AuthedHandler`, os três **entregues pela SPEC-037**; o `athleteId` do agregador vem de `readActiveAthlete(session.accountId)`, e a sessão é a tabela `player.session` da migration `0010`. **Não há como mergear a 038 antes da 037** — sem o servidor e sem o middleware de sessão, esta fatia não tem onde se plugar nem de onde tirar o ator.

1. **Fôlego NÃO é barra — são DUAS, Forma e Moral.** O card pede "forma/moral/**folego**", contra `functional-spec.md:33,44`, `vision-scope.md:54` e `roadmap.md:65` (*"stamina existe só dentro da partida, não persiste, invisível fora do jogo"*) e contra o código (`schema/athlete.ts:50-51` tem só `forma`/`moral`). O R4 FINAL cortou o fôlego diário. ⇒ `BandBars` tem **exatamente dois campos**, cravado por teste. Nada a patchear — **o card é que está velho**.

2. **Três estados, vocabulário do doc.** `functional-spec.md:23` crava *"vida do atleta: CT, casa, pré-jogo"* ⇒ enum **`'ct' | 'vespera' | 'casa'`**. **As 15h NÃO viram um 4º estado** — o cliente distingue o pico pelo payload (`roundSettled` + `todayMatch`).

3. **Regra de `dayPhase` — três faixas horárias contíguas, sem buraco.**
   ```ts
   // packages/player/src/day-phase.ts — PURA, sob o guardrail
   export function dayPhase(hour: number): DayPhase {
     if (hour < 12) return 'ct';    // manhã: jornal, foco do treino, pontos de ontem
     if (hour < 21) return 'casa';  // 12h escalação · 13-15h pré-jogo · 15h JOGO · 18h decisões
     return 'vespera';              // noite: amanhã tem jogo — sob cadência diária, SEMPRE tem
   }
   ```
   ⚠️ **Consequência estrutural: `dayPhase` perde o 2º parâmetro** — a regra é função **só da hora**; `roundSettled` deixa de ser entrada da fase (parâmetro que não influencia o retorno é código morto) mas **permanece no contrato**. ⚠️ A janela `casa` contém **o pico do dia**, não só o sofá da noite — contra-intuitivo e proposital. Diverge de `functional-spec.md:77` (*"13-15h pré-jogo"*) ⇒ resolvido por **patch P12**, não em silêncio.

4. **Avatar, kit e número da camisa.** O avatar é composição de camadas com paleta indexada, **nunca o mascote**. Nesta fatia: o humano logado leva sua `appearance` autoritativa (a coluna existe — basta estender o reader, **sem migration**); os colegas levam **`avatarSeed` = o `athleteId` do mundo**, e o card 4 deriva as camadas onde a arte mora (derivar hoje contra um catálogo inventado faria toda aparência de NPC mudar quando a arte real chegar). ⚠️ **O kit do clube não existe** (`types.ts:96-107`; grep → 0 hits) e sem ele o card 4 desenha 17 bonecos sem camisa ⇒ **`kitFromClubId(clubId)`**, fn pura (FNV-1a × bounds de `TEAM.kit`), ~20 linhas, **zero migration/coluna/golden**. ⚠️ **O número da camisa também não existe** (grep `shirtNumber|shirt_number|jerseyNumber` → **zero**) — **DECIDIDO: o jogador escolhe na criação**, mas isso é **momento de CRIAÇÃO** (mexe na SPEC-016) ⇒ **card próprio**, com **dependência DURA antes do card 4**; `athlete.shirtNumber` fica **fora do v1** e entra aditivamente. ⚠️ **Restrição forward:** `appearanceFromId` **nunca** vira campo do `Athlete` do engine — arrastaria `WorldState` e regeneraria os goldens.

5. **Contrato `/v1`, evolução só-aditiva.** Campos novos podem aparecer; campo existente **nunca** muda de tipo nem some; `null` = **"não se aplica"**, jamais "não sei". ⇒ **`trainedToday` é OMITIDO, não fingido** (`applyTraining` não grava dia; sem endpoint de treino seria permanentemente `false` = dado morto e enganoso) — entra no card 3 via escopo `'train'` no `daily_ledger`, **sem migration**. Pela mesma lógica **`minClientVersion` fica fora**.

6. **Confirmação externa — o design handoff (mockup v2).** Chegou **depois** do contrato escrito e confirmou, de forma independente, os três estados com **nomes idênticos**, as **duas** barras e o avatar em camadas com a nota *"o bode é só a marca, nunca o jogador"* (⇒ confirma o patch P4). Os bounds batem: os "~500 mil" do protótipo = `6×6×6 × 12×12×16 = 497.664` (`constants.ts:20,66`) — **sem divergência**. ⚠️ **Achado de drift do lado do design:** os relógios dos mockups foram montados sobre o `readme` do design system, que afirma cadência **Ter/Qui/Sáb** — falsa desde o R4 FINAL. Contra a regra ratificada: **VÉSPERA 22:41 ✅ · CASA 21:07 ⚠️ (erra por 7 min) · CT 14:38 ❌** (a cena de CT é a manhã). **A arte está certa e é aproveitável inteira** — o defeito é a hora. Devolutiva ao designer registrada no DONE, incluindo a correção do `readme` (a causa raiz, que reinfectaria os próximos mockups).

---

## Objetivo

Dar à faixa **de onde ler**. A SPEC-037 entrega a primeira superfície do projeto que escuta numa porta, mas ela só sabe autenticar; o estado que a faixa desenha continua espalhado por ~7 leituras in-process nos dois bancos. Esta SPEC entrega o agregador **`readBandState`** — que monta numa chamada só o dia inteiro do atleta (fase do dia, as duas barras, treino, casa, lesão, clube, elenco, decisões pendentes, fila) — e a rota **`GET /v1/band`** que o serve, com o contrato `BandState` congelado em `/v1` sob política **aditiva-only**. De quebra, **adota o seam órfão da SPEC-023**: `markActive` nunca foi chamado em produção; agora a faixa aberta **é** o sinal de presença que o congelamento de vaga sempre esperou.

---

## Contexto e motivação (fatos verificados no repo)

- **Ressalvas dos leitores** (a coluna *Origem* do Contrato dá função·arquivo:linha): `readAthleteProgress` filtra `active=true`; `readWallet` **abre transação** mesmo só-leitura (4 round-trips); `readInjuryState` **exige day-index**; `readAthleteIdentity` **não devolve `appearance` nem `id`**; `readOccupation` **não tem `age`**; `readClubRoster` **não tem `isHuman`**.
- **Buracos confirmados:** `rowToAthlete` (`world-mapper.ts:131`) **descarta `isHuman`** — incluí-lo mudaria `Athlete` → `WorldState` → **regeneraria os goldens** (proibido); `readWorldOccupations` devolve o mundo inteiro; `readWorld` são **5 SELECTs / ~1.280 atletas** (proibido no caminho quente); `readRound` lê de `published_round` ⇒ **rodada não jogada não existe lá** e não serve para o adversário na véspera; `QueueEntry.position` (`waiting-repo.ts:13,15`; a coluna em `waiting-list.ts:17`, documentada em `:5`) é a **posição de futebol**, não o lugar na fila; **nenhuma máquina de estados do dia existe**.
- **Guardrail em `packages/*`:** `eslint.config.mjs:83` restringe o guardrail a `packages/*/src` — nada de relógio, `random` ou transcendental ali ⇒ `dayPhase` recebe a **hora já resolvida** e `daysUntilRevert` recebe o **limiar injetado** (`VACANCY.revertAfterDays` vive num *service*, e `packages/player` não importa service).
- **Âncoras de doc:** `functional-spec.md:147` (*"escrita no mundo é exclusiva do motor"*) · `:20` `[SUPOSIÇÃO]` (estado da vaga é do motor, não da sessão — **esta SPEC resolve**) · `:23` (*"vida do atleta: CT, casa, pré-jogo"*) · `:77` (*"12h escalação · 13-15h pré-jogo"*, a linha que o P12 desambigua); `sdd.md:47` (i18n: nada localizável na API) · `:155` (conta A não acessa dados de conta B) · `:84` (o ator só age sobre os próprios atletas).
- **Infra herdada (vale para as duas fatias):** `services/*` é **typecheck-only** (glob), **nunca** em `tsc -b` (TS6310); `paths` e `alias` são **listas explícitas**; `vitest` roda `fileParallelism:false`; **todos os locks em `services/**` são `_xact_`** (`ADR-002:57` — a API roda no endpoint **pooled**); `client.ts:47` dá **20 conexões** totais. O gotcha do `wipeAll` (`session` antes de `account`) é detalhado na SPEC-037, que cria a tabela — aqui só se **respeita**.

---

## Escopo — o que está DENTRO

### A) `packages/player` — regras puras novas (aditivas, sob o guardrail)
- [ ] `day-phase.ts` — `DayPhase` + **`dayPhase(hour)`** (⚠️ um só parâmetro). Puro, **standalone** (não importa `world-engine`).
- [ ] `injury.ts` — aditivo: `daysLeftOf(startedDay, recoveryDays, day)`. A API **consome**, não reimplementa.
- [ ] `vacancy.ts` — novo: `daysUntilRevert(frozenSinceDay, day, limiar)`. ⚠️ `VACANCY.revertAfterDays` vive num **service** ⇒ o limiar entra **injetado pela borda**.
- [ ] `kit.ts` — novo: `kitFromClubId(clubId)` = `{primaryColor, secondaryColor, crest}` (FNV-1a × bounds de `TEAM.kit`, `constants.ts:66`).
- [ ] Linhas de barrel.

### B) `services/player-store` — os readers que faltam (**sem migration**)
- [ ] `player-repo.ts` — `readAthleteIdentity` passa a devolver **`appearance`** (aditivo, mesmo SELECT, sem migration).
- [ ] `decision-repo.ts` — `countPendingDecisions(db, athleteId, day)`. ⚠️ `readDecisionLog:223` traz o log inteiro sem filtro e **não serve**.

### C) `services/world-store` — readers estreitos, golden-safe (**sem migration**)
- [ ] `world-repo.ts` — `readClubBrief(seed, clubId)` = `{id, name, leagueId, tier}` (1 join `club ⋈ league`; **substitui o `readWorld` gordo**) · `readClubSquad(seed, clubId)` com **tipo PRÓPRIO incluindo `isHuman`** (⚠️ **não** tocar `rowToAthlete`/`readClubRoster`/`types.ts` — o padrão-dispatch da SPEC-036 aplicado a um reader) · `readLeagueClubIds(seed, leagueId)`.
- [ ] `occupation-repo.ts` — `readOccupationsByClub`. ⚠️ arquivo já tem **303 linhas físicas**; se apertar, nasce em `occupation-by-club.ts`.
- [ ] `daily-round.ts` — **extrair e exportar `targetRoundFor(dayIndex, startDayIndex)`** (o `:71`, hoje inline). Refactor puro.

### D) `services/api` — a rota e o agregador (sobre o servidor da SPEC-037)
- [ ] `src/routes/band.ts` — o handler `AuthedHandler` da rota.
- [ ] `src/band/` — `types.ts` (**o CONTRATO**) · `band-state.ts` (as 2 ondas) · `from-player.ts` · `from-world.ts`.
- [ ] `src/router.ts` — **editar**: acrescentar o caso `GET /v1/band` ao `switch` (o arquivo nasce na SPEC-037).
- [ ] `src/http/rate-limit.ts` — **editar**: o **terceiro balde** (`accountId`, 30/min). Os dois baldes de `/v1/auth/*` e o `reset()` vêm da SPEC-037.

**`readBandState` mora em `services/api/src/band/`, não em `world-entry`** — o molde de assinatura é o `moodModulator` (dois handles, zero transação cross-schema), mas `world-entry` é dependência do **scheduler** (money path), e um agregador de UI muda quando o contrato de UI muda. É **transporte-livre** e testável **sem subir servidor**. **Explicitamente não-atômico** (snapshot eventualmente-consistente, leitura de UI) — dizer isso no cabeçalho do arquivo.

### E) Docs de fundação
- [ ] Os patches **P1, P2, P3, P4, P7, P10, P11, P12** (ver seção própria).

### F) Testes (puros sempre; ao vivo gated por `DATABASE_URL`)
Ver Critérios. Foco: autorização cross-conta, o agregador campo a campo, estados degradados, os três relógios, `markActive`, o teto de round-trips, o balde de `/v1/band`, grep-gates.

## Escopo — o que está FORA

- **Escritas de gameplay** — **card 3**; `POST /v1/training` traz junto o `trainedToday`.
- **Cliente WPF, 3 alturas, arte, avatar em camadas, `appearanceFromId`** — **card 4**. *(Os patches das 3 alturas entram AQUI — P1/P2/P3.)*
- **O número da camisa** — card próprio (coluna + migration + range 1-99 + unicidade no elenco + payload de criação + o `harness/create-account.ts`). ⚠️ **dependência DURA antes do card 4.**
- **`forma`/`moral` dos colegas** — 1 query batch, sem valor até a arte existir. Card 4.
- **Classificação da liga** — nenhum reader devolve standings sem `readWorld`. Deferido, **nomeado**.
- **"Estou escalado hoje?"** — ⚠️ **buraco de produto nomeado:** `functional-spec.md:77` crava *"12h escalação do dia"*, mas **o dado não existe** (`resolveMatch` só vê força escalar; o elenco de 16 nunca é escalado). Deferido para a partida rica (2ª fatia do card 1.1/3.2); se o card 4 precisar antes, o proxy honesto é *"titular provável = os 11 melhores por `ability` do `readClubSquad`"*, **a custo zero**.
- **`statement_timeout` por request** — ⚠️ nomeado: `persistWorldTurnover` faz DELETE+INSERT do snapshot numa tx única, e um `GET /v1/band` no meio **bloqueia** nos locks de linha. `SET SESSION` é **proibido** sob o pooler ⇒ a saída (`SET LOCAL` em tx) é **card próprio**.
- **`GET /v1/profile`, `/v1/team`, `/v1/legends`** — nada na faixa v1 os renderiza; `readTeam` não aceita `athleteId`.
- **`minClientVersion`** — fora por decisão (Decisão 5): sem cliente e sem `X-Client-Version`. Entra **aditivamente** quando o card 4 existir.
- **A dívida de i18n do `decisions.ts`** — registrada, não consertada.
- **Migration de qualquer espécie** — **esta fatia NÃO tem migration**: todo campo novo do contrato sai de coluna existente, de reader estreito novo ou de fn pura.

---

## A superfície HTTP

Erro **sempre** `{ error, code }` — `code` é a chave **estável e não-localizável** (o cliente roteia e traduz por ela); `error` é frase genérica. **Nunca** stack, SQL ou detalhe interno (OP-11). O serializador único (`http/respond.ts`) e o `no-store` por default vêm da SPEC-037.

```
GET /v1/band                 ⚠️ NENHUM identificador em path, query ou body
  200  BandState                                               + Cache-Control: no-store
  401  unauthorized · 409 no_active_athlete · 500 internal
  429  rate_limited + retryAfter + header `Retry-After`
  Efeito colateral declarado: markActive best-effort.
```

**O terceiro balde de rate limit** (`sdd.md:100`): janela fixa **in-process**, **`GET /v1/band` por `accountId` (30/min)**, teto duro contra loop (um token válido em loop satura os 20 slots de pool e derrubaria a faixa de todos — a política de 1×/60s do cliente é **cooperação**, nunca o controle). ⚠️ Com `fileParallelism:false` o `Map` é **estado de módulo compartilhado entre suítes** ⇒ o `reset()` do limitador (SPEC-037) é chamado no `beforeEach` de toda suíte que toca `/v1/band`.

**`markActive` — em `GET /v1/band`, não no login:** o seam da SPEC-023 mede **presença**, não sessão viva (no login o sinal mentiria nos dois sentidos). **A faixa aberta É o sinal.** Três armadilhas: **(1)** o dia é **`resolveSlot(epochMs).dayIndex`**, ⚠️ **não `dueDayIndex`** — antes das 15h este é *ontem*, e o `runVacancyPass` (`vacancy-repo.ts:94`) leria `inactive=1` e **congelaria quem abriu a faixa de manhã**, disparando o e-mail "segurando sua camisa" contra um presente; **(2) throttle grátis** — o agregador já leu a ocupação ⇒ `if (club.lastActiveDay !== day)` reduz a **1 escrita/dia/jogador** (senão o `FOR UPDATE` de todo poll serializaria contra o `runVacancyPass`); **(3) isolamento** — try/catch + log genérico: um relógio de vacância que falha não devolve 500 na faixa.

---

## Contrato — `BandState` campo a campo

```ts
export interface BandState {
  readonly contractVersion: 'v1';
  readonly serverTime: BandTime;
  readonly phase: DayPhase;             // 'ct' | 'vespera' | 'casa'
  readonly athlete: BandAthlete;
  readonly bars: BandBars;              // ⚠️ DUAS. Nunca fôlego.
  readonly training: BandTraining;
  readonly home: BandHome;
  readonly injury: BandInjury | null;
  readonly club: BandClub | null;       // null = sem vaga (fila / benched / mundo ausente)
  readonly squad: readonly BandMate[];  // [] quando club === null
  readonly pendingDecisions: number;    // CONTAGEM (i18n: zero prosa na API)
  readonly queue: BandQueue | null;     // só quando club === null e há fila
}
```

| Campo | Tipo | Origem (função · arquivo:linha) | Handle |
|---|---|---|---|
| `contractVersion` | `'v1'` | constante — o gancho da política aditiva-only | — |
| `serverTime.epochMs` | `number` | o `epochMs` injetado (o cliente calcula a virada de fase localmente) | — |
| `serverTime.dayIndex` | `number` | `resolveSlot(epochMs).dayIndex` · `anchor.ts:22` | — |
| `serverTime.brtHour` / `.brtMinute` | `number` | `resolveSlot(...)` · `anchor.ts:22` (fuso fixo UTC-3, sem `Intl`) | — |
| `serverTime.roundSettled` | `boolean` | `(readTickCursor ?? -1) >= slot.dayIndex` · `tick-progress-repo.ts:9` ⚠️ **`slot.dayIndex`, não `dueDayIndex`** | world |
| `phase` | `DayPhase` | **`dayPhase(slot.hour)` — NOVA** (as 15h caem dentro de `casa`) | — |
| `athlete.id` | `string` | da **SESSÃO** (`readActiveAthlete` · `player-repo.ts:134`) — **nunca do cliente** | player |
| `athlete.name` / `.position` | `string` | `readAthleteIdentity` · `player-repo.ts:106` (`position` cru; a borda guarda com `isPosition`) | player |
| `athlete.appearance` | `{skinTone,hairStyle,hairColor}` | coluna `athlete.appearance` jsonb (`schema/athlete.ts:29`) — **estender o reader** (sem migration) | player |
| `athlete.overall` | `number` | `readAthleteProgress` · `training-repo.ts:100` | player |
| `athlete.age` | `number \| null` | ⚠️ `OccupationView` **não tem `age`** → derivado da entrada de `readClubSquad` cujo `athleteId` bate (**custo zero**); `null` sem vaga | world |
| `athlete.available` | `boolean` | `readInjuryState(…, **tickDay**)` · `injury-repo.ts:114` | player |
| **`bars.forma`** / **`bars.moral`** | `number [0,100]` | `readMood` · `mood-repo.ts:31` | player |
| *(não existe `bars.folego`)* | — | ⚠️ `schema/athlete.ts:50-51` tem só `forma`/`moral`. Decisão 1 | — |
| `training.attributes` | `{fisico,tecnico,tatico,mental}` | `readAthleteProgress` · `training-repo.ts:100` | player |
| `training.trainingXp` / `.nextThreshold` | `number` | idem — a barra é `xp / threshold` | player |
| `training.freePoints` | `number` | idem — o badge "+1 ponto para gastar" (⚠️ **estado**, não ação) | player |
| `training.lastFocus` / `.focusStreak` | `string\|null` / `number` | idem | player |
| `training.nextFocusPenaltyPct` | `number` | idem (100 = fresco) — o rendimento da próxima sessão, na cena do CT | player |
| *(não existe `training.trainedToday`)* | — | ⚠️ sem fonte → **omitido, não fingido**. Decisão 5 | — |
| *(não existe `minClientVersion`)* | — | ⚠️ sem cliente e sem `X-Client-Version`. Decisão 5 | — |
| *(não existe `athlete.shirtNumber`)* | — | ⚠️ card próprio; entra **aditivamente**. Decisão 4 | — |
| `home.balance` | `number` | `readWallet` · `economy-repo.ts:118` | player |
| `home.lifestyleTier` | `0..3` | `readWallet` — **a cena de casa** (pensão→quitinete→casa→cobertura) | player |
| `home.hasMothersHouse` | `boolean` | `readWallet` — o marco | player |
| `home.ownedItemIds` | `string[]` | `readWallet` — os props da cena | player |
| *(`tradeoffs` NÃO entra)* | — | seam interno da 2.3, não é UI | — |
| `injury.severity` | `'leve'\|'media'\|'grave'` | `readInjuryState(…, **tickDay**)` · `injury-repo.ts:114` | player |
| `injury.startedDay` / `.recoveryDays` | `number` | idem | player |
| `injury.phase` | `'recuperando'\|'recuperado'` | `injuryPhase` · `injury.ts:39` (**já exportado — reusar**). ⚠️ a fase `'contusao'` **não existe na fonte**; criá-la é regra nova, fora desta fatia | — |
| `injury.daysLeft` | `number ≥ 0` | **`daysLeftOf(startedDay, recoveryDays, tickDay)`** — helper aditivo | — |
| `club.clubId` / `.position` / `.seasonId` | `string` | `readOccupation` · `occupation-repo.ts:106` (⚠️ `seasonId` **daqui**, não do `readWorld`) | world |
| `club.name` / `.leagueId` / `.tier` | `string`/`string`/`number` | **`readClubBrief` — NOVO** (`club ⋈ league`) | world |
| `club.kit` | `{primaryColor,secondaryColor,crest}` | **`kitFromClubId(clubId)` — NOVA**, pura. ⚠️ não existe kit no mundo; sem isto o card 4 desenha 17 bonecos sem camisa | — |
| `club.round` | `number \| null` | **`targetRoundFor(tickDay, startDayIndex)`** — extraído de `daily-round.ts:71`; `null` fora de temporada | world |
| `club.lastActiveDay` / `.frozenSinceDay` | `number \| null` | `readOccupation` (espaço `slot.dayIndex`; `lastActiveDay` **é também o throttle do `markActive`**) | world |
| `club.daysUntilRevert` | `number \| null` | **`daysUntilRevert(...)`** com o limiar injetado; `null` se não congelado | — |
| `club.todayMatch` | `BandMatch \| null` | **PRÉ-JOGO:** `generateFixtures(readLeagueClubIds(...))[round−1]` (engine, `index.ts:13`). **PÓS-JOGO:** `readRound` preenche o **placar**. ⚠️ `readRound` sozinho **não serve** — rodada não jogada não existe em `published_round` ⇒ `todayMatch` seria `null` durante toda a véspera, a única fase em que o campo tem razão de existir | world |
| `…opponentClubId` / `.opponentName` | `string` | do fixture ou do `MatchResult` (`types.ts:32-43`) / **`readClubBrief` do adversário** | world |
| `…isHome` / `.played` | `boolean` | `homeId === clubId` / a rodada existe em `published_round` | — |
| `…goalsFor` / `.goalsAgainst` | `number \| null` | do `MatchResult`; `null` enquanto `!played` | — |
| `squad[].athleteId` | `string` | **id do MUNDO** — `readClubSquad` (**NOVO**, tipo próprio) | world |
| `squad[].name`/`.position`/`.age`/`.ability` | — | idem — a mesma tabela que `readClubRoster` lê, **sem tocar `rowToAthlete`** | world |
| `squad[].isHuman` | `boolean` | `readClubSquad` (a coluna `is_human` que `world-mapper.ts:131` descarta) ⚠️ **não** incluir em `rowToAthlete` — regeneraria os goldens | world |
| `squad[].isMe` | `boolean` | `athleteId === occupation.athleteId` | — |
| `squad[].avatarSeed` | `string` | **= o `athleteId` do mundo**; o cliente deriva as camadas. Zero coluna, zero golden | — |
| *(não existe `squad[].appearance`/`.forma`)* | — | deferidos para o card 4 | — |
| `pendingDecisions` | `number` | **`countPendingDecisions(…, tickDay)` — NOVO** | player |
| `queue.rank` | `number` | DERIVADO: índice **1-based** no array de `readQueue` (ordenado por `ord`). ⚠️ **não usar `QueueEntry.position`** — é a **posição de futebol**. O(n); revisão se a fila > 1.000 | world |
| `queue.total` | `number` | `readQueue(...).length` (`queueLength` vira redundante) | world |

⚠️ **Três perguntas, TRÊS relógios — cravados por teste:** `phase` → **`slot.hour`** e nada mais · `roundSettled` e `markActive` → **`slot.dayIndex`** (o dia-calendário) · `readInjuryState`, `countPendingDecisions` e `club.round` → **`tickDay = dueDayIndex(epochMs)`**, porque **todo carimbo do player-store é gravado pelo tick nesse espaço** (`daily-tick.ts:71,265-273`). Antes das 15h, `tickDay = slot.dayIndex − 1`.

**Regra de nulidade:** `null` = **"não se aplica"**, jamais "não sei" — a razão de `trainedToday` ser omitido em vez de `false`.

**Custo de I/O:** duas ondas (`Promise.all` em cada; a onda 2 depende de `clubId`/`dayIndex`). **Teto: ≤ 24 round-trips**, p95 < 150 ms (onda 1 = 11 · onda 2 = 7 · `markActive` = 4 = **22**; inclui BEGIN/COMMIT das transações só-leitura de `readWallet` e do `markActive`). ⚠️ **Anti-requisito elevado a critério:** `readBandState` **NUNCA** chama `readWorld` nem `readWorldOccupations`.

---

## Migration

**Nenhuma. SEM MIGRATION** (OP-01 não é acionada): o `appearance` sai de coluna jsonb existente (`schema/athlete.ts:29`), o `isHuman` de coluna existente (`is_human`), o kit e as fases de funções puras novas, e nenhum reader novo cria tabela, coluna ou índice. O world-store (`0008`) e o player-store (`0010`, criado pela SPEC-037) ficam **intocados** por esta fatia.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/day-phase.ts` (+`.test.ts`) | criar — `dayPhase(hour)`; teste das 24 horas + fronteiras 11/12 e 20/21. |
| `packages/player/src/vacancy.ts` · `kit.ts` (+`.test.ts`) | criar — `daysUntilRevert` · `kitFromClubId`. |
| `packages/player/src/injury.ts` · `index.ts` | editar — aditivo `daysLeftOf` · barrel. |
| `services/player-store/src/store/player-repo.ts` · `decision-repo.ts` · `index.ts` | editar — `appearance` no identity · `countPendingDecisions` · barrel. |
| `services/world-store/src/store/world-repo.ts` | editar — `readClubBrief` · `readClubSquad` (**tipo próprio com `isHuman`**) · `readLeagueClubIds`. |
| `services/world-store/src/store/occupation-repo.ts` · `daily-round.ts` · `index.ts` | editar — `readOccupationsByClub` · exportar `targetRoundFor` · barrel. |
| `services/api/src/routes/band.ts` | criar — a rota protegida (`AuthedHandler` da SPEC-037). |
| `services/api/src/band/{types,band-state,from-player,from-world}.ts` | criar — o CONTRATO + o agregador (2 ondas) + os dois lados. |
| `services/api/src/router.ts` · `src/http/rate-limit.ts` · `src/index.ts` | editar — o caso `GET /v1/band` · o 3º balde (`accountId` 30/min) · barrel (arquivos nascem na SPEC-037). |
| `services/api/test/{band-state,server-band}.test.ts` | criar — agregador **sem servidor** + a rota em `listen(0)`. **O teste das chaves de `BandBars` vive em `band-state.test.ts`.** |
| `docs/projeto/{sdd,functional-spec,vision-scope,roadmap}.md` | editar — os patches P1, P2, P3, P4, P7, P10, P11, P12. |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — **0.4 🚧→✅** (é esta SPEC que fecha o item; a SPEC-037 só o marca 🚧) + 2.1 + 3.4/3.7 + "Estado atual". |
| `specs/SPEC-038-band-state-agregador.md`, `specs/DONE-038-band-state-agregador.md` | criar. |

**Intocado (o critério DURO):** **`packages/world-engine` inteiro e os 4 goldens** (`git diff` = **0**), incl. `world-expansion.golden.json`. A fatia é **100% borda + leitura**: nenhum reader novo toca `rowToAthlete`/`readClubRoster`/`types.ts`; `readClubSquad` nasce com **tipo próprio**; `readClubBrief` substitui o `readWorld`; `generateFixtures` é reuso puro. ⚠️ **Calibração honesta do selo:** `packages/player` recebe **3 módulos aditivos + 1 helper + barrel** — nenhum tipo, função ou constante existente é alterado.

---

## Critérios de aceitação

1. **Autorização cross-atleta, inviolável por construção** *(ao vivo + grep)*: o token de A com `?athleteId=<de B>`, header `X-Athlete-Id: <de B>` e o id de B no corpo devolve **sempre** o `BandState` de **A**, ignorando os parâmetros; grep prova que **nenhuma rota lê `athleteId`/`accountId` de path, query ou body**. Flipa `sdd.md:155` *(o patch P6 correspondente é entregável da SPEC-037)*. **E** `/v1/band` sem header, com header malformado, com token inexistente e com token expirado → **401** nos quatro, e um espião prova que **`readBandState` nunca rodou**.
2. **`readBandState` completo e degradado** *(ao vivo)*: mundo semeado + humano em tier-4 + treino + compra + lesão ativa + decisões pendentes → todo campo do Contrato bate com sua fonte, incl. `squad.length === 16`, exatamente **um** `isMe`, `isHuman` cruzado com `readOccupationsByClub`, `injury.daysLeft ≥ 0`, `club.kit` determinístico e `home.lifestyleTier` == `readWallet`. **E** atleta sem ocupação (na fila) e seed **sem mundo semeado** (o dia 1 de produção) → **200** com `club: null`, `squad: []`, `queue` preenchido no primeiro e `null` no segundo. **Nunca 500.**
3. **`dayPhase` e os três relógios** *(puro + ao vivo)*: tabela das 24 horas com as fronteiras **11/12** e **20/21**; `dayPhase(15) === 'casa'`; teste de assinatura prova que **não depende de `roundSettled`**. **E** tick liquidado ontem + `epochMs` das 12h de hoje → `roundSettled` **`false`** (prova `slot.dayIndex`, não `dueDayIndex` — senão a faixa anunciaria "o jogo já aconteceu" às 09h). **E** decisões/lesão do dia D consultadas às **09h de D+1** → `pendingDecisions` reflete D (não 0) e `injury.daysLeft` bate com o que `advanceRecovery` usará (prova o **`tickDay`**).
4. **`markActive`** *(ao vivo)*: 3 chamadas no mesmo dia → `last_active_day` gravado **exatamente 1×** com **`resolveSlot(epochMs).dayIndex`**, incluindo uma às **09h** e outra às **16h do mesmo dia**. **E** `markActive` às 09h de D + `runVacancyPass(D)` → a vaga **não** congela. **E** stubado para lançar → a rota devolve **200** com o `BandState` íntegro. **E** vaga congelada + `GET /v1/band` → `frozen_since_day` volta a `null` (thaw).
5. **As barras são DUAS, e o contrato é só-aditivo** *(ao vivo + puro)*: sobre um `BandState` **produzido pelo agregador**, `Object.keys(state.bars).sort()` é exatamente `['forma','moral']` — ⚠️ o teste vive em `services/api/test/`, **nunca** em `packages/player` (inverteria a dependência `packages/* → services/*` e compilaria em silêncio; e `interface` não tem chaves em runtime). **E** um teste de forma sobre fixture quebra se qualquer campo for renomeado, removido ou mudar de tipo. **E** nenhuma string localizável na resposta (decisões saem como **contagem**).
6. **O balde de `/v1/band` limita** *(ao vivo)*: **31 chamadas a `/v1/band` com o mesmo token em 1 min → a 31ª é 429**, com `retryAfter` no corpo **e header `Retry-After`**.
7. **Grep-gates estruturais de `band`**: `src/band/**` **não importa** `readWorld` nem `readWorldOccupations`, e um contador sobre os dois pools fica em **≤ 24 round-trips** por `GET /v1/band`; **zero** `pg_advisory_lock` de sessão, `LISTEN`, `NOTIFY` ou `SET SESSION` no código novo — só `_xact_`/`FOR UPDATE` (`ADR-002:57`); nada fora de `src/http/`+`src/routes/` importa `node:http`; nenhuma rota lê `athleteId` de path/query/body.
8. **OPs & gates** *(o critério DURO)*: sem `any` (14); ≤50 linhas/função (15); ≤300/arquivo (16); zero regra de negócio no transporte (17) — as regras nascem em `packages/player` e `targetRoundFor` é **extraído**, não reimplementado; erros genéricos (11); **SEM migration** (nada de schema novo nesta fatia); segredos só-env (02/12); `lint`/`typecheck`/`build`/`test`/prettier verdes; **testes preservados** (a baseline de 467 do repo, mais os que a SPEC-037 acrescenta antes desta); **engine e os 4 goldens INTOCADOS (`git diff` = 0)**.

---

## Segurança

> Esta fatia herda a superfície de entrada normativa da SPEC-037 (OP-09 imposto pelo tipo, `respond.ts` como único serializador, derivação de IP, CORS, transporte, segredos em env). O que segue é **específico do `/v1/band`**.

- **Autorização por construção.** `athleteId` vem **exclusivamente** de `readActiveAthlete(session.accountId)` — **nenhum endpoint aceita identificador de ator** ⇒ `sdd.md:84` satisfeito **por construção**, não por checagem que alguém pode esquecer. O `GET /v1/band` **não tem path param, query param nem body**: não há o que validar como ator, e é essa ausência que torna o critério 1 inviolável.
- **Escrita no mundo — o limite explícito** (texto a levar literalmente para o DONE): a API **NUNCA escreve no snapshot** (`world`, `world_tier`, `league`, `club`, `athlete`, `published_round`, `season`, `tick_progress`). `markActive` escreve **duas colunas de relógio de UMA linha do overlay `world_occupation`**, selecionada por id derivado da **sessão**. Quem **decide** congelar ou reverter continua sendo o motor. **A sessão nunca vira posse de vaga** — o sinal é a *leitura da faixa*, não a existência do token: uma sessão viva e ociosa congela normalmente. Isso **resolve** o `[SUPOSIÇÃO]` de `functional-spec.md:20` (P7) em vez de contorná-lo.
- **i18n (`sdd.md:47`):** nada localizável sai da API. `pendingDecisions` é **contagem**, não prosa; `code` de erro é chave estável e não-localizável; o cliente traduz.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Contrato errado descoberto com o WPF já escrito** — o mais caro | `/v1` + política **aditiva-only** + teste de forma (critério 5): campo que faltou **entra sem quebrar**. O irrecuperável é tipo errado ⇒ `null`="não se aplica"; `trainedToday`, `minClientVersion` e `shirtNumber` **omitidos, não fingidos**. ✅ A inversão de ordem ajuda: o card 3 cresce o payload **antes** de existir cliente distribuído. |
| **O card do NÚMERO DA CAMISA atrasar** | Dependência **DURA declarada**. Entra **aditivamente** e nada nesta fatia nem no card 3 depende dele. ⚠️ **Não se resolve sozinho** — precisa virar card **agora**, junto do re-shape. |
| **`isHuman` no roster regeneraria os goldens** | `readClubSquad` nasce com **tipo próprio**; `rowToAthlete`/`readClubRoster`/`types.ts` intocados. `git diff` = 0. |
| **`readWorld` no caminho quente** — alguém "simplifica" e a faixa puxa 1.280 atletas por poll | `readClubBrief` existe exatamente para isso; contador ≤24 **+ grep** (critério 7). |
| **`/v1/band` em loop satura os pools** (20 conexões, ~22 round-trips/chamada) | Balde de 30/min por `accountId`. A política de 1×/60s do cliente é **cooperação** — promessa de um binário na máquina do jogador, nunca o controle. |
| **`/v1/band` bloqueia durante a viragem** | Nomeado e deferido: é leitura (zero corrupção); `connectionTimeoutMillis: 10_000` limita a espera. `SET SESSION` proibido sob o pooler ⇒ card próprio. |

⚠️ **Linha de corte pré-aprovada** (registrada nos Riscos da SPEC-037): atinge itens **desta** fatia, nesta ordem — (1) `markActive` + P10; (2) `queue`; (3) `athlete.appearance`. **`club.todayMatch` NÃO se corta** (é o único conteúdo da véspera), nem as duas barras, `phase` ou `squad`.

**Dependência DURA:** **SPEC-037 — Camada HTTP e sessão.** Esta SPEC **consome** o `createApiServer`, o middleware `AuthedHandler` e o seam `RouteCtx` que ela entrega, mais a tabela `player.session` da migration `0010` (de onde sai o `accountId` → `readActiveAthlete` → `athleteId`) e o `respond.ts`/`rate-limit.ts` que ela cria. **Não há como mergear a 038 antes da 037** — sem servidor e sem middleware de sessão não existe rota a registrar nem ator a derivar.

**Demais dependências:** SPEC-016 (`readActiveAthlete`, `readAthleteIdentity`) · 017/019 (`readAthleteProgress`) · 020 (`readOccupation`, o overlay) · 022 · 023 (**`markActive`**, `VACANCY`) · 024 (`readWallet`) · 025 (`decision`, o hash FNV) · 026 (`readInjuryState`, `injuryPhase`) · 027 (`readMood`) · 030/032 (`dueDayIndex`, `readTickCursor`) · 034 (`readQueue`) · 035 (ADR-002).

**Depende (fora desta fatia):** o **card do número da camisa** — não bloqueia esta fatia nem o card 3, mas é **pré-requisito DURO do card 4**.

**Precede:** o **card 3** (escritas de gameplay), o **card 4** (a faixa visual) e o **painel de auditoria interno (roadmap 1.5)** — o segundo consumidor natural da mesma API.

---

## Patches de docs de fundação

| # | `file:line` | De → **para** |
|---|---|---|
| **P1** | `vision-scope.md:21` | *"faixa (~110px)"* → **"faixa em 3 alturas (compacta 64px · normal 88px [padrão] · cena 110px)"**. |
| **P2** | `functional-spec.md:159` | *"screenshot da faixa em 110px"* → **"na altura cena (110px), e um par compacta/normal"** — senão o gate fica ambíguo com P1. |
| **P3** | `sdd.md:129` | duplicata do gate de P2 → **patchear junto**, senão divergem. |
| **P4** | `sdd.md:52` | acrescentar: **"o mascote é MARCA (key art, ícone, loja) — o avatar do ATLETA na faixa é composição de camadas com paleta indexada, nunca o mascote."** |
| **P7** | `functional-spec.md:20` | `[SUPOSIÇÃO]` → **RESOLVIDO**: **"a camada de sessão apenas CARIMBA atividade; o estado da vaga e o relógio de abandono continuam propriedade do motor. Sessão nunca é posse de vaga."** |
| **P10** | `roadmap.md:63` (2.1) | *"Falta: o sinal de atividade real (HTTP/sessão)"* → **entregue na SPEC-038** (`markActive` em `GET /v1/band`). |
| **P11** | `roadmap.md:80` (3.4) · `:83` (3.7) | registrar a dependência **3.4 → 0.4** e a **ordem server-first**: as escritas (3.7) **precedem** a faixa visual (3.4), que por isso já nasce acionável. |
| **P12** | `functional-spec.md:77` | ⚠️ a linha rotula *"13-15h pré-jogo"*, o que jogaria essas horas em `vespera`. Acrescentar, **sem mexer na batida** (correta como ritmo de CONTEÚDO): **"as três cenas da faixa são faixas horárias — manhã · 12-21h · ≥21h — e NÃO mapeiam 1:1 nos beats: o pré-jogo das 13-15h e o JOGO das 15h acontecem dentro da cena `casa`; `vespera` é a cena da noite. O momento do jogo é distinguido por `roundSettled` + `todayMatch`, nunca por uma quarta cena."** |

*(P5, P5b, P6, P8, P9, D1 e D2/D3 são entregáveis da SPEC-037.)*

---

## Notas de implementação

- **⚠️ Guardrail em `packages/*`** — por isso `dayPhase` recebe `hour` **já resolvido** (a borda chama `resolveSlot`) e `daysUntilRevert` recebe o limiar **injetado**. Em `services/api` o guardrail não se aplica, mas o rigor se mantém: o **único `Date.now()`** continua sendo o `main.ts` (SPEC-037); o `epochMs` chega ao agregador pelo `RouteCtx`.
- **⚠️ Os três relógios são diferentes de propósito** (ver Contrato): `slot.hour` para a fase · `slot.dayIndex` para `roundSettled` e `markActive` · `tickDay = dueDayIndex(epochMs)` para tudo que o tick carimba. `dayPhase` está **fora** dessa lista: usa `slot.hour` e nada mais.
- **⚠️ `occupation-repo.ts` tem 303 linhas físicas** — passa a OP-16 (o `max-lines` ignora branco/comentário), mas o reader novo deve nascer com folga; se apertar, nasce em `occupation-by-club.ts`.
- **⚠️ O agregador é explicitamente NÃO-ATÔMICO** — dois handles, zero transação cross-schema, snapshot eventualmente-consistente. É leitura de UI; dizer isso no cabeçalho de `band-state.ts` para que ninguém "conserte" depois.
- **⚠️ `services/*` é typecheck-only** — entra pelo **glob** do `tsconfig.typecheck.json` e **NUNCA** nas references do `tsc -b` (TS6310).
- **⚠️ `fileParallelism: false`** — as suítes dividem **um** Postgres **e o mesmo processo Node**: limpeza em ordem de FK e `reset()` do rate-limiter no `beforeEach` de toda suíte que toca `/v1/band`. A ordem canônica do `wipeAll` (`session → injury → decision → purchase → dailyLedger → athlete → account`) é detalhada na SPEC-037, que cria a tabela `session`; aqui só se respeita.
- **⚠️ Locks xact-scoped obrigatórios** (`ADR-002:57`) — a API roda no endpoint **pooled**. Vira grep-gate (critério 7).
- **Zero dep nova.**
- **Reversível:** a rota é aditiva e desligável junto com o container; **não há migration** a reverter.
- **⚠️ Ritual do board H1VE — o passo mais fácil de esquecer** (a SPEC-030 ficou **presa em `spec`** por isso): escrever o arquivo **não** publica. Rodar **`h1ve spec --from specs/SPEC-038-band-state-agregador.md`**, obter a **aprovação no próprio card**, e no fim **`h1ve done --doc`** antes do PR. "Aprovado no chat" ≠ clique no board.
- **Fecho do DONE:** "Estado atual" do `CLAUDE.md` + `roadmap.md` (**0.4 🚧→✅** — é esta SPEC que fecha o item, 2.1, 3.4/3.7) + os patches P1/P2/P3/P4/P7/P10/P11/P12 + os follow-ups (`trainedToday`, `minClientVersion`, "estou escalado hoje?", classificação da liga, `statement_timeout` na viragem, `forma`/`moral` dos colegas, i18n do `decisions.ts`) — e as **duas ações fechadas em 2026-07-20**: **(1) abrir o card do NÚMERO DA CAMISA** (⚠️ antes do card 4) e **(2) a DEVOLUTIVA AO DESIGNER** (os relógios dos mockups 01 e 02 + ⚠️ **a causa raiz: o `readme` do design system afirma cadência Ter/Qui/Sáb, falsa desde o R4 FINAL** — sem corrigi-lo os próximos mockups nascem com o mesmo drift; **a arte está certa e é aproveitável inteira**).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (card 2 de 4; servidor/auth na SPEC-037; escritas de gameplay, faixa visual e número da camisa fora)
- [x] Arquivos listados corretos (verificados no repo, com linhas)
- [x] **Sem mudança de schema** — nenhuma migration nesta fatia (OP-01 não acionada)
- [x] Critérios testáveis (8, incl. grep-gates e o selo de goldens)
- [x] Riscos e dependências avaliados (**dependência DURA da SPEC-037**)
- [x] Decisões co-desenhadas registradas (todas de 2026-07-20)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-038 — método H1VE. O **card 2 de 4** de "Faixa: a vida no CT": o agregador que monta o dia inteiro do atleta numa chamada só, e a rota que o serve sobre o servidor da SPEC-037. A decisão central é **autorização por CONSTRUÇÃO** — `GET /v1/band` não aceita identificador nenhum; o `athleteId` só vem da sessão. Os trade-offs aceitos: o contrato congela em `/v1` antes de existir cliente (pago com política aditiva-only e `null` = "não se aplica"), e o número da camisa fica para um card próprio. **SEM MIGRATION. Engine e os 4 goldens INTOCADOS**: a fatia é 100% borda e leitura.*
