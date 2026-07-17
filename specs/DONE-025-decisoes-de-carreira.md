# DONE-025 — Decisões de carreira (o motor)

> Registro de conclusão (par obrigatório da SPEC-025). O que foi construído, como foi verificado,
> o que a revisão adversarial confirmou (e como foi corrigido), e o que fica deferido.

---

## Metadados

| Campo | Valor |
|---|---|
| **SPEC** | SPEC-025 — Decisões de carreira (o motor) |
| **Roadmap item** | 2.4 (Decisões de carreira 3-5/dia) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/decisoes-de-carreira` |
| **Concluída em** | 2026-07-17 |
| **Status** | **CONCLUÍDA** — gates verdes; aguardando duplo sign-off QA+Data e merge do arquiteto |

---

## O que foi entregue (o motor de decisões)

A **agência das 18h**: 3-5 decisões/dia **gatilhadas pelo estado** do atleta, respondidas pelo jogador **ou** resolvidas conservadoramente pelo agente no deadline, cada uma virando **história no log do perfil**. **Só-player-store**, engine/world-store/goldens intocados.

**Decisão de escopo (fatiamos com o founder):** este card entrega o **MOTOR**; a **execução da transferência** (mover clube + mercado/janela/valuation, cross-schema) virou o **card 1.4 (Transferências)** — aqui a proposta é **registrada** (o outcome fica no log; o 1.4 consome). Evita duplicar o roadmap e mantém a fatia fina.

**A) Lib pura `packages/player/decisions.ts`:** `DECISIONS` — catálogo ABERTO (tunável) de templates (`id`/`type`/`prompt`/`trigger`/`options` com `outcome` declarado + `conservative`). `generateDailyDecisions(seed, day, athleteId, context)` — filtra por gatilho, escolhe **3-5 determinística** por hash FNV-1a de 32 bits (via shifts — guardrail-safe, sem `Math.random`/transcendentais). `conservativeOption` (fallback), `templateById`/`optionById`. Gatilhos de **moral** (2.3) e **idade** (seam do mundo) presentes; moral inerte sem o estado, idade viva via param.

**B) `services/player-store`:** migration aditiva **`0005`** (tabela `decision` — `ord` [rank de geração], `template_id`, `status` [pending/answered/resolved], `chosen_option`, `outcome` jsonb, `resolved_by`; único `(athlete_id, day, template_id)`). `decision-repo`: `generateForDay` (idempotente, sob **lock advisory** athlete-dia), `answerDecision` (`FOR UPDATE`, valida a opção), `resolveDeadline` (o fallback das 18h — conservadora nas pending, UPDATE condicional que não sobrescreve a answered), `readDecisionLog` (o log, ordem determinística por `ord`).

**C) Efeitos = seam:** o `outcome` é **dado declarado** gravado no log; **nada** é aplicado a focos/saldo (provado por teste). A 2.3 (moral) e o 1.4 (transferência) consomem.

---

## Revisão adversarial (workflow · 3 dimensões · verificação de cada achado)

Nenhum CRITICAL/MAJOR de **código** — o núcleo (determinismo, máquina de estados, seam) voltou sólido. Os achados acionados:

- **minor (TOCTOU) — CORRIGIDO:** `generateForDay` era check-then-insert sem lock → duas gerações concorrentes com o contexto mudado no meio (ex.: uma compra sobe o `lifestyleTier`) misturavam os conjuntos (o único é por-template, não por-dia) → o dia passava de 5 decisões. **Fix:** `generateForDay` numa transação com **lock advisory** `decision:${athleteId}:${day}` (o padrão do repo) — a 1ª sela o dia, a 2ª relê o existente. Fecha a janela.
- **nit + minor (ordem) — CORRIGIDOS:** a ordem intra-dia era não-determinística (o multi-row INSERT compartilha o `created_at`; o read-back não reproduzia o rank do hash). **Fix:** coluna **`ord`** (o rank de geração, persistido); `readDecisionLog` e o read-back ordenam por `ord` → ordem estável e igual à apresentada.
- **nit (fallback órfão) — CORRIGIDO:** `resolveDeadline` pulava um template sem opção conservadora marcada (ficaria pending pra sempre). **Fix:** `conservativeOption` cai na 1ª opção se nenhuma for marcada + teste-invariante (todo template tem uma conservadora marcada).
- **minor (seam de idade) — CORRIGIDO:** o `age` era passado mas sem consumidor. **Fix:** template `veterano` (gatilho `age ≥ 34`) → o seam de idade fica **vivo** + testado.
- **Cobertura (5 MAJOR) — CORRIGIDA:** +testes de **variabilidade** (não é seleção constante), **idempotência com contexto mudado** (a 1ª geração vence), **boundary N=3-5** (rico chega a 5, novato limitado a 3-4), **concorrência responder×resolver** (o agente não atropela o jogador), **auth cross-atleta** (OP-09), **seam de idade** ponta-a-ponta.

**Nits documentados (não corrigidos, edge):** `hydrate` dropa do read-back um template REMOVIDO do catálogo (o log persiste intacto; só a re-apresentação some — edge de edição de catálogo); o `min=3` é propriedade do catálogo (garantido pelos 4 cotidianos sempre-on), não um guard — uma edição que reduza os sempre-on abaixo de 3 baixaria o piso (tunável, sinalizado no comentário).

---

## Verificação (gates)

- **319/319 testes** (311 preservados da SPEC-024 + ~14 novos: ~8 puros de decisões + ~6 ao vivo, incl. concorrência, auth, idempotência-com-contexto-mudado, seam de idade), estável em 2 execuções.
- `npm run typecheck` · `npx eslint .` · `npm run build` · prettier — verdes (OP-11/14/15/16/17 + guardrail; hash inteiro determinístico).
- **`world-engine`, os 4 goldens E o world-store INTOCADOS** — `git diff` = 0. **Zero cross-schema** (idade = param; transferência = registrada).
- **Migration aditiva `0005`** (CREATE TABLE `decision` — OP-01). CI: o `postgres:16` + migrate do player-store aplica `0000..0005` fresco.
- **Gotcha da tabela-filha aplicado** (já previsto na SPEC): `delete(decision)` antes de `delete(athlete)` no `wipeAll` das 6 suítes irmãs.

---

## Critérios de aceitação — status

1. **Geração gatilhada + determinística** — ✅ (filtra por trigger; mesmo `(seed,day,athleteId,context)` → mesmo conjunto E ordem via `ord`; +variabilidade + boundary).
2. **Persistência idempotente** — ✅ (lock advisory; 2× → não duplica; a 1ª vence mesmo com contexto mudado).
3. **Responder** — ✅ (`FOR UPDATE`, valida a opção, grava outcome; opção inválida → genérico).
4. **Fallback 18h** — ✅ (conservadora nas pending, `resolved_by=agent`, não sobrescreve answered; +concorrência).
5. **Log no perfil** — ✅ (`readDecisionLog`, ordem determinística por `ord`).
6. **Efeitos = seam** — ✅ (outcome = dado; focos/saldo intocados — provado).
7. **Transferência registrada** — ✅ (aceitar grava `outcome.transfer`; nada move no mundo).
8. **OPs & gates** — ✅ (todos verdes; engine/goldens/world-store intocados; +auth OP-09).

---

## Escopo deferido (honesto)

- **Aplicar os efeitos** (moral/forma) — depende da **2.3**; `outcome` no log é o plugue.
- **Executar a transferência** (mover clube + mercado/janela/valuation) — **card 1.4**, consome as decisões `outcome.transfer`.
- **Gatilhos de moral/forma** — no catálogo, inertes até a 2.3.
- **O toast acionável** (entrega + resposta) + a **UI do log** — sem cliente; seam.
- **O gatilho real** (scheduler de manhã/18h) — fatia de deploy.
- **Re-apresentar um template removido do catálogo** — edge de edição (o log persiste; a re-apresentação some).

---

## Fecho

- **Estado atual** (CLAUDE.md): SPEC-025 adicionada; SPEC-024 flipada → **PR #27**.
- **`docs/projeto/roadmap.md`**: 2.4 (Decisões de carreira) ✅.
- **Memória do projeto**: o motor de decisões (catálogo aberto + geração gatilhada determinística + fallback + o padrão lock-advisory na geração idempotente) capturado.

*DONE-025 — método H1VE. A agência das 18h: as escolhas surgem do estado do atleta, o jogador responde por um toast ou o agente decide conservador, e cada uma vira história no perfil. Os efeitos ficam declarados no log (a 2.3 aplica); a transferência é registrada (o card 1.4 executa). A revisão pediu o lock advisory na geração e a ordem determinística — feitos. Engine, goldens e world-store intocados.*
