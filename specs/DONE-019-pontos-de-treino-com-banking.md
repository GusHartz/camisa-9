# DONE-019 — Pontos de treino com banking: FOCO do dia + rendimento decrescente

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-019 |
| **SPEC correspondente** | SPEC-019-pontos-de-treino-com-banking.md |
| **Feature** | Pontos de treino com banking (card 2.7 — completa o loop de treino) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/pontos-de-treino-com-banking` |
| **PR** | *pendente* |
| **Desenvolvimento** | 2026-07-16 |
| **Dias vs appetite** | ~½ dia vs 1–2 dias |

---

## Resumo do que foi feito

**O FOCO do dia ganhou efeito.** A SPEC-017 plantou o FOCO como **seam neutro** (`focusMultPct` todos 100); agora ele importa pelo **ritmo**: cada sessão treina um foco (**escolhido** ou, sem escolha, o **mais baixo** pelo técnico); **repetir** o mesmo foco em dias consecutivos aplica **rendimento decrescente** por degraus com piso, e **rotacionar** rende **100%** (o baseline da SPEC-017). O ponto segue **flutuante** (Model A intacto) — o build é o **gasto**, o treino é o ritmo (rotacione pra render). O **banking** já existia (SPEC-017: nada expira). A matemática é **lib pura**; o **streak** persiste no `player-store` (transação, `FOR UPDATE`).

- **`packages/player` (lib pura):** `repeatPenaltyPct(repeats)` (degraus inteiros `max(floor, 100−repeats×step)`, guardrail-safe), `coachFocus(attributes)` (o menor; empate → ordem `FOCI`), `resolveFocusStreak(lastFocus, focusStreak, focus)` (repeats + próximo streak; sanea negativo). O fator de repetição entra como **3º seam** via `TrainOpts.focusRepeatPct` (default 100). +2 tunáveis em `TRAINING` (`focusRepeatStepPct: 20`, `focusRepeatFloorPct: 40`). `TrainState`/`TrainResult` **inalterados**.
- **`services/player-store` (serviço):** migration aditiva **`0003`** (`last_focus text NULL` + `focus_streak int NOT NULL DEFAULT 0` + CHECK ≥0). `applyTraining(db, id, focus: Focus | null, opts?)` — `null` → `coachFocus`; lê/grava o streak na mesma transação (`FOR UPDATE`); a penalidade é **autoridade do servidor** (override de `focusRepeatPct`). `Progress` ganha `lastFocus`/`focusStreak`/`nextFocusPenaltyPct` (só leitura).
- **Docs:** corrigida a frase de calibração incompatível no design record (a carreira chega a ~72, 85+ = lenda multi-carreira) + registrado o mecanismo do FOCO da SPEC-019.

**Verificação:** `typecheck` ✅ · `eslint` ✅ · `build` ✅ · prettier LF-clean ✅ · **`test` 207/207** com `DATABASE_URL` (197 preservados + **4 puros** + **6 ao vivo**; 147 sem DB). `world-engine`/`world-store` **intocados**; nenhum golden regenerado; migrations `0000`/`0001`/`0002` intactas. **Revisão adversarial** (workflow 3 dimensões + verificação de cada achado): a dimensão de **CORREÇÃO retornou ZERO achados** (matemática dos degraus, semântica do streak, `coachFocus` e a preservação dos 168 — todos corretos); **6 achados confirmados, todos minor/nit** (100% cobertura de teste / redação de critério, **nenhum bug de código**). Acionados 5 → **+4 testes** (override server-side, concorrência `FOR UPDATE`, piso ao vivo, saneamento negativo) + o Critério 6 reconciliado honestamente (ver Desvios).

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `packages/player/src/constants.ts` | +`focusRepeatStepPct`/`focusRepeatFloorPct` em `TRAINING`. |
| `packages/player/src/training.ts` | +`repeatPenaltyPct`/`coachFocus`/`resolveFocusStreak`; `sessionDeposit` aplica `focusRepeatPct`. |
| `packages/player/src/types.ts` | `TrainOpts` +`focusRepeatPct?`. |
| `packages/player/src/index.ts` | +exports das 3 funções puras. |
| `packages/player/src/training.test.ts` | +bloco FOCO/streak (4 testes puros; +saneamento negativo). |
| `services/player-store/src/schema/athlete.ts` | +`last_focus`/`focus_streak` (+CHECK). |
| `services/player-store/src/store/training-repo.ts` | `focus \| null` (coach); lê/grava streak; `Progress` +estado; override server-side. |
| `services/player-store/test/training-repo.test.ts` | +6 testes ao vivo (decai, reset, coach, override, piso, concorrência). |
| `docs/projeto/design-atributos-e-evolucao.md` | Corrige a frase de calibração + registra o mecanismo do FOCO. |
| `specs/SPEC-019-*.md`, `specs/DONE-019-*.md` | SPEC (aprovada) + este documento. |

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `services/player-store/src/migrations/0003_training_focus_streak.sql` (+ meta) | Migration aditiva (OP-01): `last_focus` + `focus_streak` + CHECK. |

**Intocado:** `packages/world-engine`, `services/world-store`, todos os goldens, migrations `0000`/`0001`/`0002`, `TrainState`/`TrainResult`, `spendFreePoint`. **CI sem mudança** (o migrate do `player-store` já aplica o `0003`).

---

## Mudanças de schema aplicadas

Migration **`0003_training_focus_streak.sql`** (OP-01, drizzle-kit): `ALTER TABLE player.athlete ADD COLUMN last_focus text` (nullable) + `ADD COLUMN focus_streak integer DEFAULT 0 NOT NULL` + `ADD CONSTRAINT athlete_focus_streak_range CHECK (focus_streak >= 0)`. **Aditiva** (zero downtime; atletas existentes começam frescos, `last_focus NULL`/`focus_streak 0`), aplica sobre `0000`+`0001`+`0002`. Tracking em `drizzle_player`.

## Mudanças de API entregues

- **`@camisa-9/player`** (+): `repeatPenaltyPct`, `coachFocus`, `resolveFocusStreak`; `TrainOpts.focusRepeatPct?`. `TrainState`/`TrainResult` inalterados.
- **`@camisa-9/player-store`**: `applyTraining` agora aceita `focus: Focus | null` (compatível — um `Focus` segue válido); `Progress` +`lastFocus`/`focusStreak`/`nextFocusPenaltyPct`.
- `world-engine`/`world-store` inalterados.

---

## Critérios de aceitação

| Critério (SPEC-019) | Status | Evidência |
|---|---|---|
| 1 — FOCO fresco = 100% (curva intacta) | ✅ | `trainSession` sem `focusRepeatPct` = neutro; os 168 testes da SPEC-017 preservados (só a reconciliação de 5-sessões atualizada — ver Desvios). |
| 2 — Rendimento decrescente por degraus | ✅ | Puro: `repeatPenaltyPct` 100/80/60/40/40; ao vivo: repetir decai, **piso pinado** (4ª = 40). |
| 3 — `coachFocus` = mais baixo | ✅ | Puro (empate → ordem `FOCI`) + ao vivo (após subir o físico, o técnico pega `tecnico`, provando o MENOR, não o primeiro). |
| 4 — Streak persistido | ✅ | `last_focus`/`focus_streak` gravados na transação; reconciliação de 5 sessões (streak 5) + reset ao trocar. |
| 5 — Banking preservado | ✅ | `spendFreePoint` intacto; ponto flutuante; `free_points`/`training_xp` sem expirar. |
| 6 — Atomicidade + concorrência | ✅* | **Concorrência `FOR UPDATE` testada** (2 treinos simultâneos → serializado 180/streak 2, sem lost update). *Rollback do streak = **estruturalmente atômico** (streak+XP num único UPDATE/transação) — ver Desvios.* |
| 7 — Calibração intacta | ✅ | `nextThreshold`/fronteiras `104/204`/limiares de zona **inalterados** (`git diff` = 0); só a frase do design record mudou. |
| 8 — OPs & gates | ✅ | sem `any`; funções ≤50; arquivos ≤300 (training-repo 166); OP-11; guardrail (degraus inteiros); migration OP-01; `world-engine`/`world-store` intactos. |

---

## Como testar manualmente

```
POSTGRES_PORT=5434 docker compose -f services/world-store/docker-compose.yml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5434/camisa9_dev
npm run db:migrate -w services/player-store   # aplica 0000..0003
npm run lint && npm run typecheck && npm test && npm run build   # 207/207
```

---

## Testes automatizados

**10 testes novos**: 4 puros em `packages/player` (degraus + piso + repeats negativo, `trainSession` com `focusRepeatPct`, `coachFocus` mais-baixo/empate, `resolveFocusStreak` fresco/repete/troca/negativo) + 6 ao vivo em `services/player-store` (repetir decai + persiste, reset ao trocar, coach default = mais baixo, **override server-side ignora o caller**, **piso ao vivo**, **`FOR UPDATE` serializa**). A reconciliação de 5 sessões foi atualizada p/ espelhar a penalidade. Total do repo: **207** (147 sem `DATABASE_URL`).

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `packages/player/src/training.ts` (+ constants/types/index) | ~100% | Sim — degraus inteiros conferidos; guardrail verde; seam neutro preserva os 168. |
| `services/player-store/src/store/training-repo.ts` | ~100% | Sim — coach default + streak na transação (`FOR UPDATE`); OP-11; delega a regra à lib pura (OP-17). |
| Migration `0003` + schema `last_focus`/`focus_streak` | ~100% (kit, revisado) | Sim — aditiva, CHECK ≥0. |
| Testes (10 cenários) | ~100% | Sim — 207/207; +4 testes vindos da revisão adversarial. |
| Docs (`SPEC/DONE-019`, design record) | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim — **testes de hardening vindos da revisão adversarial** (override, concorrência, piso, negativo) + a reconciliação honesta do Critério 6 (abaixo).

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Reconciliação de 5 sessões atualizada** | O teste da SPEC-017 que treinava `tecnico` 5× agora reconcilia **com** a penalidade de repetição (espelha o store). | A nova mecânica muda o depósito de sessões repetidas. É a única mudança nos 168; documentada e mais forte (prova o streak persistido entre chamadas). |
| **+4 testes da revisão** (override, `FOR UPDATE`, piso, repeats negativo) | Adicionados após a revisão adversarial confirmar os gaps. | Fechar cobertura: o override server-side (invariante de segurança), a serialização `FOR UPDATE` (integridade), o piso e o saneamento defensivo. |
| **Critério 6 — rollback do streak** | **Não** foi escrito um teste de injeção de falha; documentado como **estruturalmente atômico**. | O `applyTraining` grava streak+XP num **único** `UPDATE` dentro de **uma** transação — não há seam de falha pós-load (diferente de `publishRound`/`spendFreePoint`); forçar a falha exigiria violar um CHECK artificialmente. A revisão confirmou: rollback estruturalmente garantido, sem defeito. A concorrência (a outra metade do Critério 6) **foi** testada. |

**Protocolo de conflito:** não acionado (Model A preservado, curva intacta, OPs respeitadas).

---

## Limitações conhecidas

- **Sem gatilho diário / scheduler / UI / rota HTTP** — o treino é uma função; quem/quando dispara é orquestração futura. A guarda de autoridade server-side (override) já antecipa a borda não-confiável.
- **FOCO por-foco ainda neutro** (`focusMultPct` = 100 cada) — diferenciar físico ≠ mental na taxa é seam para futuro; nesta fatia o efeito do FOCO é a rotação (repeat penalty).
- **Coach-mais-baixo pode repetir** (se o pior foco continua o pior) → incorre na penalidade, gentil pelo piso (40%). Desejado; tunável (`step`/`floor`) se o founder quiser calibrar.
- **DLC (`speed`) e idade (`age`)** seguem seams neutros (SPEC-017).
- **Forma/Moral/stamina** (2.3) e **colocar no mundo** (card 21) fora desta fatia.

---

## Checklist de entrega

- [x] Critérios de aceitação verificados (8/8)
- [x] Testes passando (207/207 com DB; 147 sem)
- [x] Typecheck/lint/build limpos; prettier LF-clean
- [x] Revisão adversarial rodada (3 dimensões); **correção = 0 achados**; 6 minor/nit de cobertura → 5 acionados (+4 testes), rollback documentado
- [x] Nenhum `any`/segredo/log de debug; erros genéricos (OP-11); migration OP-01; guardrail (degraus inteiros)
- [x] `world-engine`/`world-store` intocados; nenhum golden regenerado; `TrainState`/`TrainResult` intactos
- [x] AI Declaration preenchida
- [x] `CLAUDE.md` "Estado atual" + `roadmap.md` (2.7) + design record atualizados

---

*DONE-019 — método H1VE. Completa o loop de treino (2.7): o FOCO do dia vira ritmo (rotacione para render; repetir decai por degraus, piso 40%), o técnico cobre a fraqueza sem escolha, o ponto segue flutuante (Model A) e a curva de lenda fica intacta. Lib pura + streak persistido com FOR UPDATE. Revisão adversarial: 0 achados de correção; os 168 preservados por construção (seam neutro).*
