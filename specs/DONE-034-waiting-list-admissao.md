# DONE-034 — Entrada imediata (solo) + waiting-list (Fatia 1)

> Registro de conclusão (par do `SPEC-034`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-034 (par da SPEC-034) |
| **Feature** | Sinal de atividade (markActive) + waiting-list que puxa a vaga — card do board |
| **Roadmap item** | R14 / retenção-escassez (a waiting-list) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/sinal-de-atividade-markactive-waiting-list-que-puxa-a-vaga` |
| **Concluída em** | 2026-07-19 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## O que foi entregue

A entrada é **IMEDIATA** (mid-season) e o mundo ganhou **escassez**: um teto de humanos solo na divisão de entrada; cheio → fila; um passe de admissão **diário** herda as vagas que a inatividade/transferência liberam. A guarda de gênese do `occupyNpcSlot` era **conservadora demais** — uma investigação (workflow) provou o relaxamento **SAFE** (o publish é idempotente/só-do-alvo, não reescreve as passadas; só muta o input futuro; o único trade-off — a tabela da viragem diverge — é da classe SPEC-029 e money-path-neutro).

### A) `services/world-store` — o relaxamento + a fila
- `occupation-repo.ts`: `OccupyInput.allowMidSeason?` → `occupyNpcSlot` gateia `if (!allowMidSeason) assertGenesis`. **Só a entrada solo passa**; regen/transfer ficam gênese-gated.
- Migration **`0008_waiting_list`** (OP-01): `waiting_list(world_seed, human_athlete_id PK, position, ord)` — FIFO.
- `waiting-repo.ts`: `enqueue` (lock advisory por-mundo + `ord=max+1` + `onConflictDoNothing`)/`dequeue`/`readQueue`/`queueLength`; `countEntryHumans` (join occupation→club→league, tier=max); `findEntryClubWithSlot` (clube da entrada com vaga NPC na posição, menor `ord`); `WAITINGLIST.entryCap` (tunável).

### B) `services/world-entry` — admitir/enfileirar + o passe
- `enterWorld` passa `allowMidSeason: true` (a entrada solo é imediata).
- `admitOrEnqueue` (já-ocupa → no-op; sob o teto + com vaga → `enterWorld` IMEDIATO; senão → `enqueue`).
- `runAdmissionPass` (DIÁRIO): FIFO-com-skip — já-ocupa → `dequeue` (recupera crash); teto → fica; sem-vaga-na-posição → pula; senão `enterWorld` + `dequeue`. Isolamento por candidato.

### C) `services/scheduler` — o wiring
- `processDay`: `runAdmissionPass` todo dia liquidado (após o vacancy → as vagas revertidas HOJE já contam; ANTES de `readWorldOccupations` → o admitido é processado no mesmo tick). Report ganha `admitted`.

---

## Revisão adversarial (workflow · 3 dimensões · verificação — 7 achados CONFIRMED)

O núcleo (o relaxamento, a fila, o passe) voltou **sólido**; os achados foram consequências do modelo mid-season:
- **MINOR corrigido (herança do resultado/lesão de hoje):** o `runAdmissionPass` rodava ANTES do `roundOutcomes`/passes → um humano admitido HOJE herdava o resultado E a **lesão** da rodada já publicada do NPC que substituiu (uma partida que ele não jogou; raro ~4%×1/16, money-path-neutro, mas uma inconsistência temporal real). **Fix:** a admissão foi movida pro **FIM do `processDay`** (entra, mas só é processado amanhã) + teste (o admitido não gera decisões no dia da entrada).
- **MINOR corrigido (fura-fila):** o `admitOrEnqueue` imediato furava a FIFO de quem já esperava a MESMA posição. **Fix:** enfileira se há um contendor da mesma posição na fila + teste.
- **MAJOR/MINOR documentado & deferido (teto TOCTOU):** o `check-then-act` (count → occupy) sem lock atravessando os dois → sob **entrada concorrente** o teto é excedível (money-path-neutro, soft cap). **NÃO alcançável no sistema atual** (o passe diário é SEQUENCIAL + re-checa; não há rota HTTP concorrente ainda) → o guard atômico (lock exclusivo por-mundo) fica com o **card da rota de entrada** (a fonte da concorrência). Documentado em código.
- **NIT corrigido:** o comentário do `acquireSeasonStartLock` ficou enganoso mid-season (o lock é herdado/inofensivo) → esclarecido.
- A tese central (o relaxamento não reescreve rodada publicada; money-path intocado) foi **confirmada**.

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | Entrada IMEDIATA mid-season | `admission.test.ts`: publica a rodada 1 e o solo ENTRA (allowMidSeason não barra). Ao vivo. |
| 2 | Teto → fila | teto=1: o 1º entra, o 2º vai pra fila. Ao vivo. |
| 3 | Admissão diária (FIFO) | `runAdmissionPass` drena a fila até o teto. Ao vivo. |
| 4 | Vaga liberada herdada | revert (`vacateSlot`) baixa a contagem → o passe admite o próximo. Ao vivo. |
| 5 | Teto barra o passe | teto cheio → a fila não é drenada. Ao vivo. |
| 6 | Wiring no tick | `daily-tick.test.ts`: o tick roda o passe → `admitted=1`. Ao vivo. |
| 7 | Idempotência | o passe 2× não admite em dobro. Ao vivo. |
| 8 | OPs & goldens | sem `any`; ≤50/função; ≤300/arquivo; migration `0008`; **engine + 4 goldens intocados** (`git diff` = 0); lint/typecheck/build/test/prettier verdes. |

**437 testes** (429 preservados + 8 novos: 7 ao vivo da admission [entrada mid-season, teto, admissão FIFO, herança da vaga, teto-barra, FIFO-não-fura, idempotência] + 1 do wiring no tick).

---

## Escopo deferido (cards futuros)

- **A ENTRADA DE TIME** (min-5 + takeover + rebrand + completar-NPC) — **SPEC-035** (decisões travadas: o time assume um clube existente na divisão de entrada e o rebranda pro nome/kit dele, herdando a campanha em andamento — a única forma de entrar num campeonato correndo).
- **A auditoria da viragem** (a viragem lê o `published_round` em vez de re-simular) — cura o trade-off do relaxamento + o débito de replay da SPEC-029. **Card recomendado.**
- O sinal de atividade REAL (`markActive` via HTTP/sessão); a superfície HTTP/auth; a Pirâmide Elástica; a notificação; a calibração do `entryCap`.

---

## Arquivos

**Criados:** `services/world-store/src/schema/waiting-list.ts` · `store/waiting-repo.ts` · `migrations/0008_waiting_list.sql` · `services/world-entry/src/admission.ts` (+ `test/admission.test.ts`) · `specs/SPEC-034-*.md`, `specs/DONE-034-*.md`.

**Editados:** `services/world-store` (occupation-repo `allowMidSeason`, schema/index, drizzle.config, barrel) · `services/world-entry` (enter-world `allowMidSeason`, barrel) · `services/scheduler` (daily-tick, main) · os wipeAll dos testes (limpam `waiting_list`) · `docs/projeto/roadmap.md`, `CLAUDE.md`.

**Intocado (o critério DURO):** `packages/world-engine` e os **4 goldens** (`git diff` = 0). Tudo é borda; o relaxamento é uma flag.

---

*DONE-034 — método H1VE. A entrada solo é IMEDIATA (mid-season) — a guarda de gênese era conservadora demais (uma investigação por workflow provou SAFE: o publish é idempotente, não reescreve as passadas). O mundo ganha um TETO; cheio, o solo entra na fila; o passe de admissão DIÁRIO herda as vagas que a inatividade/transferência liberam. A entrada de time (takeover + rebrand) é a SPEC-035. Money path intocado; engine e os 4 goldens byte-idênticos.*
