# SPEC-034 — Entrada imediata (solo) + waiting-list (Fatia 1)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-034 |
| **Feature** | Sinal de atividade (markActive) + waiting-list que puxa a vaga — card do board |
| **Slug** | waiting-list-admissao |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | R14 / retenção-escassez (a waiting-list; continuação da SPEC-023) |
| **Appetite** | **3 a 4 dias** (o relaxamento mid-season + a fila + o teto + o passe de admissão diário + o wiring). |
| **Prioridade** | ALTA — dá dentes ao pilar "escassez via waiting list" (north-star: times com ≥3 humanos). |
| **Criada em** | 2026-07-19 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-19)

1. **O solo entra IMEDIATAMENTE** ao se cadastrar (mid-season, sem esperar a viragem) — **enquanto há vaga sob o teto**.
2. **Cap-then-queue:** um TETO de humanos solo na divisão de entrada; **cheio → fila**, drenada TODO DIA (o passe roda no tick) → a vaga liberada é herdada no dia seguinte.
3. **A admissão consome QUALQUER vaga NPC livre na divisão de entrada** (reusa `occupyNpcSlot`).
4. **`markActive` fica SEAM** (já existe, SPEC-023); o sinal real (login/sessão) é do cliente/API.

### Fatiado com o founder: a ENTRADA DE TIME é a SPEC-035 (próximo card)
O card foi fatiado em 2 PRs (decisão do founder). Esta SPEC entrega a **infra de entrada + a waiting-list SOLO**. A **entrada-de-time** vira a **SPEC-035**, com estas decisões já travadas (a registrar lá): time entra **imediato** com **≥5 amigos** (`TEAM.minToEnter`); **takeover + rebrand** — assume um clube existente na divisão de entrada e o rebranda pro nome/kit do time (herda a campanha em andamento), completando com NPCs; **fura a fila**. (O rebrand toca o snapshot do clube → merece revisão própria.)

### A entrada mid-season é SEGURA (investigada — veredito SAFE)
A guarda de gênese do `occupyNpcSlot` é **conservadora demais**: sua justificativa ("a re-simulação reescreveria rodadas publicadas") é FALSA — o `publishTarget` só publica a rodada-alvo (idempotente por `(season_id, round)`); as passadas nunca são reescritas; o `occupyNpcSlot` só muta o INPUT da simulação, não o `published_round`. A rodada em que o humano entra já reflete a força dele (`clubStrength` recomputa na leitura); cada rodada tem RNG independente → zero contaminação.
- **Trade-off ÚNICO (money-path-neutro):** a tabela da VIRAGEM re-simula com o entrante → diverge das rodadas publicadas do clube. **Mesma classe que a SPEC-029 já embarca** (`moodModulator`); quase-zero p/ solo overall-34; **prêmio/salário leem o `published_round`** → money intocado. **Follow-up recomendado (card deferido):** a viragem ler o `published_round` em vez de re-simular (cura isto + o débito da SPEC-029).
- **Escopo do relaxamento:** APENAS a entrada solo. Regen/transfer ficam gênese-gated.

---

## Objetivo

Fechar o loop da SPEC-023 + o pilar da escassez. Hoje a entrada é gênese-gated (o solo esperaria até 6 semanas) e sem teto (sem escassez), e a inatividade reverte a vaga a NPC mas ninguém herda a camisa. Esta fatia: **(a)** relaxa a entrada para **imediata** (mid-season, seguro); **(b)** põe um **teto** de humanos na divisão de entrada; **(c)** uma **fila** para quem não cabe; **(d)** um **passe de admissão diário** que puxa o próximo da fila para uma vaga NPC livre — herdando as vagas que revert/transferência liberam.

---

## Contexto e motivação (fatos verificados no repo)

- **`occupyNpcSlot` (SPEC-020, `occupation-repo.ts:40`):** ocupa a vaga do NPC mais fraco de uma posição num clube. Já tem `allowAnyTier?` (usado pelo regen). A **guarda de gênese** (`assertGenesis`, `:49`) é a única barreira à entrada mid-season → ganha um `allowMidSeason?` análogo.
- **`enterWorld` (`services/world-entry`, SPEC-020):** a costura solo `player-store → world-store`. É a entrada solo → passa `allowMidSeason: true`.
- **`markActive`/`runVacancyPass` (SPEC-023):** o `revertIfStale` DELETA a ocupação + `is_human=false` → a vaga volta a NPC (herança da fila). `markActive` = seam.
- **`transferOccupation` (SPEC-033):** a origem volta a NPC → outra fonte de vaga.
- **Os passes no scheduler (SPEC-032/033):** regen/transfer/vacancy rodam no `processDay`. A admissão é um **passe DIÁRIO** (não gênese — a entrada agora é mid-season), após o vacancy (as vagas revertidas já contam).
- **Money path intocado:** prêmio de `readRound`/`published_round` (`round-outcomes.ts`); salário `f(overall)`. Nenhum lê a tabela da viragem.
- **Migrations do world-store:** até `0007` → a próxima é **`0008`**. A fila é world-scoped ⇒ world-store.

