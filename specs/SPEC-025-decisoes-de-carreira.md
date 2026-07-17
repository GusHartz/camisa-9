# SPEC-025 — Decisões de carreira (o motor)

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-025 |
| **Feature** | Decisões de carreira — card do board (`396bdc79`) |
| **Slug** | decisoes-de-carreira |
| **Owner** | gustavo-hartz (dev) |
| **Roadmap item** | 2.4 (Decisões de carreira 3-5/dia) |
| **Appetite** | **2 a 3 dias** (motor de decisões: lib pura + player-store; sem cross-schema, sem workspace novo). |
| **Prioridade** | ALTA — a **agência das 18h** do Dia do Jogador; conecta à economia (SPEC-024) e ao Regen. |
| **Criada em** | 2026-07-17 |
| **Status** | **PROPOSTA — aguardando aprovação do founder** |

---

## Decisões travadas com o founder (2026-07-17)

1. **Efeitos das escolhas COTIDIANAS = SEAM declarado + LOG.** Cada opção **declara** seu outcome (ex.: +moral, −físico, +$) como **dado**, gravado no **log do perfil**; a **aplicação real** vem com a **2.3 (Forma/Moral)** e os sistemas alvo. Esta fatia **NÃO** constrói Forma/Moral (fronteira limpa) e **NÃO** aplica nada a atributo (molde da economia, SPEC-024).
2. **Geração GATILHADA POR ESTADO (determinística).** As 3-5 decisões/dia surgem de **condições** sobre o estado do atleta, a partir de um **catálogo ABERTO** de templates; entre os candidatos gatilhados, uma escolha **determinística por `(seed, dia, atleta)`** (money-path reproduzível). Os gatilhos usam **os estados que EXISTEM** — `overall` (focos), `saldo`/`patrimônio` (SPEC-024); **idade** entra como **seam** (param do mundo, opcional). Decisões gatilhadas por **moral/forma** ficam no catálogo mas **inertes** até a 2.3.
3. **A proposta de transferência é REGISTRADA (fatiada).** Aceitar uma proposta dramática (2× salário / transferência) **grava a decisão + o outcome no log**, mas **NÃO** move o clube nem altera o salário aqui — a **execução real** (mercado, janela, valuation, cross-schema) é o **card 1.4 (Transferências)**, que consumirá as decisões aceitas. Evita duplicar o roadmap; mantém a fatia **só-player-store**.

**Defaults do projeto (não-perguntados, molde estabelecido):** o **toast acionável** (a entrega da decisão + a resposta pelo toast) é **seam** — não há cliente ainda (como a faixa); a fatia entrega o **motor server-side** (gerar/responder/resolver/log), testado direto. O **fallback conservador** = cada template marca a opção conservadora (status-quo/baixo risco), aplicada no deadline das 18h. O **gatilho real** (o scheduler que gera de manhã e resolve às 18h) é fatia de deploy.

---

## Objetivo

Dar ao atleta **agência diária**: 3-5 decisões/dia (do cotidiano — treino extra vs. descanso — ao dramático — proposta 2× salário vs. ficar com os amigos), respondidas por um toast **ou**, sem resposta até as **18h**, resolvidas conservadoramente pelo agente. Cada decisão vira **história no perfil** (o log). É o **batimento de escolha** do Dia do Jogador — a razão de o jogador abrir o jogo mesmo sem partida.

---

## Contexto e motivação (fatos verificados no repo)

