# SPEC-026 — Lesões narrativas (o arco)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-026 |
| **Feature** | Lesões narrativas — card do board (`03a8d1de`) |
| **Slug** | lesoes-narrativas |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.5 (Lesões narrativas com arco) |
| **Appetite** | **2 a 3 dias** (o arco: lib pura + player-store; sem cross-schema, sem tocar o engine). |
| **Prioridade** | BAIXA — narrativa/cor; conecta ao motor de decisões (SPEC-025). |
| **Criada em** | 2026-07-17 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-17)

1. **Ocorrência = SEAM (fatiamos).** O founder quer a lesão vindo de um **evento de partida** — mas isso exige o engine emitir eventos (money path / golden). **Fatiamos:** esta fatia entrega o **ARCO** (contusão → recuperação → volta por cima); a **ocorrência** é um seam (`injureFromMatch` — a **partida rica**, quando existir [card próprio 1.1/3.2], injeta a lesão; nos testes, é chamada direto). **Engine e golden INTOCADOS.**
2. **"Geram decisões" = reusa o motor da SPEC-025.** Uma lesão ativa liga o estado **`injured`** no `DecisionContext` (via seam/param, molde do `age`) → um template **`lesao-volta`** ("forçar a volta [arrisca recaída] vs. respeitar o prazo") aparece nas decisões do dia. Reusa o motor + o log; o **efeito da escolha na lesão** (encurtar/recair) fica **seam** (wiring futuro).
3. **Efeitos = SEAM declarado.** A lesão **derruga a disponibilidade** (`available=false` enquanto ativa) e afeta a **forma** — mas isso é **dado declarado**; o **mundo/partida** lê `available` (seam) e a **2.3** aplica a forma. Esta fatia **NÃO** tira o humano da partida (cross-schema) nem constrói Forma; **nunca punição cega** — o arco + a decisão + a volta por cima é o ponto.

**Defaults do projeto:** a recuperação é um **passe diário determinístico** (`advanceRecovery`, molde do `resolveDeadline`/`runVacancyPass`); a **história** é o log da lesão (o arco). Rara: a **taxa** de ocorrência vive na partida futura (aqui a ocorrência é injetada). **Só-player-store.**

---

## Objetivo

Dar às lesões um **arco narrativo**, nunca uma punição cega: a contusão acontece (raramente, via um evento de partida futuro), o atleta **recupera** ao longo de alguns dias, e **volta por cima** — e, no meio, ela **gera uma decisão** ("forçar a volta ou respeitar o prazo?") e vira **história no perfil**. É cor e drama do Dia do Jogador — não um `−X` seco.

---

## Contexto e motivação (fatos verificados no repo)

- **O motor de decisões existe (SPEC-025):** `DecisionContext` + `generateDailyDecisions` + o catálogo aberto + `generateForDay(extra)`. O `injured` entra como o `age`: um campo opcional do contexto (seam), passado via `extra`. Um template gatilhado por `injured` reusa tudo.
- **O relógio diário existe (SPEC-015):** o `day-index` monotônico; a recuperação conta em dias (o passe roda 1×/dia).
- **A idade é do mundo (seam):** já é param no motor de decisões — o mesmo padrão para `injured`.
- **O engine é abstrato + é o money path:** `resolveMatch` é "chances × conversão"; não emite eventos. Enriquecê-lo (golden regen) é o **card 1.1/3.2** — FORA desta fatia. A ocorrência é seam.
- **Sem lesões hoje:** grep — zero `lesao`/`injury`. Sistema novo, molde SPEC-024/025 (lib pura + player-store, migration aditiva).

---

## Escopo — o que está DENTRO

**A) Lib pura `packages/player/injury.ts` (determinística, sob o guardrail):**
- [ ] `INJURY` tunável: mapa `Severity` (`leve`/`media`/`grave`) → `recoveryDays` + o bônus/flag de **volta por cima** (declarado). `Injury` = `{ severity, startedDay, recoveryDays }`.
- [ ] `recoveryDaysFor(severity)`; `injuryPhase(injury, currentDay)` → `'recuperando' | 'recuperado'` (o arco: ativa até `startedDay + recoveryDays`, depois recuperado); `isAvailable(injury | null, currentDay)` (derivado — recuperando = **indisponível**, o seam); `comebackOutcome()` (o "volta por cima" declarado).

**B) `packages/player/decisions.ts` (extensão):**
- [ ] `injured?: boolean` no `DecisionContext` (seam, molde do `age`) + o template **`lesao-volta`** (`trigger: (c) => c.injured === true`; opções: "forçar a volta" [`outcome.forceReturn`] / "respeitar o prazo" [conservadora]). Os 168+ preservados por construção (campo opcional).

