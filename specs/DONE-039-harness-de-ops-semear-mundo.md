# DONE-039 — Harness de ops: semear mundo + âncora de temporada

> Registro de conclusão (par da `SPEC-039`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-039 (par da SPEC-039) |
| **Feature** | Harness de ops — semear mundo e âncora de temporada — card do board |
| **Roadmap item** | 1.2 (o gatilho de produção) — fecha a cadeia de operação |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/harness-de-ops-semear-mundo-e-ancora-de-temporada` |
| **Concluída em** | 2026-07-20 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

---

## Resumo do que foi feito

Semear um mundo e ancorar a temporada **existiam só dentro de testes**. Agora são dois comandos de operador, e a cadeia de subida está fechada.

- **`harness/seed-world.ts`** — `SEED=… npx tsx harness/seed-world.ts`. Semeia via `writeWorld` e reporta a topologia (divisões/ligas/clubes). ⚠️ **Recusa** rodar numa seed que já tem mundo.
- **`harness/set-anchor.ts`** — `SEED=… START_DATE=YYYY-MM-DD …`. Grava o dia da rodada 1. O operador escreve uma **data**; o `seasonId` é **derivado** do mundo.
- **`harness/ops.ts`** — a lógica (`seedWorldOnce`, `anchorSeason`) separada do `main()`, para ser testável. Os scripts viraram cascas finas.
- **`harness/ops-date.ts`** — a conversão `YYYY-MM-DD → dayIndex`, delegando ao `resolveSlot` do engine.
- **`harness/create-account.ts`** — ganhou a pré-checagem de mundo.
- **Runbook** — seção **"Primeira subida: semear o mundo"**, antes das seções de scheduler e API.

---

## As quatro decisões, e por que cada uma

1. **`seasonId` DERIVADO, não perguntado.** Lido do mundo via `readWorld`. Um parâmetro a menos para errar e **impossível ancorar a temporada errada**.
2. **A DATA, nunca o `dayIndex`.** O operador escreve `2026-08-01`; a conversão monta as 15h BRT daquele dia e passa por **`resolveSlot`** (`anchor.ts:22`). ⚠️ A aritmética de fuso **não foi reimplementada** — se divergisse, o mundo jogaria num dia e o tick esperaria outro.
3. **Semear NUNCA sobrescreve.** A checagem acontece **antes de qualquer escrita**; não existe `--force`. É a operação mais destrutiva do repo (apagaria clubes, elencos, ocupações humanas e rodadas publicadas) e não pode caber num typo de terminal.
4. **`create-account` falha cedo e útil.** Antes, sem mundo, o operador recebia `Failed query: insert into "waiting_list"…` — SQL cru, sem pista — **e com a conta já criada**, porque a falha vinha depois. Agora a pré-checagem nomeia a seed, dá o comando seguinte e **não deixa conta órfã**.

---

## Verificação

**A guarda foi provada por reversão.** Desativei a pré-checagem de `seedWorldOnce` e rodei: os dois testes **falharam** — o segundo `seedWorldOnce` estourou com `Failed query: insert into "world"…` (PK duplicada, SQL cru). O teste protege o que diz proteger. *(Disciplina adotada depois da SPEC-037, onde um teste de concorrência passava com o bug presente.)*

**A cadeia inteira foi EXECUTADA num banco limpo** (`camisa9_e2e`, criado do zero) — o critério 5, que é o cenário que falhou quando o founder perguntou se dava para ver o jogo funcionando:

```
1. migrate (world + player)      → migrations aplicadas
2. seed-world  SEED=beta-001     → 4 divisões, 4 ligas, 80 clubes
3. set-anchor  START_DATE=2026-07-20 → dayIndex=20654
4. create-account                → ADMITIDO no mundo
5. o tick                        → status=published dias=1 humanos=1 pagos=1 decisões=4
```

E o estado do jogador depois de um dia de mundo:

```
    jogador    | saldo | forma | moral | decisoes
---------------+-------+-------+-------+----------
 Gustavo Hartz |   307 |    50 |    50 |        4
```

**307 de saldo** = salário da rodada + prêmio pelo resultado real do clube; **40 partidas publicadas** (4 divisões × 10).

---

## Decisão de implementação registrada (a SPEC deixou em aberto)

**`harness/` NÃO estava no `include` do vitest** — o risco que a SPEC classificou como **Alta probabilidade** ("teste escrito que nunca roda"). **Resolvido estendendo o `include`** com `harness/**/*.test.ts`, em vez de mover o teste. Razão: os scripts de operador passaram a ter lógica de verdade (a guarda e a conversão de data), e o `harness/` já tinha outros artefatos que ninguém testava. O `tsconfig.typecheck.json` já cobria a pasta por glob — só o vitest não.

---

## Arquivos

**Novos:** `harness/seed-world.ts` · `harness/set-anchor.ts` · `harness/ops.ts` · `harness/ops-date.ts` · `harness/ops.test.ts` · `harness/ops-date.test.ts`.

**Editados:** `harness/create-account.ts` (pré-checagem) · `vitest.config.ts` (`include` + `harness/**`) · `docs/ops/scheduler-deploy-runbook.md` (seção "Primeira subida").

**Intocado:** `packages/world-engine`, `packages/player` e os **4 goldens** (`git diff` = **0**); **`services/*` inteiro**. **Nenhuma migration** — os scripts só consomem funções de escrita que já existiam.

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | Semear funciona e reporta | ao vivo: 4 divisões / 4 ligas / 80 clubes; `readWorld` passa a devolver o estado |
| 2 | **Semear 2× não destrói** | ao vivo: falha com `OpsError`, e `seasonId` + contagem de clubes/atletas + o `WorldState` inteiro ficam **idênticos**. **Provado por reversão** (sem a guarda, o teste falha) |
| 3 | Data → `dayIndex` | puro: bate com `resolveSlot` em 4 datas; dias consecutivos → `dayIndex` consecutivo (incl. virada de mês, de ano e **bissexto**); 7 formatos ruins e 5 datas **inexistentes** (`2026-02-30`, `2027-02-29`) recusados |
| 4 | Âncora exige mundo e deriva o `seasonId` | ao vivo: sem mundo → falha apontando `seed-world` **e não grava**; com mundo → `readSeasonAnchor` devolve o `dayIndex` reportado, e o operador nunca informou o `seasonId` |
| 5 | **Cadeia completa num banco limpo** | **executada de verdade** (acima), não só testada |
| 6 | `create-account` sem mundo é acionável | a mensagem nomeia a seed e manda rodar o `seed-world`; nenhum SQL cru; nenhuma conta órfã |
| 7 | OPs & gates | sem `any`; ≤50/função; ≤300/arquivo; segredos só-env; lint/typecheck/build/test/prettier verdes; **engine e os 4 goldens intocados**; **sem migration** |

**540 testes** (529 preservados + 11 novos: 5 puros de data + 6 ao vivo de ops).

---

## Escopo deferido

- **Multi-seed** (semear vários mundos) · **`--force`/sobrescrever** (deliberadamente ausente) · **apagar mundo / resetar temporada** (card próprio, com muito mais cuidado) · **semear contas em lote** · **UI de ops** (o painel de auditoria é o roadmap 1.5).
- **Executar o deploy** — continua ação de ops do founder. Esta fatia só **removeu o bloqueio**.

---

## ⚠️ Para o founder

**A prioridade do card ficou `LOW`; eu argumentaria ALTA** — esta fatia bloqueava o deploy (sem mundo semeado, o container sobe e o tick devolve `sem_ancora` para sempre). Registrado na SPEC como nota, sem mudar o card.

**Drift de template no repo:** as SPECs **032, 036 e 037** não têm as seções obrigatórias `Mudanças de schema` e `Mudanças de API`, nem os campos `Aprovada em`/`Aprovada por`, nem a coluna `Probabilidade` nos riscos — e a 037 foi mergeada assim. A SPEC-039 foi corrigida para o template completo. Vale decidir: **corrigir o template** (se as seções viraram ruído) ou **corrigir a prática** (um gate de CI validando os headings seria barato).

---

## AI Declaration

Preenchida no card via `submit_ai_declaration`. **100% do código gerado pela IA** (Claude), sob direção do founder. **O founder decidiu**: as 4 decisões de desenho (`seasonId` derivado, data em vez de `dayIndex`, semear não sobrescreve, pré-checagem no `create-account`) e a aprovação da SPEC. ⚠️ **Não houve revisão humana do código** — a verificação é: 540 testes (a guarda **provada por reversão**), os gates, e a execução real da cadeia num banco limpo. O review do architect é o primeiro olho humano.

---

*DONE-039 — método H1VE. Semear o mundo e ancorar a temporada saem de dentro dos testes e viram dois comandos documentados. O buraco não veio de análise: veio de tentar rodar o jogo ponta a ponta e o script de operador da SPEC-037 falhar com SQL cru por falta de mundo. As decisões que importam: o operador escreve uma **data** (traduzida pelo `resolveSlot` do engine, sem reimplementar fuso), o `seasonId` é **derivado**, e semear **nunca sobrescreve** — provado por reversão. A cadeia completa foi executada num banco limpo: o mundo jogou, e o jogador terminou o dia com 307 de saldo e 4 decisões esperando.*