- **O atleta e seus estados existem (SPEC-016/017/024):** `overall` (dos focos), `balance`/`lifestyleTier` (economia). O `player-store.athlete` persiste focos + `free_points` + `balance` + `purchase`. Os gatilhos leem esses estados **locais** (sem world-store).
- **A idade é do mundo (SPEC-022):** a `age` (relógio de carreira) mora no `world_occupation`/`world.athlete`, não no player-store → entra como **seam** (param opcional), não como leitura cross-schema.
- **Forma/Moral (2.3) NÃO existe:** grep — zero `moral`/`forma` como estado. Por isso os efeitos são **seam declarado** (decisão 1) e os gatilhos de moral ficam inertes.
- **Sem decisões hoje:** grep — zero `decision`/`decisao` no código. Motor novo, molde SPEC-024 (lib pura + player-store, migration aditiva, catálogo aberto).
- **O toast foi provado (SPEC-005) mas o cliente não existe:** a entrega/resposta por toast é seam; o motor é server-side (as decisões do toast serão revalidadas server-side — SDD §89).
- **Sem cross-schema:** a fatia lê/grava só o player-store; a transferência é **registrada** (o card 1.4 executa) → **single-schema**.

---

## Escopo — o que está DENTRO

**A) Lib pura `packages/player/decisions.ts` (determinística, sob o guardrail):**
- [ ] `DECISIONS` — **catálogo ABERTO** (tunável) de templates: `id`, `type` (`treino`/`vida`/`proposta`), `prompt`, `trigger` (condição pura sobre o `DecisionContext`), `options[]` (cada uma: `label`, `outcome` [dado declarado — seam], e uma marcada `conservative`).
- [ ] `DecisionContext` — os estados de gatilho: `overall`, `balance`, `lifestyleTier`, `age?` (seam opcional). `generateDailyDecisions(seed, day, athleteId, context): Decision[]` — filtra por `trigger`, escolhe **3-5 determinística** por `(seed, day, athleteId)` (PRNG do engine ou hash inteiro; guardrail-safe).
- [ ] `conservativeOption(template)` — a opção default; `outcomeOf(templateId, optionId)` — o outcome declarado (para o log). Sem transcendentais.

**B) `services/player-store` — as decisões persistidas + o log:**
- [ ] **Migration aditiva** (schema `player`, OP-01): tabela **`decision`** (`id`, `athlete_id` FK, `day` int, `template_id`, `type`, `status` [`pending`/`answered`/`resolved`], `chosen_option`, `outcome` jsonb [o dado declarado], `resolved_by` [`player`/`agent`], `created_at`; único `(athlete_id, day, template_id)` — idempotência da geração do dia).
- [ ] `decision-repo.ts` (novo): `generateForDay(db, athleteId, day, seed, context)` — monta o `DecisionContext` (lê `overall`/`balance`/`lifestyleTier` locais; `age` via param), gera e **persiste** o dia (idempotente); `answerDecision(db, athleteId, decisionId, optionId)` — grava a escolha **antes do deadline** (transação; valida a opção; `status=answered`); `resolveDeadline(db, athleteId, day)` — o **fallback das 18h**: para as `pending` do dia, aplica a **opção conservadora** (`status=resolved`, `resolved_by=agent`), grava o `outcome`; `readDecisionLog(db, athleteId)` — o histórico (o "log no perfil"). Erros **genéricos** (OP-11).

**C) Efeitos como seam:** o `outcome` (dado declarado) é **gravado no log**, não aplicado. O ponto de plugue: um sistema futuro (2.3 para moral; 1.4 para a transferência aceita) lê o log/outcomes e aplica.

**D) A transferência REGISTRADA:** aceitar uma opção com `outcome.transfer` grava a decisão + o outcome (o clube-alvo declarado); **nada move**. O card 1.4 consumirá as decisões `resolved`/`answered` com `outcome.transfer`.

**E) Wiring (fora do tick puro):** o scheduler chama `generateForDay` de manhã e `resolveDeadline` às 18h. Na fatia, ambos são **testados direto**; o toast (entrega/resposta) e o gatilho real são seam/deferidos.

**F) Testes** (puros sempre; ao vivo gated por `DATABASE_URL`): ver Critérios.

## Escopo — o que está FORA