**C) `services/player-store` — a lesão persistida + o arco:**
- [ ] **Migration aditiva** (schema `player`, OP-01): tabela **`injury`** (`id`, `athlete_id` FK, `severity`, `started_day` int, `recovery_days` int, `status` [`active`/`recovered`], `created_at`; **índice único parcial `(athlete_id) WHERE status='active'`** — 1 lesão ativa por atleta).
- [ ] `injury-repo.ts` (novo): `injureFromMatch(db, athleteId, day, severity)` — **o seam da ocorrência**: cria a lesão ativa (no-op se já há uma ativa); `advanceRecovery(db, athleteId, currentDay)` — o passe diário: se `currentDay ≥ started_day + recovery_days` → `status=recovered` (a **volta por cima**, gravada no log); `readInjuryState(db, athleteId)` — a lesão ativa (ou null) + `available` (derivado, o seam); `readInjuryLog(db, athleteId)` — o histórico (a **história**). Erros genéricos (OP-11).

**D) `services/player-store/decision-repo.ts` (extensão):** `generateForDay(extra: { age?, injured? })` — o `injured` entra no `DecisionContext` (seam, molde do `age`) → o template `lesao-volta` gera quando ativo. (O caller lê `readInjuryState().available` e passa `injured`.)

**E) Efeitos como seam:** `available` (a partida futura lê para tirar o humano do jogo) + a forma (a 2.3 aplica) + o `forceReturn` da decisão (o injury-repo consumirá para encurtar/recair) — todos **declarados**, não aplicados. Pontos de plugue prontos.

**F) Wiring (fora do tick puro):** a **partida rica** (card futuro) chama `injureFromMatch`; o scheduler chama `advanceRecovery` 1×/dia e passa `injured` ao `generateForDay`. Na fatia, tudo é **testado direto**.

**G) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA

