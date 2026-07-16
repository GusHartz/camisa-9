# DONE-018 — Cadastro solo/team + código de time (R14): a camada de identidade do quinteto

> Artefato de conclusão obrigatório ao final de qualquer desenvolvimento.
> Pré-requisito para o review do arquiteto.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-018 |
| **SPEC correspondente** | SPEC-018-cadastro-solo-team-codigo-de-time.md |
| **Feature** | Cadastro solo/team + código de time (R14) — o social mínimo do beta |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/cadastro-solo-team-codigo-de-time-r14` |
| **PR** | *pendente* |
| **Desenvolvimento** | 2026-07-16 |
| **Dias vs appetite** | ~1 dia vs 2–3 dias |

---

## Resumo do que foi feito

**O "monte seu quinteto".** O projeto tinha identidade **individual** (SPEC-016 conta+atleta; SPEC-017 evolução) mas **nenhum conceito de grupo**. Agora um humano se cadastra **solo** (fluxo SPEC-016 intacto, `team_id = NULL`) **ou** cria um **time** (nome + camisa própria, recebendo um **código distribuível**) **ou** entra num time com um código, caindo direto no elenco pela **posição** escolhida entre as vagas restantes. O time é um **elenco humano de até 16** (2 GK · 5 DEF · 5 MID · 4 FWD), jogável desde o humano nº 1, com marcos no **11º** (primeiro onze) e **16º** (elenco completo → o código tranca). Padrão H1VE à risca: a **regra é lib pura** (`packages/player`, sob o guardrail); a **persistência + a geração aleatória do código são serviço isolado** (`services/player-store`), atômicos. **Não coloca no mundo** (card 21) — é a identidade pré-mundo.

- **`packages/player` (lib pura):** bloco **`TEAM`** tunável (`squad` espelha `WORLD.squadShape`; `name`/`kit`/`code`/marcos); `team.ts` — `validateTeamName` (reusa o núcleo do `name-filter`), `validateKit` (índices bounded), `validateCodeFormat` (forma + normaliza caixa alta), `isPosition` (**guarda o override de posição** vindo da borda), `slotsRemaining`/`canClaim`/`humanCount`/`milestone`, `createTeam` → `TeamDraft`. **Standalone** (cruza com o engine só no teste).
- **`services/player-store` (serviço):** migration **aditiva `0002`** (OP-01) — tabela `team` (nome, kit jsonb, `code` UNIQUE, capitão FK, `locked`) + `athlete.team_id uuid NULL FK→team`. `team-repo.ts` — `createAccountWithTeam` (transação: conta+time+capitão), `joinTeamWithCode` (**transação com `SELECT … FOR UPDATE`** no `team` — serializa a corrida pela vaga), `lockTeam` (só o capitão), `readTeam` (estado p/ UI/testes), `generateCode` (impuro, aleatório via `node:crypto`, pré-checa unicidade + `UNIQUE` como rede). `player-repo.ts` refatorado para **exportar as peças reusáveis** (`insertAccount`/`insertAthlete` com override de posição+`teamId`/`normalizeEmail`/`isUniqueViolation`/`Tx`); `createAccountWithAthlete` (solo) **inalterado**.

**Verificação:** `typecheck` ✅ · `eslint` ✅ (guardrail cobre `packages/player`) · `build` ✅ · prettier LF-clean ✅ · **`test` 197/197** com `DATABASE_URL` (168 preservados + **14 puros** + **15 ao vivo**); sem DB, 143 rodam e os ao vivo pulam. `world-engine`/`world-store` **intocados**; nenhum golden regenerado (`git diff` = 0). **Revisão adversarial** (3 dimensões — concorrência/atomicidade, OP/escopo, cobertura de teste — cada achado verificado): a concorrência (`FOR UPDATE`, auto-lock, rollback, auth) foi **confirmada correta**; achados acionados → **guarda de posição** (lib+store) + **teste de atomicidade real** (o antigo falhava antes do time ser inserido — vacuidade pega pela revisão) + 5 testes ao vivo de cobertura (corrida pela 16ª vaga, e-mail duplicado no join, código em caixa baixa, códigos distintos, override de posição inválido).

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `packages/player/src/team.ts` | Regra pura: validações + slots + marcos + `isPosition` + `createTeam`. |
| `packages/player/src/team.test.ts` | 14 testes puros (nome/camisa/código, slots por posição, marcos, `isPosition`, cross-check `squad` vs `WORLD.squadShape`). |
| `services/player-store/src/schema/team.ts` | Tabela `team` (schema `player`). |
| `services/player-store/src/store/team-repo.ts` | create/join/lock/read + `generateCode` (transação + `FOR UPDATE`). |
| `services/player-store/src/migrations/0002_team_r14.sql` (+ meta) | Migration aditiva (OP-01): `team` + `athlete.team_id`. |
| `services/player-store/test/team-repo.test.ts` | 15 testes ao vivo (bifurcação, código, slots, marcos, concorrência, lock, atomicidade). |
| `specs/SPEC-018-*.md`, `specs/DONE-018-*.md` | SPEC (aprovada) + este documento. |

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `packages/player/src/constants.ts` | +bloco `TEAM` (squad/nome/kit/código/marcos). |
| `packages/player/src/name-filter.ts` | Extrai o núcleo reusável `validateNameWith` (atleta + time compartilham a blocklist). |
| `packages/player/src/types.ts` | +`Kit`/`TeamDraft`/`ClaimedByPosition`. |
| `packages/player/src/index.ts` | +exports de `team.ts` + `TEAM` + `isPosition`. |
| `services/player-store/src/schema/athlete.ts` | +coluna `team_id` (FK→team, NULL = solo). |
| `services/player-store/src/schema/index.ts` | +export `team` (antes de `athlete`, ordem de FK). |
| `services/player-store/src/store/player-repo.ts` | Exporta `Tx`/`insertAccount`/`insertAthlete`(+override posição/`teamId`)/`normalizeEmail`/`isUniqueViolation`. |
| `services/player-store/src/index.ts` | +exports do `team-repo`. |
| `services/player-store/drizzle.config.ts` | +`team.ts` no schema glob (necessário p/ gerar a migration; **não constava na tabela da SPEC** — ver Desvios). |
| `CLAUDE.md`, `docs/projeto/roadmap.md` | "Estado atual" + SPEC-018 (item 2.6). |

**Intocado:** `packages/world-engine`, `services/world-store`, todos os goldens, migration `0000`/`0001`, `createAccountWithAthlete` (solo). **CI sem mudança** (o passo de migrate do `player-store` já aplica o `0002`).

---

## Mudanças de schema aplicadas

Migration **`0002_team_r14.sql`** (OP-01, gerada por `drizzle-kit`): `CREATE TABLE player.team` (id uuid PK, name, kit jsonb, code text UNIQUE, captain_account_id FK→account, locked bool default false, created_at) + `ALTER TABLE player.athlete ADD COLUMN team_id uuid` (**nullable**) + as 2 FKs. **Aditiva** (zero downtime; solos existentes ficam `team_id = NULL`), aplica sobre `0000`+`0001` num DB limpo, ao lado do world-store (`public`/`drizzle`), sem colisão. Tracking em `drizzle_player`.

## Mudanças de API entregues

- **`@camisa-9/player`** (+): `TEAM`, `validateTeamName`, `validateKit`, `validateCodeFormat`, `isPosition`, `slotsRemaining`, `canClaim`, `humanCount`, `milestone`, `createTeam`; tipos `Kit`/`TeamDraft`/`ClaimedByPosition`.
- **`@camisa-9/player-store`** (+): `createAccountWithTeam`, `joinTeamWithCode`, `lockTeam`, `readTeam`; tipos `CreateTeamInput`/`CreateTeamResult`/`JoinTeamInput`/`JoinTeamResult`/`TeamView`. (E as peças reusáveis do `player-repo`, para o `team-repo` compor sem duplicar a lógica da SPEC-016.)
- `world-engine`/`world-store` inalterados.

---

## Critérios de aceitação

| Critério (SPEC-018) | Status | Evidência |
|---|---|---|
| 1 — Bifurcação solo/team-create/team-join | ✅ | `team-repo.test`: solo `team_id` NULL; capitão carrega `team_id`; join entra. |
| 2 — Código distribuível (único, sem ambíguos, caixa alta) | ✅ | `generateCode` + `freeCode` pré-checa + `UNIQUE`; teste de códigos distintos + join/read em caixa baixa; `validateCodeFormat` puro. |
| 3 — Roster de 16 por posição (`canClaim`) | ✅ | 3º GK → "posição sem vaga" (live); 6º DEF `canClaim=false` (puro). |
| 4 — Marcos 11/16 + tranca no 16 | ✅ | milestone null<11 → primeiro_onze(11, `locked=false`) → elenco_completo(16, `locked=true`); 17º barrado. |
| 5 — Camisa própria (`validateTeamName` + `validateKit`) | ✅ | Puro: charset/blocklist/normalização; kit índices bounded. |
| 6 — Persistência atômica + concorrência (`FOR UPDATE`) | ✅ | Corrida pela última vaga **e** pela 16ª: exatamente 1 entra, cap nunca estoura; **atomicidade real** (falha pós-insert do time → account+team revertidos). |
| 7 — Tranca (só capitão) | ✅ | Positivo (capitão tranca → join barrado) + negativo (não-capitão → "operação não permitida"). |
| 8 — Standalone (sem FK ao mundo) | ✅ | `team`→`account`; `athlete.team_id`→`team`; zero FK ao world-store (schema). |
| 9 — Cross-check de forma | ✅ | `TEAM.squad` deep-equal a `WORLD.squadShape` (teste cruza o engine). |
| 10 — OPs & gates | ✅ | sem `any`; funções ≤50; arquivos ≤300 (team-repo 260); OP-11; migration OP-01; guardrail (aleatório só no serviço) verde. |

---

## Como testar manualmente

```
POSTGRES_PORT=5434 docker compose -f services/world-store/docker-compose.yml up -d
export DATABASE_URL=postgres://postgres:postgres@localhost:5434/camisa9_dev
npm run db:migrate -w services/player-store   # aplica 0000 + 0001 + 0002
npm run lint && npm run typecheck && npm test && npm run build   # 197/197
```

---

## Testes automatizados

**29 testes novos**: 14 puros em `packages/player` (nome/camisa/código, slots por posição incl. 6º DEF, marcos das faixas 11/16, `isPosition`, `createTeam` com posição inválida, cross-check da forma) + 15 ao vivo em `services/player-store` (bifurcação, código bem-formado, caixa baixa, códigos distintos, vaga descontada, posição cheia, marcos + auto-lock + 17º barrado, **corrida pela última vaga**, **corrida pela 16ª vaga**, lock capitão/não-capitão, código inválido/inexistente, **e-mail duplicado no create e no join**, **override de posição inválido**, **atomicidade real pós-insert do time**). Total do repo: **197** (143 sem `DATABASE_URL`).

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `packages/player/src/team.ts` (+ constants/types/index/name-filter) | ~100% | Sim — regra pura; guardrail verde; `isPosition` conferido; blocklist reusada sem duplicar. |
| `services/player-store/src/store/team-repo.ts` (+ player-repo refactor) | ~100% | Sim — transação + `FOR UPDATE` na corrida; OP-11; delega a regra à lib pura (OP-17); serialização confirmada pela revisão. |
| Migration `0002` + schema `team`/`athlete.team_id` | ~100% (kit, revisado) | Sim — aditiva, nullable, zero FK ao mundo. |
| Testes (29 cenários) | ~100% | Sim — 197/197; +6 cenários vindos da revisão adversarial. |
| Docs (`SPEC/DONE-018`, `CLAUDE.md`, `roadmap.md`) | ~100% | Sim. |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim — **hardening/testes vindos da revisão adversarial** (guarda de posição + teste de atomicidade real + 5 testes de cobertura) e **refinamentos de mecanismo** (documentados abaixo).

---

## Desvios em relação à SPEC

| Item | O que foi feito | Motivo |
|---|---|---|
| **`drizzle.config.ts` tocado** (fora da tabela da SPEC) | +`team.ts` no schema glob. | Necessário para o `drizzle-kit` gerar a `0002`. Omissão da tabela de arquivos, não escopo — registrado aqui. |
| **Peças do `player-repo` exportadas** (não um novo módulo) | `insertAccount`/`insertAthlete`/etc. viraram exports reusados pelo `team-repo`. | Uma fonte de verdade para a criação de conta+atleta (SPEC-016); o `team-repo` compõe sem duplicar. |
| **`isPosition` (guarda de override) — lib + store** | Adicionado após a revisão de concorrência. | O `Position` é só compile-time; a coluna `position` não tem CHECK. Um override inválido (via futura borda HTTP/JSON) subcontaria vagas (17º corpo) e faria `readTeam` estourar. Guarda pura barra na criação e no join — **autoridade server-side** (charter), forward-safe. Latente hoje (sem HTTP), fechado antes. |
| **Teste de atomicidade real** (substitui a vacuidade) | O teste de rollback do create agora falha **depois** do time inserido (CHECK do atleta) → prova account+team revertidos. | A revisão pegou que o teste de e-mail duplicado falhava no **1º** statement (antes do time) → passaria mesmo **sem** transação. Novo teste exercita o rollback de verdade. |
| **+5 testes ao vivo** (corrida 16ª vaga, dup-email no join, caixa baixa, códigos distintos, posição inválida) | Cobertura apontada pela revisão como ausente. | Fechar os caminhos não exercitados (o cap de 16 sob corrida, o join path do dup-email, a normalização na borda viva). |

**Protocolo de conflito:** não acionado (escopo/OPs respeitados; mundo fora por decisão travada).

---

## Limitações conhecidas

- **Não coloca no mundo** — fundar clube / ocupar vaga NPC no snapshot é o **card 21** (+ Fatia 3 da 0.2). Esta fatia é identidade pré-mundo, como a SPEC-016 fez com o atleta.
- **Sem rota HTTP / login-sessão / Steam auth / verificação de e-mail** — a superfície de borda é fatia futura; os fluxos aqui são funções de serviço. (A guarda de `isPosition` já antecipa essa borda não-confiável.)
- **`generateCode` → e-mail já em uso (edge cosmético):** numa colisão de código **freak** (≈1 em 8,5×10⁸, após 8 pré-checagens) o `INSERT` do time dispararia `UNIQUE` e o `toDomainError` a rotularia como "e-mail já em uso". OP-11-safe (mensagem genérica, zero vazamento) e a transação reverte; um fix "robusto" acoplaria ao nome do constraint do Drizzle (frágil). **Decisão: documentar, não corrigir** (as duas revisões concordaram: nit, probabilidade desprezível).
- **`'time cheio'` é backstop defensivo:** o auto-lock nas 16 faz o join bater antes em `'time indisponível'` (a checagem de `locked` precede a de contagem). O ramo fica como defesa-em-profundidade.
- **Contagem por posição não filtra `active`:** hoje não há caminho de desativação de membro; quando carreira-fim/lenda chegar (mundo), rever para um retirado não ocupar vaga. Forward-looking.
- **`lockTeam` é select-then-update (2 statements):** seguro porque `captain_account_id` é imutável (sem caminho de update). Se isso mudar, virar transação.

---

## Checklist de entrega

- [x] Critérios de aceitação verificados (10/10)
- [x] Testes passando (197/197 com DB; 143 sem)
- [x] Typecheck/lint/build limpos; prettier LF-clean
- [x] Revisão adversarial rodada (3 dimensões); concorrência confirmada correta; achados acionados corrigidos (guarda de posição + atomicidade real + 5 testes)
- [x] Nenhum `any`/segredo/log de debug; erros genéricos (OP-11); migration OP-01
- [x] `world-engine`/`world-store` intocados; nenhum golden regenerado
- [x] AI Declaration preenchida
- [x] `CLAUDE.md` "Estado atual" + `roadmap.md` atualizados (SPEC-018)

---

*DONE-018 — método H1VE. O social mínimo do beta: cadastro solo/team + código de time. O quinteto monta seu elenco (nome, camisa própria, 16 vagas por posição, marcos 11/16) via código distribuível — lib pura + serviço isolado, com `FOR UPDATE` na corrida pela vaga. Revisão adversarial: concorrência confirmada correta; guarda de posição + atomicidade real acionadas. Não coloca no mundo (card 21).*