- **Aplicar os efeitos** (moral/forma/atributos) — depende da **2.3**; aqui é seam declarado no log.
- **Executar a transferência** (mover clube + mercado/janela/valuation, cross-schema) — é o **card 1.4**; aqui a proposta é **registrada**.
- **Gatilhos de moral/forma** — no catálogo, **inertes** até a 2.3 existir.
- **O toast acionável** (entrega + resposta pelo toast) + a **UI do log** — sem cliente; seam.
- **O gatilho real** (scheduler de manhã/18h) — fatia de deploy.
- **Eventos de escolha EM PARTIDA** (1-2/jogo) — card separado (3.2).

---

## Arquivos que serão tocados

| Arquivo | Ação |
|---|---|
| `packages/player/src/decisions.ts` (+ `index.ts`, `types.ts` se preciso) | criar/editar — catálogo + geração + fallback (puro). |
| `packages/player/src/decisions.test.ts` | criar — testes puros. |
| `services/player-store/src/schema/decision.ts` (+ barrel, drizzle.config) | criar — tabela `decision`. |
| `services/player-store/src/migrations/0005_*.sql` (+ meta) | criar — migration aditiva (OP-01). |
| `services/player-store/src/store/decision-repo.ts` (+ `index.ts`) | criar — `generateForDay`/`answerDecision`/`resolveDeadline`/`readDecisionLog`. |
| `services/player-store/test/decision-repo.test.ts` | criar — testes ao vivo. |
| Suítes irmãs do player-store (`wipeAll`) | editar — `delete(decision)` antes de `delete(athlete)` (gotcha da tabela-filha). |
| `docs/projeto/roadmap.md`, `CLAUDE.md` | editar (no DONE) — 2.4 + flip SPEC-024 → PR #27. |
| `specs/SPEC-025-*.md`, `specs/DONE-025-*.md` | criar. |

**Intocado:** `packages/world-engine` (engine puro) e todos os goldens; o `world-store` (zero cross-schema — idade é seam, transferência é registrada).

---

## Critérios de aceitação

1. **Geração gatilhada + determinística:** `generateDailyDecisions(seed, day, athleteId, context)` filtra por `trigger` (ex.: uma proposta só com `overall ≥ X`) e devolve **3-5** decisões; **mesmo `(seed,day,athleteId,context)` → mesmo conjunto** (determinismo). Testado puro.
2. **Persistência idempotente:** `generateForDay` grava o dia; rodar 2× no mesmo `(athlete, day)` → não duplica (único). Testado ao vivo.
3. **Responder:** `answerDecision(id, optionId)` grava a escolha (`status=answered`, `resolved_by=player`, `outcome` declarado); opção inválida → erro genérico. Testado ao vivo.
4. **Fallback 18h:** `resolveDeadline(athleteId, day)` resolve as `pending` do dia com a **opção conservadora** (`status=resolved`, `resolved_by=agent`); uma já `answered` **não** é sobrescrita. Testado ao vivo.
5. **Log no perfil:** `readDecisionLog` devolve o histórico (respondidas + resolvidas, com quem resolveu + o outcome). Testado.
6. **Efeitos = seam:** o `outcome` é gravado como **dado**; **nenhum** atributo (focos) / saldo é alterado por uma decisão (a aplicação é de outro sistema). Testado (focos/saldo intocados).
7. **Transferência registrada:** aceitar uma opção com `outcome.transfer` grava a decisão + o alvo; **nada move no mundo** (o card 1.4 executa). Testado (o world-store não é tocado).
8. **OPs & gates:** sem `any` (OP-14); ≤50 linhas/função (OP-15); ≤300/arquivo (OP-16); erros genéricos (OP-11); migration aditiva (OP-01); regra pura na lib / IO no store (OP-17); guardrail verde (geração inteira/determinística); `lint`/`typecheck`/`build`/`test`/prettier verdes; **engine e os 4 goldens intocados** (`git diff` = 0); ao vivo serial + limpeza em ordem de FK (a nova `decision` no `wipeAll` das irmãs).

---

## Segurança

