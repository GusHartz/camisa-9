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
| **Aprovada em** | *(preencher na aprovação do card)* |
| **Aprovada por** | *(preencher na aprovação do card)* |
| **Status** | **PROPOSTA — aguardando aprovação do founder.** ⚠️ **Dependência DURA: a SPEC-037 precisa estar mergeada** (esta SPEC consome `createApiServer`, os middlewares `requireSession`/`requireAthlete` e o tipo `AuthedHandler` e o seam `RouteCtx` que ela entrega). |

O card original de "Faixa: a vida no CT" virou **4 cards** (1 = SPEC-037 o servidor; 2 = esta SPEC, a rota + o agregador; 3 = escritas de gameplay/3.7; 4 = a faixa visual/3.4 — o detalhe está no cabeçalho de Dependências). A ordem segue `roadmap.md:149` (*"server-first — a UI só apresenta o que o motor já garante"*) ⇒ **a cláusula "a faixa é read-only por construção" morre**.

---

## Decisões travadas com o founder (2026-07-20)

0. **Esta SPEC depende da SPEC-037 — dependência DURA, não convenção.** O `GET /v1/band` é registrado no `src/router.ts`, servido pelo `createApiServer` e protegido pelos middlewares `requireSession`/`requireAthlete` e o tipo `AuthedHandler`, os três **entregues pela SPEC-037**; o `athleteId` do agregador vem de `readActiveAthlete(session.accountId)`, e a sessão é a tabela `player.session` da migration `0010`. **Não há como mergear a 038 antes da 037** — sem o servidor e sem o middleware de sessão, esta fatia não tem onde se plugar nem de onde tirar o ator.

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
- **Infra herdada (vale para as duas fatias):** `services/*` é **typecheck-only** (glob), **nunca** em `tsc -b` (TS6310); `paths` e `alias` são **listas explícitas**; `vitest` roda `fileParallelism:false`; **todos os locks em `services/**` são `_xact_`** (`ADR-002:57` — a API roda no endpoint **pooled**); `client.ts:47` dá **10 conexões por pool**; a API sobe **um** pool hoje (10) e passa a **dois (20)** quando o handle do world-store entrar. A `session` cai por **ON DELETE CASCADE** ao apagar `account` (`schema/session.ts:17`); limpá-la explicitamente no `wipeAll` é **higiene de isolamento entre suítes** (`fileParallelism:false`), **não** uma FK que quebra o teste — nenhuma suíte vai falhar como aviso, e é por isso que a afirmação errada da 037 sobreviveu tanto tempo.

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
- [ ] `src/routes/band.ts` — o handler `(ctx, athleteId, accountId)`, registrado via `requireAthlete` (`auth/require.ts:27`, já existente); o tipo `AuthedHandler` é da SPEC-037.
- [ ] `src/band/` — `types.ts` (**o CONTRATO**) · `band-state.ts` (as 2 ondas) · `from-player.ts` · `from-world.ts`.
- [ ] `src/router.ts` — **editar**: acrescentar a entrada `'GET /v1/band': requireAthlete(deps.db, band(deps))` à **tabela de rotas** de `createRoutes` (`router.ts:42`), **e estender o `limitByIp`** (`router.ts:32-52`) para cobrir `/v1/band` além de `/v1/auth/*` — o teto de IP **pré-auth** (decisão do founder; ver Riscos). O balde por `accountId` fica dentro do handler.
- [ ] `src/http/rate-limit.ts` fica **INTOCADO** (genérico por chave; só o `reset()` é reusado nos testes). São **dois baldes em camada** no `/v1/band`: **(a) IP** via o `limitByIp` estendido do router (pré-auth, barato); **(b) `accountId`** DENTRO de `routes/band.ts`, após `requireAthlete` (`const r = hit(`band:acct:${accountId}`, 30, ctx.epochMs); if (!r.allowed) return rateLimited(r.retryAfterSec);`) — o `accountId` só existe pós-sessão, por isso não pode viver no router. Constante `BAND_ACCOUNT_LIMIT = 30` em `band.ts`. Da SPEC-037 vêm o `hit`/`reset()` genéricos e o `limitByIp` (`router.ts:17,32`).

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
| `athlete.id` | `string` | do `SessionCtx` (já resolvido por `resolveSession` · `session.ts:65`) — **não** re-chamar `readActiveAthlete` | player |
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
| `club.todayMatch` | `BandMatch \| null` | **PRÉ-JOGO:** `generateFixtures(ids.map((id) => ({ id, name: id, strength: 0 })))` (só `c.id` é consumido, `fixtures.ts:11`) e então `.find((f) => f.round === round && (f.homeId === clubId || f.awayId === clubId))`. ⚠️ o retorno é um array PLANO de 380 fixtures — **nunca** indexar por `[round−1]`. **PÓS-JOGO:** `readRound` preenche o **placar**. ⚠️ `readRound` sozinho **não serve** — rodada não jogada não existe em `published_round` ⇒ `todayMatch` seria `null` durante toda a véspera, a única fase em que o campo tem razão de existir | world |
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