- **A ocorrência real** (o engine emitir o lance que machuca + a taxa) — **card 1.1/3.2 (eventos de partida)**; aqui é seam (`injureFromMatch`).
- **Tirar o humano da partida** (aplicar `available` no mundo, cross-schema) — a partida futura lê o seam.
- **Aplicar a forma** — depende da **2.3**; seam declarado.
- **O efeito da escolha na lesão** (forçar → encurta + risco de recaída) — seam (`outcome.forceReturn` no log; wiring futuro).
- **O toast/UI** + o **jornal** ("lesão do rival") — sem cliente; seam.
- **O gatilho real** (scheduler) — fatia de deploy.

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/injury.ts` (+ `index.ts`) | criar/editar — o arco puro. |
| `packages/player/src/injury.test.ts` | criar — testes puros. |
| `packages/player/src/decisions.ts` (+ `types.ts`) | editar — `injured?` no contexto + template `lesao-volta`. |
| `services/player-store/src/schema/injury.ts` (+ barrel, drizzle.config) | criar — tabela `injury`. |
| `services/player-store/src/migrations/0006_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/player-store/src/store/injury-repo.ts` (+ `index.ts`) | criar — `injureFromMatch`/`advanceRecovery`/`readInjuryState`/`readInjuryLog`. |
| `services/player-store/src/store/decision-repo.ts` | editar — `injured` no `extra` do `generateForDay`. |
| `services/player-store/test/injury-repo.test.ts` | criar — testes ao vivo. |
| Suítes irmãs do player-store (`wipeAll`) | editar — `delete(injury)` antes de `delete(athlete)` (gotcha da tabela-filha). |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 2.5 + flip SPEC-025 → PR #28. |
| `specs/SPEC-026-*.md`, `specs/DONE-026-*.md` | criar. |

**Intocado:** `packages/world-engine` (engine puro) e **todos os goldens** (a ocorrência é seam — zero engine); o `world-store` (zero cross-schema — `available` é seam).

---

## Critérios de aceitação

1. **O arco (puro):** `recoveryDaysFor(severity)` cresce com a gravidade; `injuryPhase` = `recuperando` até `started_day + recovery_days`, `recuperado` depois; `isAvailable` = false enquanto recuperando, true sem lesão / recuperado. Testado puro.
2. **Ocorrência (seam):** `injureFromMatch(athleteId, day, severity)` cria a lesão ativa; chamar de novo com uma ativa → **no-op** (1 ativa/atleta). Testado ao vivo.
3. **Recuperação (passe):** `advanceRecovery` antes do prazo → segue ativa; no/após o prazo → `recovered` (a **volta por cima** no log). Testado ao vivo.
4. **Gera decisão (SPEC-025):** com `injured=true` no `extra`, `generateForDay` inclui `lesao-volta`; sem lesão, não. Testado ao vivo.
5. **Disponibilidade = seam:** `readInjuryState` devolve `available=false` enquanto ativa; **nenhum** estado do mundo é tocado (a partida futura lê). Testado.
6. **História:** `readInjuryLog` devolve o arco (a lesão + a volta por cima). Testado.
7. **Efeitos = seam:** a lesão/decisão **não** altera focos/saldo/forma (a aplicação é de outro sistema). Testado (focos/saldo intocados).
8. **OPs & gates:** sem `any` (OP-14); ≤50 linhas/função (OP-15); ≤300/arquivo (OP-16); erros genéricos (OP-11); migration aditiva (OP-01); regra pura na lib / IO no store (OP-17); guardrail verde; `lint`/`typecheck`/`build`/`test`/prettier verdes; **engine e os 4 goldens intocados** (`git diff` = 0); ao vivo serial + `delete(injury)` no `wipeAll` das irmãs.

---

## Segurança

- **Autoridade server-side:** a ocorrência (`injureFromMatch`), a recuperação e a disponibilidade são decididas no servidor; o cliente nunca se cura nem force uma volta fora da decisão validada.
- **OP-11:** severidade inválida / atleta inexistente → erro genérico, sem SQL/stack.
- **Atomicidade:** `injureFromMatch`/`advanceRecovery` transacionais.
- **Determinismo:** o arco é função do `started_day`/`recovery_days`/`currentDay` — sem `Math.random`/relógio na lib. (A ocorrência aleatória é da partida futura, sob o guardrail do engine.)

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Ocorrência hollow** (nada machuca ainda) | Decisão do founder (fatiar): o arco + a decisão + os efeitos são reais; a ocorrência é seam (a partida rica injeta — card 1.1/3.2). `injureFromMatch` é o plugue. |
| **Tocar o engine/golden** | Zero: a ocorrência é seam; o engine fica intocado (o critério duro das últimas 6 SPECs preservado). |
| **Punição cega** | O arco (volta por cima) + a decisão ("forçar/respeitar") são o ponto; os efeitos são seam, não `−X` aplicado. |
| **`injured` acoplando decisões a lesões** | `injured` é seam (param `extra`, molde do `age`) — o `decision-repo` não lê o `injury-repo`; o scheduler wira. |
| **Múltiplas lesões simultâneas** | Índice único parcial `(athlete_id) WHERE status='active'` — 1 ativa/atleta; `injureFromMatch` no-op se já ativa. |

**Dependências:** SPEC-016 (`athlete`), SPEC-025 (`DecisionContext`/`generateForDay` — o `injured` seam + o template). **Precede:** o **card de eventos de partida (1.1/3.2)** — que chama `injureFromMatch`; a aplicação da forma (2.3); tirar o humano da partida (o mundo lê `available`).

---

## Notas de implementação

- **Fatiar salvou o money path:** a ocorrência é seam → o engine/golden ficam intocados. Os "eventos de partida ricos" ganham card próprio (1.1/3.2), com o cuidado do golden.
- **`injured` = o mesmo padrão do `age`** no motor de decisões (seam via `extra`) — composição limpa, sem acoplar `decision-repo`↔`injury-repo`.
- **A volta por cima** é um outcome declarado (seam), gravado no log — o "nunca punição cega".
- **Fecho do DONE:** "Estado atual" (SPEC-026, flipar SPEC-025 → PR #28) + `roadmap.md` (2.5).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (arco + decisão + efeitos; ocorrência-real/engine/forma/toast fora — fatiado)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva — OP-01)
- [x] Critérios testáveis (arco, ocorrência-seam, recuperação, gera-decisão, disponibilidade-seam, história, efeitos-seam)
- [x] Riscos avaliados (hollow, engine/golden, punição cega, acoplamento, múltiplas lesões)
- [x] Decisões co-desenhadas registradas (ocorrência=seam [fatiado], decisão via SPEC-025, efeitos=seam)
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-026 — método H1VE. A lesão vira arco, nunca punição cega: a contusão acontece (a partida rica injeta — seam), o atleta recupera ao longo dos dias e volta por cima, e no meio ela gera uma decisão ("forçar a volta ou respeitar o prazo?") via o motor da SPEC-025 e vira história no perfil. Fatiamos para blindar o money path: engine e goldens intocados; os eventos de partida ricos são card próprio.*