- **Autoridade server-side (SDD §89):** a geração, a validação da opção e o fallback são decididos no servidor; uma resposta vinda do toast é revalidada (a opção pertence à decisão daquele atleta/dia; o deadline não passou). O cliente nunca injeta uma decisão nem uma opção fora do catálogo.
- **OP-11:** decisão/opção inexistente, deadline vencido, atleta inexistente → erro genérico, sem SQL/stack.
- **Atomicidade:** `answerDecision`/`resolveDeadline` são transacionais (a escolha e o outcome juntos).
- **Determinismo (money path):** a geração é reproduzível por `(seed, day, athleteId, context)` — sem `Math.random`/relógio na lib.

---

## Riscos e dependências

| Risco | Mitigação |
|---|---|
| **Efeitos hollow** (a decisão não muda nada ainda) | Decisão do founder (seam): a fatia entrega o motor + o log; os efeitos wired quando 2.3/1.4 existirem. O `outcome` no log é o ponto de plugue. |
| **Gatilho por moral/forma inexistente** | O catálogo tem os templates, mas o `trigger` de moral fica inerte (o `DecisionContext` não tem moral) até a 2.3 — sem quebrar. Gatilha só nos estados que existem. |
| **Transferência acoplando ao mundo** | Registrada, não executada; zero cross-schema. O card 1.4 consome. |
| **Idade cross-schema** | `age` é seam (param), não leitura do world-store. |
| **Fallback sobrescreve resposta** | `resolveDeadline` só toca `pending` (não `answered`); teste prova. |
| **Race responder × resolver** | `answerDecision`/`resolveDeadline` transacionais + `status` guardado; a resolução não pega uma `answered`. |

**Dependências:** SPEC-016/017 (`athlete`/`overall`), SPEC-024 (`balance`/`lifestyleTier` p/ gatilhos). **Precede:** a aplicação dos efeitos (2.3), a **execução da transferência (card 1.4)**, o toast/UI, o wiring do scheduler.

---

## Notas de implementação

- **O motor mora no player-store** (single-schema): gatilhos leem estados locais; `age` é param. Zero world-store. Molde SPEC-024.
- **Determinístico E gatilhado:** o `trigger` filtra candidatos; a escolha dos 3-5 é determinística por `(seed, day, athleteId)` — reproduzível.
- **Catálogo aberto:** `DECISIONS` é dado tunável — adiciona/edita decisões sem tocar lógica (molde do `PURCHASES`).
- **O log É a entrega:** "log no perfil" = as decisões `resolved`/`answered` (com `resolved_by` + `outcome`). O outcome é o dado que a 2.3/1.4 consome.
- **Fecho do DONE:** "Estado atual" (SPEC-025, flipar SPEC-024 → PR #27) + `roadmap.md` (2.4).

---

## Checklist de aprovação

- [x] Objetivo claro e verificável
- [x] Escopo delimitado (motor: gerar/responder/fallback/log; efeitos/transferência-execução/toast/scheduler fora)
- [x] Arquivos listados corretos (verificados no repo)
- [x] Mudança de schema documentada (migration aditiva — OP-01)
- [x] Critérios testáveis (geração determinística, idempotência, responder, fallback 18h, log, efeitos=seam, transferência registrada)
- [x] Riscos avaliados (hollow, moral inexistente, cross-schema, fallback/race)
- [x] Decisões co-desenhadas registradas (efeitos=seam, geração gatilhada, transferência registrada/fatiada 1.4) + defaults
- [ ] **Aprovada** — *aguardando founder/architect no card*

---

*SPEC-025 — método H1VE. A agência das 18h: 3-5 escolhas/dia surgem do estado do atleta, respondidas por um toast ou resolvidas conservadoramente pelo agente, e cada uma vira história no perfil. Os efeitos ficam declarados no log (a 2.3 aplica); a transferência é registrada (o card 1.4 executa). Só-player-store, engine e goldens intocados.*