**`worldSeed` — de `ApiDeps`, nunca do request:** todos os readers do world-store (`readClubBrief`, `readClubSquad`, `readOccupation`, `readTickCursor`, `readQueue`, `markActive`) exigem a seed; ela vem de `ApiDeps` (env `WORLD_SEED`), **NUNCA** do cliente.

**Custo de I/O:** duas ondas (`Promise.all` em cada; a onda 2 depende de `clubId`/`dayIndex`). O `resolveSession` do middleware emite **3 queries** no pool do player ANTES do handler (`readSessionByHash` + `touchSession` + `readActiveAthlete` · `session.ts:54-67`). **Teto por request: ≤ 28 round-trips** (as 3 do middleware + onda 1 = 11 · onda 2 = 7 · `markActive` = 4 = **25** na 1ª chamada do dia; **21** da 2ª em diante, sem o `markActive`), p95 < 150 ms; inclui BEGIN/COMMIT das transações só-leitura de `readWallet` e do `markActive`. ⚠️ **Como contar:** interceptar `pool.query` **E** `pool.connect` (o `client.query` das transações) nos DOIS pools — contar só `pool.query` subconta `readWallet` e `markActive`. ⚠️ **Anti-requisito elevado a critério:** `readBandState` **NUNCA** chama `readWorld`, `readWorldOccupations` nem `readClubRoster` (a defesa do risco de PAYLOAD é o **grep-gate**, não o contador — um reader gordo com 1 query passaria no contador).

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
| `services/api/src/routes/band.ts` | criar — o handler `(ctx, athleteId, accountId)` **registrado via `requireAthlete(deps.db, band(deps))` (`auth/require.ts:27`, já existente)**; o `409 no_active_athlete` é do middleware, não do handler. |
| `services/api/src/band/{types,band-state,from-player,from-world}.ts` | criar — o CONTRATO + o agregador (2 ondas) + os dois lados. |
| `services/api/package.json` | editar — +dependência `@camisa-9/world-store`. |
| `services/api/src/server.ts` | editar — `ApiDeps` ganha `readonly worldDb: WorldDb` e `readonly worldSeed: string`, repassados a `createRoutes(deps)`. |
| `services/api/src/main.ts` | editar — segundo `createDb` (world-store); `WORLD_SEED` obrigatória junto de `DATABASE_URL` (falha rápido); `pool.end()` dos DOIS pools no shutdown. |
| `services/api/src/router.ts` · `src/index.ts` | editar — a entrada `'GET /v1/band'` na **tabela de rotas** + `createRoutes(deps)` (não `createRoutes(db)`) · barrel. ⚠️ `src/http/rate-limit.ts` fica **INTOCADO** — o 3º balde (`accountId` 30/min) nasce dentro de `routes/band.ts`. (arquivos nascem na SPEC-037). |
| `services/api/test/{band-state,server-band}.test.ts` | criar — agregador **sem servidor** + a rota em `listen(0)`. **O teste das chaves de `BandBars` vive em `band-state.test.ts`.** |
| `docs/projeto/{sdd,functional-spec,vision-scope,roadmap}.md` | editar — os patches P1, P2, P3, P4, P7, P10, P11, P12. |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — **0.4 🚧→✅** (é esta SPEC que fecha o item; a SPEC-037 só o marca 🚧) + 2.1 + 3.4/3.7 + "Estado atual". |
| `specs/SPEC-038-band-state-agregador.md`, `specs/DONE-038-band-state-agregador.md` | criar. |

