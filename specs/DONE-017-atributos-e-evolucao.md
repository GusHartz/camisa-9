# DONE-017 — Atributos e evolução (treino): a barra de XP → +1 ponto livre

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-017 |
| **SPEC correspondente** | SPEC-017-atributos-e-evolucao.md |
| **Feature** | Atributos e evolução (card 13 — segunda feature da Fase 1) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/atributos-e-evolucao` |
| **PR** | *pendente* |
| **Desenvolvimento** | 2026-07-16 |
| **Dias vs appetite** | ~½ dia vs 1–2 dias |

---

## Resumo do que foi feito

**O loop de progressão do atleta.** A SPEC-016 criava um atleta que nascia e **não crescia**; agora o treino diário enche uma **barra de XP** que, cheia, concede **+1 ponto livre** para o jogador distribuir num dos 4 focos (até 99), com **curva de 3 zonas** (várzea rápida → meio compromisso → cauda elite). Padrão H1VE à risca: a **matemática é lib pura** (`packages/player`, determinística, sob o guardrail); a **persistência é serviço isolado** (`services/player-store`), atômica.

- **`packages/player` (lib pura):** `training.ts` — `trainSession` (deposita XP; estoura pontos **em cascata** com o limiar recomputando a cada ponto; carrega o resto), `applyPoint` (gasta +1 num foco, teto 99 — **distinta** de `allocateAttributes`, que é trava de criação soma===136), `nextThreshold` (curva de 3 zonas, **inteira/piecewise** — sem transcendental, guardrail-safe), `pointsEarnedTotal` (deriva de `soma − 136 + freePoints`, **anti-hoarding**). Bloco **`TRAINING`** com TODA a calibração tunável.
- **`services/player-store` (serviço):** migration aditiva **`0001`** (OP-01) — `athlete.free_points int NOT NULL DEFAULT 0` + CHECK `>= 0`. `training-repo.ts` — `applyTraining`/`spendFreePoint` (transação atômica; `loadActive` com **`SELECT … FOR UPDATE`** serializando o read-modify-write — hardening da revisão adversarial) + `readAthleteProgress`.
- **Model A (decisão do founder):** barra única + ponto flutuante; FOCO do dia = taxa (seam neutro); limiar cresce com o overall. **Seams neutros** `speedMultiplierPct`/`ageFactorPct` (=100) — DLC e idade adiados.

**Verificação:** `typecheck` ✅ · `eslint` ✅ (guardrail auto-cobre `packages/player`) · `build` ✅ · prettier LF-clean ✅ · **`test` 168/168** (143 preservados + **21 puros** + **4 ao vivo**). `world-engine`/`world-store` **intocados**; nenhum golden regenerado. **Revisão adversarial** (workflow de 4 dimensões + verificação de cada achado): 8 achados → 4 confirmados (todos minor/nit), 2 "major" de concorrência **rebaixados** (a verificação provou que nenhum ponto é *fabricável* — as escritas são overwrite de coluna cheia). Fixes aplicados: **row lock** + 4 testes novos (cruzamento de zona, seams combinados, truncamento, `overall` floor).

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `packages/player/src/training.ts` | `trainSession`/`applyPoint`/`nextThreshold`/`pointsEarnedTotal` (pura). |
| `packages/player/src/training.test.ts` | 21 testes puros (curva, cascata, cruzamento de zona, seams, teto 99). |
| `services/player-store/src/store/training-repo.ts` | `applyTraining`/`spendFreePoint`/`readAthleteProgress` (transação + FOR UPDATE). |
| `services/player-store/src/migrations/0001_training_points.sql` (+ meta) | Migration aditiva (OP-01). |
| `services/player-store/test/training-repo.test.ts` | Testes ao vivo (atômico, gasto, teto, `overall` floor, reconciliação). |
| `specs/SPEC-017-*.md`, `specs/DONE-017-*.md` | SPEC (aprovada) + este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `packages/player/src/constants.ts` | +bloco `TRAINING` (curva + seams tunáveis). |
| `packages/player/src/types.ts` | +`TrainState`/`TrainOpts`/`TrainResult`. |
| `packages/player/src/index.ts` | +exports do treino + `TRAINING`. |
| `services/player-store/src/schema/athlete.ts` | +coluna `free_points` (+CHECK ≥ 0). |
| `services/player-store/src/index.ts` | +exports do `training-repo`. |
| `docs/projeto/design-atributos-e-evolucao.md` | Marca as decisões travadas (Model A + seams). |
| `CLAUDE.md`, `docs/projeto/roadmap.md` | "Estado atual" + SPEC-017. |

**Intocado:** `packages/world-engine`, `services/world-store`, todos os goldens, migration `0000`. **CI sem mudança** (o passo de migrate do `player-store` já aplica o `0001`).

---

## Mudanças de schema aplicadas

Migration **`0001_training_points.sql`** (OP-01, gerada por `drizzle-kit`): `ALTER TABLE player.athlete ADD COLUMN free_points integer DEFAULT 0 NOT NULL` + `ADD CONSTRAINT athlete_free_points_range CHECK (free_points >= 0)`. **Aditiva** (zero downtime, não toca dados existentes), aplica sobre o `0000` num DB limpo, ao lado do world-store, sem colisão. Tracking em `drizzle_player` (SPEC-016).

## Mudanças de API entregues

- **`@camisa-9/player`** (+): `trainSession`, `applyPoint`, `nextThreshold`, `pointsEarnedTotal`, `TRAINING`, tipos `TrainState`/`TrainOpts`/`TrainResult`.
- **`@camisa-9/player-store`** (+): `applyTraining`, `spendFreePoint`, `readAthleteProgress`, tipo `Progress`.
- `world-engine`/`world-store` inalterados.

---

## Critérios de aceitação

| Critério (SPEC-017) | Status | Evidência |
|---|---|---|
| 1 — Curva de 3 zonas (~3/8/15 treinos/ponto) | ✅ | `training.test.ts`: `nextThreshold(0/150/204)/sessionXp` = 3/8/15; fronteiras 104/204 exatas; ramp da cauda. |
| 2 — Loop determinístico + cascata | ✅ | Determinismo asserido; cascata de 3 pontos; **cruzamento de zona no meio da sessão** (a parada prova o recomputo). |
| 3 — Ponto livre, teto 99, soma cresce | ✅ | `applyPoint` +1; rejeita 99; soma 136→137 (não é trava de criação). |
| 4 — Anti-hoarding | ✅ | `pointsEarnedTotal` inclui não gastos; 5 guardados cruzam a zona (300→800). |
| 5 — Seams neutros e funcionais | ✅ | speed 200 = dobro; age 50 = metade; combinados 300×50=150; **truncamento** 150×133=199 (floor). |
| 6 — Persistência atômica | ✅ | transação; `FOR UPDATE` serializa; falha → rollback (spend em 99 não consome ponto). |
| 7 — Gasto seguro (OP-11) | ✅ | "sem ponto" e "foco no máximo" → erro genérico; CHECK do banco como rede. |
| 8 — Migration aditiva coexiste | ✅ | `0001` aplica no CI ao lado do world-store. |
| 9 — OPs & gates | ✅ | sem `any`; funções ≤50; arquivos ≤300; guardrail (curva inteira) verde; migration OP-01. |
| 10 — Higiene de teste (serial + FK) | ✅ | `fileParallelism:false` (herdado); `beforeEach` apaga athlete→account. |

---

## Como testar manualmente

```
POSTGRES_PORT=5434 docker compose -f services/world-store/docker-compose.yml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5434/camisa9_dev
npm run db:migrate -w services/player-store   # aplica 0000 + 0001
npm run lint && npm run typecheck && npm test && npm run build   # 168/168
```

---

## Testes automatizados

**25 testes novos**: 21 puros em `packages/player` (curva de 3 zonas, fronteiras, ramp, determinismo, cascata + cruzamento de zona, seams combinados + truncamento, anti-hoarding, `applyPoint` teto 99) + 4 ao vivo em `services/player-store` (depósito persistido, reconciliação com a lib, ganho+gasto atômico, `overall` floor). Total do repo: **168**.

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `packages/player/src/training.ts` (+ constants/types/index) | ~100% | Sim — curva inteira conferida; guardrail verde; cascata e limiar reconferidos por revisão adversarial. |
| `services/player-store/src/store/training-repo.ts` | ~100% | Sim — transação + `FOR UPDATE` (hardening da revisão); OP-11; delega a curva à lib pura (OP-17). |
| Migration `0001` + schema `free_points` | ~100% (kit, revisado) | Sim — aditiva, CHECK ≥ 0. |
| Testes (25 cenários) | ~100% | Sim — 168/168; +4 testes vindos da revisão adversarial. |
| Docs (`SPEC/DONE-017`, design record, `CLAUDE.md`, `roadmap.md`) | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim — **refinamentos de mecanismo** (documentados abaixo) + **hardening/testes vindos da revisão adversarial** (row lock + 4 testes).

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **Curva inteira/piecewise** (não exponencial) | `nextThreshold` é step por zona + ramp linear na cauda. | O guardrail proíbe `exp`/`pow` em `packages/*/src`. Mesmo feeling escalonado, determinístico. (Já sinalizado e aprovado na SPEC.) |
| **`applyPoint` nova** (não reusa `allocateAttributes`) | Primitiva de gasto própria (+1, teto 99). | `allocateAttributes` é trava de criação (soma===136); o treino cresce a soma. (Já sinalizado na SPEC.) |
| **`SELECT … FOR UPDATE` no `loadActive`** | Adicionado após a revisão adversarial. | Sem o lock, dois `applyTraining`/`spendFreePoint` simultâneos perderiam um depósito/ponto (lost update sob READ COMMITTED). Uma linha, mesmo padrão de integridade do publicador de rodada (SPEC-014/015). Latente hoje (superfície HTTP adiada), corrigido antes de ela chegar. |
| **+4 testes** (cruzamento de zona, seams combinados, truncamento, `overall` floor) | Adicionados após a revisão. | Cobrir os caminhos que a revisão apontou como não exercitados. |

**Protocolo de conflito:** não acionado por escopo/OP. **PORÉM** ver a tensão de calibração abaixo — sinalizada ao founder (não é bug de código; é decisão de valores).

---

## ⚠️ Tensão de calibração — DECISÃO DO FOUNDER PENDENTE

A revisão adversarial apontou (e eu confirmei) que os **dois alvos de calibração do design record são mutuamente incompatíveis**:

- **Os ritmos por ponto** (~3 / ~8 / ~15+ treinos/ponto) — o que implementei e testei (co-desenhados).
- **A frase "carreira dedicada (~440 treinos) chega perto de elite (~85 overall)"** — **não** se sustenta com esses ritmos.

**Os números honestos com a calibração atual** (`sessionXp 100`, limiares 300/800/1500):
- Chegar a **overall 85** custa **312 + 800 = 1112 treinos** (~1,5 carreiras).
- Uma **carreira inteira (~720 treinos)** chega a **overall ~72**.
- Uma **janela de pico (~440 treinos)** chega a **~64**.
- Um **99 num foco isolado** (especialista) sai em **~195 treinos** (~5 temporadas) — o "99 barato" que o founder aceitou no Model A.

**Interpretação:** o overall 85+ vira um grind **de lenda** (multi-carreira), não um teto de uma carreira. Isso pode ser **exatamente** o tom certo para "da várzea às lendas / carreiras que terminam e viram lendas permanentes" — ou pode ser mais lento do que o founder quis.

**A decisão é do founder (é tunável, zero mudança de lógica):**
- **(A) Manter** — a subida é longa e o 85+ é lendário; corrige-se só a frase do design record. **(Recomendado — coerente com a tese.)**
- **(B) Rebalancear** — baixar os limiares (ex. zona 2 de 800→~400) para uma carreira de pico chegar a ~85. Muda só os tunáveis de `TRAINING` + os números esperados nos testes de ritmo.

*Registrado aqui e no meu resumo ao founder; a escolha pode ser feita antes do merge (ainda sou dev, card em `qa_data`).*

---

## Limitações conhecidas

- **Sem gatilho diário / scheduler / UI / rota HTTP** — o treino é uma função; quem/quando dispara é orquestração futura.
- **FOCO do dia = seam neutro** (todos 100) — diferenciar o efeito do foco + acoplar Forma/Moral é fatia futura.
- **DLC e idade = seams neutros** — implementação real adiada (monetização / card 21).
- **Concorrência:** o `FOR UPDATE` serializa; não há teste de concorrência determinístico (latente — sem chamador concorrente até a superfície HTTP). Deferido, coerente com a severidade minor/latente.

---

## Checklist de entrega

- [x] Critérios de aceitação verificados (10/10)
- [x] Testes passando (168/168)
- [x] Typecheck/lint/build limpos
- [x] Revisão adversarial rodada; achados confirmados corrigidos (row lock + 4 testes)
- [x] Nenhum `any`/segredo/log de debug; erros genéricos (OP-11)
- [x] AI Declaration preenchida
- [x] `CLAUDE.md` "Estado atual" atualizado (SPEC-017)
- [x] **Tensão de calibração sinalizada ao founder** (decisão pendente, não-bloqueante)

---

*DONE-017 — método H1VE. A segunda feature da Fase 1: a evolução. A barra de treino → +1 ponto livre nos 4 focos (Model A), curva de 3 zonas inteira, seams neutros de DLC/idade. Lib pura + serviço isolado, transação com FOR UPDATE. Revisão adversarial: 4 achados minor/nit corrigidos. Calibração honesta documentada — a decisão de ritmo é do founder.*
