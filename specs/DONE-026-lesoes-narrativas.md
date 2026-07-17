# DONE-026 — Lesões narrativas (o arco)

> Registro de conclusão (par do `SPEC-026`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-026 (par da SPEC-026) |
| **Feature** | Lesões narrativas — card do board (`03a8d1de`) |
| **Roadmap item** | 2.5 (Lesões narrativas com arco) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/lesoes-narrativas` |
| **Concluída em** | 2026-07-17 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## O que foi entregue

A lesão virou **arco narrativo**, nunca punição cega: contusão → recuperando → recuperado (a **volta por cima**), e no meio **gera uma decisão** ("forçar a volta ou respeitar o prazo?") via o motor da SPEC-025 e vira **história no perfil**. **Fatiamos para blindar o money path:** a **ocorrência** é seam (`injureFromMatch` — a partida rica futura injeta), então o **engine e os 4 goldens ficam INTOCADOS** (`git diff` = 0). Só-player-store; zero cross-schema.

### A) Lib pura `packages/player/injury.ts` (sob o guardrail)
- `INJURY` tunável (mapa `Severity` `leve`/`media`/`grave` → `recoveryDays` `{3,10,30}` + o `comeback` `{moral:12}` declarado); `Injury = { severity, startedDay, recoveryDays }`.
- `recoveryDaysFor` · `injuryEndDay` · `injuryPhase(injury, currentDay)` (`recuperando` até `started+recoveryDays`, `recuperado` depois) · `isAvailable(injury|null, currentDay)` (o seam — recuperando = indisponível) · `comebackOutcome()` (a volta por cima, **constante-seam** que a 2.3 aplica no evento `recovered`; **não persistida**). Inteiro em tudo; zero I/O.

### B) `packages/player/decisions.ts` (extensão — reusa o motor da SPEC-025)
- `injured?: boolean` no `DecisionContext` (seam, molde do `age`) + o template **`lesao-volta`** (`trigger: (c) => c.injured === true`; opções: **forçar a volta** [`outcome.forceReturn`] / **respeitar o prazo** [conservadora marcada]). Os 168+ testes preservados por construção (campo opcional).

### C) `services/player-store` — a lesão persistida + o arco
- **Migration aditiva `0006_injuries`** (schema `player`, OP-01): tabela **`injury`** (`id` uuid PK · `athlete_id` FK→athlete · `severity` text · `started_day`/`recovery_days` int · `status` default `active` · `created_at`) + **índice único parcial `(athlete_id) WHERE status='active'`** (1 ativa/atleta — a rede).
- `injury-repo.ts`: `injureFromMatch` (o **seam da ocorrência**, sob **lock advisory + fecha-lazily** a vencida → cria a ativa, no-op se já há uma **genuinamente** ativa) · `advanceRecovery` (o passe diário: fecha o arco no prazo → `recovered`) · `readInjuryState` (a lesão ativa + `available` derivado — o seam que o mundo lê) · `readInjuryLog` (a **história**). Erros genéricos (OP-11).
- `decision-repo.ts` (extensão): `generateForDay(extra: { age?, injured? })` — o `injured` entra no contexto (seam) → `lesao-volta` gera quando ativo. O `decision-repo` **não** lê o `injury-repo` (o caller/scheduler wira).

### D) Efeitos como seam (pontos de plugue prontos, nada aplicado)
- `available` (a partida futura lê para tirar o humano do jogo) · a **forma** (a 2.3 aplica o `comeback`) · o `forceReturn` da decisão (o injury-repo consumirá para encurtar/recair). Todos **declarados**, não aplicados. Provado por teste (focos/saldo intocados).

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | O arco (puro) | `injury.test.ts`: `recoveryDaysFor` cresce; `injuryPhase` recuperando→recuperado no prazo; `isAvailable` false/true. |
| 2 | Ocorrência (seam) | `injureFromMatch` cria ativa; 2ª chamada com ativa genuína → no-op. Ao vivo. |
| 3 | Recuperação (passe) | `advanceRecovery` antes → ativa; no prazo exato (110) → `recovered`; **boundary 109** (último recuperando) não fecha. Ao vivo. |
| 4 | Gera decisão (SPEC-025) | `injured=true` no `extra` → `generateForDay` inclui `lesao-volta`; sem → não. Ao vivo + puro (`decisions.test.ts`). |
| 5 | Disponibilidade = seam | `readInjuryState` `available=false` enquanto ativa; nenhum estado do mundo tocado. Ao vivo. |
| 6 | História | `readInjuryLog` devolve o arco (lesão + volta por cima), mais recentes primeiro. Ao vivo. |
| 7 | Efeitos = seam | a lesão/recuperação **não** altera focos/saldo. Ao vivo (focos/saldo intocados após `injureFromMatch`+`advanceRecovery`). |
| 8 | OPs & gates | sem `any` (14); ≤50/função (15); ≤300/arquivo (16); erros genéricos (11); migration aditiva (01); regra na lib / IO no store (17); `typecheck`/`eslint`/`build`/`test`/prettier verdes; **engine + 4 goldens intocados** (`git diff` = 0); ao vivo serial + `delete(injury)` no `wipeAll` das irmãs. |

**338/338 testes** (331 preservados + 7 novos: o fix do MAJOR [re-lesão pós-prazo], boundary 109, re-lesão pós-recovery, idempotência de `advanceRecovery`, isolamento cross-atleta, concorrência de `injureFromMatch`, read-em-prazo-vencido). Sem `DATABASE_URL`: puros sempre, ao vivo skip.

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

- **1 MAJOR real, CONFIRMED e CORRIGIDO — a inconsistência dos dois seams.** `readInjuryState.available` era derivado por **DIA** (o arco), mas o guard de "1 ativa" de `injureFromMatch` era por **STATUS** (o índice parcial). Uma lesão cujo prazo **já venceu** mas ainda `status=active` (o passe `advanceRecovery` não rodou — a política de deferimento do projeto garante essa janela) lia `available=true` (o atleta joga), **mas uma nova lesão era barrada** (a linha stale tripava o índice → no-op) — a lesão grave **sumia em silêncio** e o atleta seguia jogando numa lesão leve stale. **Fix:** `injureFromMatch` agora roda numa transação com **lock advisory (atleta) + fecha-lazily** a lesão vencida antes de checar/inserir → reconcilia `status`↔`dia` (e de brinde: serializa a concorrência e **elimina** o `isUniqueViolation` frágil, o nit #4). +2 testes cravam o comportamento (re-lesão pós-prazo entra; concorrência → exatamente 1).
- **nits CONFIRMED (endurecidos):** o comentário do `comeback` dizia "gravado no log" (não é persistido) → **corrigido** para "constante-seam que a 2.3 deriva no evento `recovered`". O `readInjuryState` fail-open em dado corrompido (severidade inválida por escrita manual — inalcançável pelo seam, consistente com o padrão de coluna `text` sem CHECK do projeto) → **documentado** (nit, mantido).
- **Lacunas de cobertura MAJOR/minor CONFIRMED → +5 testes:** boundary 109, re-lesão pós-recovery (o loop de carreira), idempotência de `advanceRecovery` (2× + sem-lesão), isolamento cross-atleta, read-em-prazo-vencido.
- **3 achados REFUTED** (não reproduziram).

---

## Escopo deferido (seams com plugue pronto)

- **A ocorrência real** — o engine emitir o lance que machuca + a taxa: **card 1.1/3.2 (eventos de partida ricos)**; aqui é seam (`injureFromMatch`). O money path fica blindado.
- **Tirar o humano da partida** (aplicar `available` no mundo, cross-schema) — a partida futura lê o seam.
- **Aplicar a forma / o `comeback`** — depende da **2.3** (Forma/Moral); seam declarado.
- **O efeito da escolha na lesão** (`forceReturn` → encurta + risco de recaída) — seam no log; wiring futuro.
- **O toast/UI + o jornal** — sem cliente; seam.
- **O gatilho real** — o **scheduler de produção** chama `advanceRecovery` 1×/dia e passa `injured` ao `generateForDay` (fatia de deploy).

---

## Arquivos

**Criados:** `packages/player/src/injury.ts` · `packages/player/src/injury.test.ts` · `services/player-store/src/schema/injury.ts` · `services/player-store/src/migrations/0006_injuries.sql` (+ meta) · `services/player-store/src/store/injury-repo.ts` · `services/player-store/test/injury-repo.test.ts` · `specs/SPEC-026-*.md` · `specs/DONE-026-*.md`.

**Editados:** `packages/player/src/decisions.ts` · `decisions.test.ts` · `packages/player/src/index.ts` · `services/player-store/src/store/decision-repo.ts` · `services/player-store/src/schema/index.ts` · `services/player-store/drizzle.config.ts` · `services/player-store/src/index.ts` · as suítes irmãs (`player-repo`/`training-repo`/`team-repo`/`decision-repo`/`economy-repo` + `regen`/`world-entry` — `delete(injury)` no `wipeAll`) · `docs/projeto/roadmap.md` · `CLAUDE.md` (Estado atual + flip SPEC-025 → PR #28).

**Intocado:** `packages/world-engine` (engine puro) e **os 4 goldens** (`season`/`prng`/`world`/`anchor` — a ocorrência é seam); o `world-store` (zero cross-schema — `available` é seam).

---

*DONE-026 — método H1VE. A revisão adversarial pegou 1 MAJOR real (a inconsistência status↔dia dos dois seams), resolvido por lock advisory + fecha-lazily; engine e goldens intocados, o critério duro das 7 últimas SPECs preservado.*