**Intocado (o critério DURO):** **`packages/world-engine` inteiro e os 4 goldens** (`git diff` = **0**), incl. `world-expansion.golden.json`. A fatia é **100% borda + leitura**: nenhum reader novo toca `rowToAthlete`/`readClubRoster`/`types.ts`; `readClubSquad` nasce com **tipo próprio**; `readClubBrief` substitui o `readWorld`; `generateFixtures` é reuso puro. ⚠️ **Calibração honesta do selo:** `packages/player` recebe **3 módulos aditivos + 1 helper + barrel** — nenhum tipo, função ou constante existente é alterado.

---

## Mudanças de schema

**Nenhuma. SEM MIGRATION** (OP-01 não é acionada): o `appearance` sai de coluna jsonb existente (`schema/athlete.ts:29`), o `isHuman` de coluna existente (`is_human`), o kit e as fases de funções puras novas, e nenhum reader novo cria tabela, coluna ou índice. O world-store (`0008`) e o player-store (`0010`, criado pela SPEC-037) ficam **intocados** por esta fatia.

---

## Mudanças de API

Erro **sempre** `{ error, code }` — `code` é a chave **estável e não-localizável** (o cliente roteia e traduz por ela); `error` é frase genérica. **Nunca** stack, SQL ou detalhe interno (OP-11). O serializador único (`http/respond.ts`) e o `no-store` por default vêm da SPEC-037.

```
GET /v1/band                 ⚠️ NENHUM identificador em path, query ou body
  200  BandState                                               + Cache-Control: no-store
  401  unauthorized · 409 no_active_athlete · 500 internal
  429  rate_limited + retryAfter + header `Retry-After`
  Efeito colateral declarado: markActive best-effort.
```

**Rate limit em DUAS camadas** (`sdd.md:100`), janela fixa **in-process**: **(a) por IP** — o `limitByIp` do router estendido a `/v1/band` (pré-auth, contra flood de token inválido); **(b) por `accountId` (30/min)** dentro do handler — teto duro contra loop autenticado (um token válido em loop satura os 20 slots de pool e derrubaria a faixa de todos; a política de 1×/60s do cliente é **cooperação**, nunca o controle). Ver a decisão do teto pré-auth em Riscos. ⚠️ Com `fileParallelism:false` o `Map` é **estado de módulo compartilhado entre suítes** ⇒ o `reset()` do limitador (SPEC-037) é chamado no `beforeEach` de toda suíte que toca `/v1/band`.

**`markActive` — em `GET /v1/band`, não no login:** o seam da SPEC-023 mede **presença**, não sessão viva (no login o sinal mentiria nos dois sentidos). **A faixa aberta É o sinal.** Três armadilhas: **(1)** o dia é **`resolveSlot(epochMs).dayIndex`**, ⚠️ **não `dueDayIndex`** — antes das 15h este é *ontem*, e o `runVacancyPass` (`vacancy-repo.ts:94`) leria `inactive=1` e **congelaria quem abriu a faixa de manhã**, disparando o e-mail "segurando sua camisa" contra um presente; **(2) throttle grátis** — o agregador já leu a ocupação ⇒ `if (club.lastActiveDay !== day)` reduz a **1 escrita/dia/jogador** (senão o `FOR UPDATE` de todo poll serializaria contra o `runVacancyPass`); **(3) isolamento** — try/catch + log genérico: um relógio de vacância que falha não devolve 500 na faixa.

---

## Critérios de aceitação