---

## Escopo — o que está DENTRO (Fatia 1)

### A) `services/world-store` — o relaxamento + a fila + o teto
- [ ] `occupation-repo.ts`: `OccupyInput.allowMidSeason?`; `occupyNpcSlot` gateia `if (!input.allowMidSeason) await assertGenesis(...)`. **Só isso** libera a entrada mid-season. Engine/goldens intocados; sem migration p/ isto.
- [ ] Migration **`0008`** (OP-01): `waiting_list(world_seed, human_athlete_id, position, ord)` — FIFO (`ord` = chegada; PK `(world_seed, human_athlete_id)` = 1/humano).
- [ ] `waiting-repo.ts`: `enqueue`/`dequeue`/`readQueue`/`queueLength`; `countEntryHumans(seed)`; `findEntryClubWithSlot(seed, position)` (clube da entrada com vaga NPC livre na posição, determinístico). `WAITINGLIST = { entryCap }` (tunável).

### B) `services/world-entry` — admitir imediato / enfileirar + o passe diário
- [ ] `admitOrEnqueue(worldDb, playerDb, {humanAthleteId, worldSeed}, cap?)`: lê a posição do player; se `countEntryHumans < cap` E há vaga → `enterWorld` (**entra IMEDIATO**, mid-season); senão → `enqueue`. Devolve `{ admitted: boolean }`.
- [ ] `runAdmissionPass(worldDb, playerDb, seed, cap?)`: DIÁRIO — **FIFO-com-skip**: enquanto `countEntryHumans < cap` E a fila tem um colocável (vaga na posição) → `dequeue` + `enterWorld`; sem-vaga-na-posição é PULADO (segue na fila). Isolamento por candidato. Devolve `admitted`.
- [ ] `enterWorld` passa `allowMidSeason: true`.

### C) `services/scheduler` — o wiring
- [ ] `processDay`: chamar `runAdmissionPass` **todo dia liquidado** (após `runVacancyPass` → as vagas revertidas HOJE já contam). Report ganha `admitted`.

### E) Testes
Puros (a política do teto/FIFO onde couber) + ao vivo (entra imediato sob o teto MID-SEASON; enfileira ao lotar; admite diário até o teto; a vaga revertida é herdada; FIFO-com-skip; **money path intocado**; idempotência).

## Escopo — o que está FORA (fatias/cards futuros)

- **A ENTRADA DE TIME** (min-5 + takeover + rebrand + completar-NPC) — **SPEC-035** (próximo card, decisões já travadas).
- **O sinal de atividade REAL** (`markActive` via HTTP/sessão) — precisa do cliente/API.
- **A superfície HTTP/auth** da entrada (`admitOrEnqueue` é uma função que uma rota futura chama).
- **A auditoria da viragem** (ler o `published_round`) — cura a divergência mid-season + o débito da SPEC-029 (card recomendado).
- **Prioridade rica da fila**; a Pirâmide Elástica (Fatia 5); a notificação "sua vez chegou"; a calibração do `entryCap`.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `services/world-store/src/store/occupation-repo.ts` | editar — `allowMidSeason?` + gate do `assertGenesis`. |
| `services/world-store/src/migrations/0008_waiting_list.sql` (+ meta) | criar (OP-01). |
| `services/world-store/src/schema/waiting-list.ts` · `store/waiting-repo.ts` · `index.ts` | criar/editar. |
| `services/world-entry/src/*` (+ barrel) | criar/editar — `admitOrEnqueue` + `runAdmissionPass` + `enterWorld` (allowMidSeason). |
| `services/scheduler/src/daily-tick.ts` | editar — wire `runAdmissionPass` diário + report `admitted`. |
| `services/*/test/*` | criar/editar. |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — R14 (fatia) + flip SPEC-033 → PR #36. |
| `specs/SPEC-034-*.md`, `specs/DONE-034-*.md` | criar. |

**Intocado (o critério DURO):** `packages/world-engine` e os **4 goldens** (`git diff` = 0). A waiting-list é 100% borda; o relaxamento é uma flag na borda.

---

## Critérios de aceitação