1. **Autorização cross-atleta, inviolável por construção** *(ao vivo + grep)*: o token de A com `?athleteId=<de B>`, header `X-Athlete-Id: <de B>` e o id de B no corpo devolve **sempre** o `BandState` de **A**, ignorando os parâmetros; grep prova que **nenhuma rota lê `athleteId`/`accountId` de path, query ou body** (`router.ts:6-7`). Flipa `sdd.md:155` *(o patch P6 correspondente é entregável da SPEC-037)*. **E** `/v1/band` sem header → **401** (a matriz dos quatro 401 já está cravada na SPEC-037, `server-auth.test.ts:118`): o único que a 038 pode quebrar é **esquecer de embrulhar a rota** — o caso prova que `GET /v1/band` está registrado embrulhado em `requireAthlete`, não cru na tabela (`router.ts:42`).
2. **Conta mid-regen → 409** *(ao vivo)*: conta com sessão viva e SEM atleta ativo (mid-regen, SPEC-022) → `GET /v1/band` devolve **409 `no_active_athlete`**, e um espião prova que **`readBandState` nunca rodou** (nenhuma query dos dois bancos emitida) — prova que a rota está embrulhada em `requireAthlete`, não registrada crua na tabela.
3. **`readBandState` completo e degradado** *(ao vivo)*: mundo semeado + humano em tier-4 + treino + compra + lesão ativa + decisões pendentes → todo campo do Contrato bate com sua fonte, incl. `squad.length === 16`, exatamente **um** `isMe`, `isHuman` cruzado com `readOccupationsByClub`, `injury.daysLeft ≥ 0`, `club.kit` determinístico e `home.lifestyleTier` == `readWallet`. **E** atleta sem ocupação (na fila) e seed **sem mundo semeado** (o dia 1 de produção) → **200** com `club: null`, `squad: []`, `queue` preenchido no primeiro e `null` no segundo. **Nunca 500.**
4. **`dayPhase` e os três relógios** *(puro + ao vivo)*: tabela das 24 horas com as fronteiras **11/12** e **20/21**; `dayPhase(15) === 'casa'`; teste de assinatura prova que **não depende de `roundSettled`**. **E** tick liquidado ontem + `epochMs` das 12h de hoje → `roundSettled` **`false`** (prova `slot.dayIndex`, não `dueDayIndex` — senão a faixa anunciaria "o jogo já aconteceu" às 09h). **E** decisões/lesão do dia D consultadas às **09h de D+1** → `pendingDecisions` reflete D (não 0) e `injury.daysLeft` bate com o que `advanceRecovery` usará (prova o **`tickDay`**).
5. **`markActive` — o throttle é contado, não inferido** *(ao vivo)*: 3 `GET /v1/band` no mesmo dia → `vi.spyOn` em `markActive` prova `toHaveBeenCalledTimes(1)` (⚠️ o `markActive` é um UPDATE **incondicional** `vacancy-repo.ts:46` — ler `last_active_day` após as 3 chamadas passaria **com ou sem** o throttle; só contar a ESCRITA falha com o defeito presente), gravado com **`resolveSlot(epochMs).dayIndex`**, com uma chamada às **09h** e outra às **16h do mesmo dia**. **E** `markActive` às 09h de D + `runVacancyPass(D)` → a vaga **não** congela. **E** stubado para lançar → a rota devolve **200** com o `BandState` íntegro. **E** vaga congelada + `GET /v1/band` → `frozen_since_day` volta a `null` (thaw).
6. **As barras são DUAS, e o contrato é só-aditivo** *(ao vivo + puro)*: sobre um `BandState` **produzido pelo agregador**, `Object.keys(state.bars).sort()` é exatamente `['forma','moral']` — ⚠️ o teste vive em `services/api/test/`, **nunca** em `packages/player` (inverteria a dependência `packages/* → services/*` e compilaria em silêncio; e `interface` não tem chaves em runtime). **E** um teste de forma percorre uma tabela literal **`V1_SHAPE`** (cada campo do contrato → seu `typeof` esperado, com `|null` explícito) assertando **presença + tipo**, **SEM** assertar ausência de chaves extras (um `toEqual`/snapshot do fixture inteiro quebraria também num campo **acrescentado** — que a política aditiva-only declara legal, ex.: o `trainedToday` do card 3); a igualdade exata só vale para `bars`, onde um `folego` acrescentado **deve** falhar. **E** nenhuma string localizável na resposta (decisões saem como **contagem**).
7. **O `/v1/band` limita em DUAS camadas** *(ao vivo)*: **(a) por `accountId`** — 31 chamadas com o mesmo token em 1 min → a 31ª é **429** (`retryAfter` no corpo **e** header `Retry-After`); ⚠️ **discriminantes (um balde por IP passaria idêntico):** DUAS contas do **mesmo IP** — depois de A esgotar as 30, a **1ª** chamada de B é **200**; MESMA conta de **dois IPs** → a 31ª ainda é **429** (prova que a chave é o `accountId`, não o IP — dois jogadores atrás do mesmo NAT não se derrubam). **(b) por IP, ANTES da auth** — N+1 chamadas a `/v1/band` com token **inválido** do mesmo IP → **429**, e um espião prova que **`readSessionByHash` NÃO foi consultado** na chamada limitada (o teto morde antes de tocar o banco; decisão do founder — ver Riscos).
8. **Grep-gates estruturais de `band`**: `src/band/**` **não importa** `readWorld`, `readWorldOccupations` nem `readClubRoster`, e um contador que intercepta `pool.query` **E** `pool.connect` sobre os dois pools fica em **≤ 28 round-trips por request** (contado nas 1ª **e** 2ª chamadas do dia, senão a folga engole o defeito); **zero** `pg_advisory_lock` de sessão, `LISTEN`, `NOTIFY` ou `SET SESSION` no código novo — só `_xact_`/`FOR UPDATE` (`ADR-002:57`); só `src/server.ts`, `src/http/client-ip.ts` e `src/http/respond.ts` (os dois últimos type-only) importam `node:http`, **nada** em `src/band/` ou `src/routes/` o importa; nenhuma rota lê `athleteId` de path/query/body.
9. **OPs & gates** *(o critério DURO)*: sem `any` (14); ≤50 linhas/função (15); ≤300/arquivo (16); zero regra de negócio no transporte (17) — as regras nascem em `packages/player` e `targetRoundFor` é **extraído**, não reimplementado; erros genéricos (11); **SEM migration** (nada de schema novo nesta fatia); segredos só-env (02/12) — incl. a nova env **`WORLD_SEED`** (`main.ts`, falha rápido junto de `DATABASE_URL`); o segundo handle do world-store fiado por `ApiDeps` (`+dependência @camisa-9/world-store` no `package.json`, `worldDb`/`worldSeed` no `server.ts`, `createRoutes(deps)` no `router.ts`); `lint`/`typecheck`/`build`/`test`/prettier verdes; **testes preservados** (baseline **540** — 529 pós-SPEC-037 + 11 da SPEC-039; conferir `npm test` em `main` no início da fatia e usar esse número); **engine e os 4 goldens INTOCADOS (`git diff` = 0)**.

---

## Segurança

> Esta fatia herda a superfície de entrada normativa da SPEC-037 (OP-09 imposto pelo tipo, `respond.ts` como único serializador, derivação de IP, CORS, transporte, segredos em env). O que segue é **específico do `/v1/band`**.

- **Autorização por construção.** `athleteId` vem **exclusivamente** de `readActiveAthlete(session.accountId)` — **nenhum endpoint aceita identificador de ator** ⇒ `sdd.md:84` satisfeito **por construção**, não por checagem que alguém pode esquecer. O `GET /v1/band` **não tem path param, query param nem body**: não há o que validar como ator, e é essa ausência que torna o critério 1 inviolável.
- **Escrita no mundo — o limite explícito** (texto a levar literalmente para o DONE): a API **NUNCA escreve no snapshot** (`world`, `world_tier`, `league`, `club`, `athlete`, `published_round`, `season`, `tick_progress`). `markActive` escreve **duas colunas de relógio de UMA linha do overlay `world_occupation`**, selecionada por id derivado da **sessão**. Quem **decide** congelar ou reverter continua sendo o motor. **A sessão nunca vira posse de vaga** — o sinal é a *leitura da faixa*, não a existência do token: uma sessão viva e ociosa congela normalmente. Isso **resolve** o `[SUPOSIÇÃO]` de `functional-spec.md:20` (P7) em vez de contorná-lo.
- **i18n (`sdd.md:47`):** nada localizável sai da API. `pendingDecisions` é **contagem**, não prosa; `code` de erro é chave estável e não-localizável; o cliente traduz.

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| **Contrato errado descoberto com o WPF já escrito** — o mais caro | Média | `/v1` + política **aditiva-only** + teste de forma (critério 6): campo que faltou **entra sem quebrar**. O irrecuperável é tipo errado ⇒ `null`="não se aplica"; `trainedToday`, `minClientVersion` e `shirtNumber` **omitidos, não fingidos**. ✅ A inversão de ordem ajuda: o card 3 cresce o payload **antes** de existir cliente distribuído. |
| **O card do NÚMERO DA CAMISA atrasar** | Alta | Dependência **DURA declarada**. Entra **aditivamente** e nada nesta fatia nem no card 3 depende dele. ⚠️ **Não se resolve sozinho** — precisa virar card **agora**, junto do re-shape. |
| **`isHuman` no roster regeneraria os goldens** | Baixa | `readClubSquad` nasce com **tipo próprio**; `rowToAthlete`/`readClubRoster`/`types.ts` intocados. `git diff` = 0. |
| **`readWorld` no caminho quente** — alguém "simplifica" e a faixa puxa 1.280 atletas por poll | Média | `readClubBrief` existe exatamente para isso; grep-gate (`readWorld`/`readWorldOccupations`/`readClubRoster`) + contador ≤28 (critério 8). |
| **`/v1/band` em loop satura os pools** (dois pools = 20 conexões, ~25 round-trips na 1ª chamada do dia) | Média | Dois baldes: IP (pré-auth) + 30/min por `accountId`. A política de 1×/60s do cliente é **cooperação** — promessa de um binário na máquina do jogador, nunca o controle. |
| **`/v1/band` bloqueia durante a viragem** | Baixa | Nomeado e deferido: é leitura (zero corrupção); `connectionTimeoutMillis: 10_000` limita a espera. `SET SESSION` proibido sob o pooler ⇒ card próprio. |