1. **Entrada IMEDIATA mid-season:** sob o teto, um solo entra no MESMO tick, com a temporada em andamento (rodada publicada) — `occupyNpcSlot` com `allowMidSeason` NÃO barra. A rodada seguinte reflete o humano. Ao vivo.
2. **O teto enfileira:** com a divisão no `entryCap`, um novo solo vai para a `waiting_list`. Ao vivo.
3. **A admissão diária:** `runAdmissionPass` admite da fila até o teto (FIFO), todo dia. Ao vivo.
4. **A vaga liberada é HERDADA:** um humano revertido (SPEC-023) baixa a contagem → o passe do dia admite o próximo. Ao vivo.
5. **FIFO-com-skip:** a frente sem vaga na posição é PULADA; o de trás com vaga entra. Ao vivo.
6. **Money path intocado:** o prêmio de um entrante segue do `published_round`; a viragem não crasha (imune, sobrevive). Ao vivo.
7. **Idempotência:** rodar o passe 2× não admite em dobro (1/humano; `dequeue` ao admitir). Ao vivo.
8. **OPs & goldens:** sem `any` (14); ≤50/função (15); ≤300/arquivo (16); regra na borda (17); migration (01); erros genéricos (11); verdes; **engine + 4 goldens intocados** (`git diff` = 0).

---

## Segurança

- **Publish/replay:** o relaxamento NÃO reescreve rodada publicada (idempotência + publish-só-do-alvo); só muta o input futuro. Provado na investigação.
- **Trade-off da viragem:** money-path-neutro, quase-zero p/ solo, mesma classe da SPEC-029. Curável pela auditoria (deferida).
- **Escopo do relaxamento:** só a entrada solo; regen/transfer gênese-gated.
- **Concorrência:** o `occupyNpcSlot` já serializa a vaga (FOR UPDATE); a fila é FIFO por `ord`.
- **Autoridade server-side:** o teto/admissão no servidor; a posição lida do player.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Divergência da tabela de viragem** | Money-path-neutro; quase-zero p/ solo; classe SPEC-029; curável pela auditoria (deferida). |
| **Inclusão retroativa num deferred-retry** (só em outage) | Aceito/deferido à auditoria (cosmético + prêmio bounded; só num outage multi-dia). |
| **Head-of-line blocking** | FIFO-com-skip. |
| **Corrida fila×revert×transfer** | Ordem no `processDay` (vacancy → regen → transfer → admissão) + re-checagem de `countEntryHumans`; `occupyNpcSlot` serializa. |
| **Entrar em dobro** | PK `(world_seed, human_athlete_id)` na fila; `dequeue` ao admitir; índice único de ocupação. |
| **Relaxar demais (regen/transfer)** | `allowMidSeason` só na entrada solo; regen/transfer não passam. |

**Dependências:** SPEC-020 (`occupyNpcSlot`/`enterWorld` + a guarda), SPEC-023 (o revert que libera), SPEC-032/033 (os passes no scheduler), SPEC-029 (o precedente do trade-off). **Precede:** a SPEC-035 (entrada de time); o HTTP/auth; a auditoria da viragem; a Pirâmide Elástica.

---

## Notas de implementação

- **A investigação (workflow) provou o relaxamento SAFE:** a guarda de gênese não protege o publish (idempotente); só a tabela da viragem diverge (classe SPEC-029). O `moodModulator` é a prova-de-existência de um efeito humano que já diverge da re-sim.
- **O molde é o regen/transfer:** um passe reusando um primitivo de ocupação (`enterWorld`/`occupyNpcSlot`), isolado por candidato — mas AGORA diário (não gênese), porque a entrada é mid-season.
- **O teto governa a FILA de solo** (a entrada de time = SPEC-035).
- **Fecho do DONE:** "Estado atual" (SPEC-034, flip SPEC-033 → PR #36) + `roadmap.md` (R14) + registrar a **SPEC-035 (entrada de time)** e o **card de auditoria da viragem** como follow-ups.

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (relaxamento + waiting-list SOLO; entrada de TIME = SPEC-035; HTTP/auditoria/expansão fora)
- [x] Arquivos listados corretos (verificados no repo, com seams)
- [x] Mudança de schema COM migration (`0008_waiting_list`, OP-01)
- [x] Critérios testáveis (entrada imediata mid-season, teto, admissão, herança, FIFO-skip, money-path, idempotência)
- [x] Riscos avaliados (divergência da viragem, deferred-retro, head-of-line, corrida, dobro, escopo do relaxamento)
- [x] Decisões co-desenhadas registradas (entrada imediata, cap-then-queue, qualquer vaga NPC, markActive seam; time fatiado p/ SPEC-035) + a investigação SAFE
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-034 — método H1VE. A entrada SOLO é IMEDIATA (mid-season) — a guarda de gênese era conservadora demais (o publish é idempotente; só muta o input futuro; a investigação provou SAFE). O mundo ganha um TETO de humanos na divisão de entrada; cheio, o solo entra na fila; o passe de admissão DIÁRIO puxa o próximo até o teto, herdando as vagas que a inatividade/transferência liberam. A entrada de TIME (takeover + rebrand) é a SPEC-035. Money path intocado; o único trade-off (a tabela da viragem diverge) é da classe SPEC-029 e curável pela auditoria futura. Engine e os 4 goldens intocados.*