### Teto pré-autenticação — decidido (founder, 2026-07-20)

Sem endurecimento, o `GET /v1/band` nasceria **sem teto de IP antes da autenticação**: o balde de `accountId` é pós-`resolveSession`, então um flood de `Authorization: Bearer <lixo>` do mesmo IP pagaria **um `readSessionByHash` por request** (`session.ts:62`) sem passar por balde nenhum — a mesma classe de furo que a revisão da SPEC-037 fechou no `logout` ("nasceu sem teto"). **Decisão: endurecer.** O `limitByIp` do router (`router.ts:32-52`) passa a cobrir **`/v1/band` além de `/v1/auth/*`** (mesmo teto de IP), e o balde por `accountId` continua dentro do handler. São **dois baldes em camada**: IP barato e pré-auth contra flood anônimo, `accountId` pós-sessão contra loop autenticado. Cravado pelo critério 8b.

⚠️ **Linha de corte pré-aprovada** (registrada nos Riscos da SPEC-037): atinge itens **desta** fatia, nesta ordem — (1) `markActive` + P10; (2) `queue`; (3) `athlete.appearance`. **`club.todayMatch` NÃO se corta** (é o único conteúdo da véspera), nem as duas barras, `phase` ou `squad`.

**Dependência DURA:** **SPEC-037 — Camada HTTP e sessão.** Esta SPEC **consome** o `createApiServer`, os middlewares `requireSession`/`requireAthlete` e o tipo `AuthedHandler` e o seam `RouteCtx` que ela entrega, mais a tabela `player.session` da migration `0010` (de onde sai o `accountId` → `readActiveAthlete` → `athleteId`) e o `respond.ts`/`rate-limit.ts` que ela cria. **Não há como mergear a 038 antes da 037** — sem servidor e sem middleware de sessão não existe rota a registrar nem ator a derivar.

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
- **⚠️ `fileParallelism: false`** — as suítes dividem **um** Postgres **e o mesmo processo Node**: limpeza em ordem de FK e `reset()` do rate-limiter no `beforeEach` de toda suíte que toca `/v1/band`. A ordem canônica do `wipeAll` (`session → injury → decision → purchase → dailyLedger → athlete → account`) é detalhada na SPEC-037; ⚠️ a `session` cai por **ON DELETE CASCADE** ao apagar `account` (`schema/session.ts:17`) — limpá-la explicitamente é **higiene de isolamento entre suítes**, **não** uma FK que quebra o teste (é por isso que a afirmação errada da 037 sobreviveu tanto tempo).
- **⚠️ Locks xact-scoped obrigatórios** (`ADR-002:57`) — a API roda no endpoint **pooled**. Vira grep-gate (critério 8).
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
- [x] Critérios testáveis (9, incl. grep-gates e o selo de goldens)
- [x] Riscos e dependências avaliados (**dependência DURA da SPEC-037**)
- [x] Decisões co-desenhadas registradas (todas de 2026-07-20)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-038 — método H1VE. O **card 2 de 4** de "Faixa: a vida no CT": o agregador que monta o dia inteiro do atleta numa chamada só, e a rota que o serve sobre o servidor da SPEC-037. A decisão central é **autorização por CONSTRUÇÃO** — `GET /v1/band` não aceita identificador nenhum; o `athleteId` só vem da sessão. Os trade-offs aceitos: o contrato congela em `/v1` antes de existir cliente (pago com política aditiva-only e `null` = "não se aplica"), e o número da camisa fica para um card próprio. **SEM MIGRATION. Engine e os 4 goldens INTOCADOS**: a fatia é 100% borda e leitura.*
