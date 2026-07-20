# DONE-037 — Camada HTTP e sessão (`services/api`)

> Registro de conclusão (par da `SPEC-037`). Nenhum PR é válido sem este DONE publicado no card.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-037 (par da SPEC-037) |
| **Feature** | Camada HTTP e sessão — **card 1 de 4** do card "Faixa: a vida no CT" |
| **Roadmap item** | **0.4 — baseline de segurança** (1ª fatia; o item fica 🚧, não ✅) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/faixa-a-vida-no-ct` |
| **Concluída em** | 2026-07-20 |
| **Status** | **CONCLUÍDA — aguardando review/merge do architect** |

⚠️ **O card conserva o nome/appetite originais** ("Faixa: a vida no CT", 14d) — a ferramenta não permite renomear. O re-shape em 4 cards FOI feito (cards 2-4 criados, dependências wiradas: 2→1, 3→1, 4→{2,3,número-da-camisa}); **a SPEC-037 é a fonte de verdade do escopo deste card**, não o título nem a descrição, que ficaram do shape antigo (inclusive o "fôlego", que a Decisão 1 corrige: são DUAS barras).

---

## Resumo do que foi feito

**O projeto ganhou a primeira superfície que ESCUTA numa porta.** Até aqui o motor estava completo (36 SPECs — o mundo vira sozinho às 15h, humanos com carreira, economia, lesões, forma/moral, transferências, waiting-list) mas **nada disso era alcançável de fora do processo**: o único artefato que rodava era um worker de cron. Entregue sozinho, este card já é útil ponta a ponta — uma conta criada por script de operador loga, recebe um token revogável e desloga.

### `services/api` — o workspace novo (zero dep nova)

- **`node:http` puro atrás do seam `RouteCtx`**: o handler **nunca vê `req`/`res`** — recebe `{method, path, query, body, ip, epochMs, authorization}` e devolve `RouteResult`. Trocar o transporte num card futuro toca **um arquivo** (`server.ts`) e **zero handler** (o instinto do `modulate?` da SPEC-029). Alternativas descartadas no ADR-003: `hono` (+2 deps e uma 2ª gramática de contrato), `fastify`/`express` (~30 deps transitivas).
- **Rotas:** `GET /healthz` (⚠️ **não toca o banco** — com o autosuspend da Neon, um health que consultasse Postgres reiniciaria o container em loop no cold-start) · `POST /v1/auth/login` · `POST /v1/auth/logout`. Rota desconhecida → **404 `not_found`** (adição declarada: a SPEC não especificava o caso não-mapeado).
- **`respond.ts` é o ÚNICO serializador** (OP-11): nunca propaga `err.message`; throw inesperado vira `500 internal` + `requestId` só no log. **`Cache-Control: no-store` é o DEFAULT** em toda resposta — única exceção `GET /healthz`, e o opt-out é chaveado por **método+path** (só pelo path, um `POST /healthz` sairia cacheável).
- **Rate limit** de janela fixa, in-process: `/v1/auth/*` por **IP (10/min)** no despacho por prefixo + **e-mail normalizado + IP (5/min)** no login.
- **Transporte:** body cap 8 KiB (drena e descarta o excedente — memória plana), `requestTimeout` 10s, `headersTimeout` 8s, `clientError` tratado, **zero header CORS** (cliente WPF; nenhuma página web lê a resposta).

### Sessão (`player.session`, migration `0010`)

Token **opaco** de 256 bits (`randomBytes(32).toString('base64url')`); no banco **só o `sha256hex`** — um dump vazado não vira sessão viva. `Authorization: Bearer`, nunca cookie ⇒ **CSRF não existe por construção**. **TTL absoluto 30d + TTL idle 7d**, ambos no `WHERE` (a decisão é do banco, sem janela de ler-e-decidir); bump de `last_seen_at` throttled a 12h; logout **DELETA** a linha; **cap de 10 sessões vivas por conta**; purga 1×/tick no scheduler, **isolada** (uma concern de auth nunca derruba a rodada das 15h).

### OP-09 imposto pelo TIPO

`requireSession` converte um `AuthedHandler` num `Handler`: a rota protegida é **inalcançável** sem sessão viva — o handler **não roda**, e nenhuma query de domínio é emitida. O `athleteId` vem **exclusivamente** de `readActiveAthlete(session.accountId)`; **nenhuma rota aceita identificador de ator** em path/query/body ⇒ `sdd.md:84` satisfeito por construção, não por checagem.

### Enumeração de contas

Ramo "e-mail não existe" roda `verifyPassword(DUMMY_HASH, senha)` e descarta. O `DUMMY_HASH` tem os **mesmos parâmetros argon2** dos hashes reais (`m=19456,t=2,p=1`) — um dummy divergente tem custo divergente e reabre o oráculo. Cravado por teste **determinístico** (compara os parâmetros), não por medição de latência.

---

## Os 3 bugs que só o Postgres real revelou

O código passou typecheck e ESLint com os três presentes. Rodar de verdade (container local) encontrou:

1. **Dois relógios numa sessão só** — `expires_at` vinha do `nowMs` injetado, mas `created_at`/`last_seen_at` do `defaultNow()` do Postgres. Em produção pareceria idêntico; sob clock skew, idle e teto absoluto divergem — e nenhum teste determinístico consegue provar a expiração. **Fix:** o repo grava os três do `nowMs`.
2. **Violação de OP-09** — JSON malformado respondia **400 no transporte, antes da autenticação**. Um `logout` sem header e com corpo quebrado dava 400 em vez de 401. **Fix:** corpo inválido vira `body: undefined` e segue para o roteador; quem devolve 400 é a validação do handler, **depois** da sessão.
3. **413 virando ECONNRESET** — `destroy()` manda RST e descarta a resposta pendente; `socket.end()` também falha com o cliente ainda escrevendo. **Fix:** drenar e descartar o excedente sem acumular, deixando o cliente terminar.

---

## Revisão adversarial (workflow · 4 lentes · verificador cético)

**20 achados brutos → 13 sobreviventes → 13 corrigidos.** Os MAJOR:

- **Corrida na poda do cap** (*reproduzida ao vivo pela revisão*): `SELECT keep` + `DELETE` em statements separados; em READ COMMITTED cada um tira snapshot novo, então um login **concorrente** da mesma conta ficava visível ao DELETE mas ausente da lista — e era apagado **depois** de o token ter sido entregue com 200. **Fix:** poda num **único statement**, com o SELECT das mantidas como subquery + `ne(id, novo)`.
- **Lockout de conta**: o balde por e-mail era consumido **antes** do `authenticate`, logo contava TENTATIVAS. 5 requests bastavam para a vítima receber 429 **com a senha correta**, renovável indefinidamente — exatamente o que a doutrina da rota diz recusar. **Fix:** chave = par **e-mail + IP**. *Trade-off declarado: ataque distribuído contra uma conta deixa de ser limitado por este balde (sobra o teto de IP); proteção cross-IP exige estado compartilhado = o mesmo card do rate limit distribuído.*
- **`logout` sem teto nenhum**: aceitava `Bearer` de anônimo e emitia um `DELETE` no banco por request, consumindo do pool de 10 conexões. **Fix ESTRUTURAL** — o balde de IP vive no **despacho por prefixo `/v1/auth/*`**, não no handler (foi por morar no handler que a rota nasceu sem teto; agora as rotas de auth dos cards 3 e 4 já nascem limitadas).
- **Map de baldes sem expiração**: chaves controladas pelo cliente (o e-mail) num processo que fica vivo indefinidamente — ~14 mil chaves/dia. **Fix:** varredura de vencidos a cada N chamadas. *(Distinto do débito já declarado, que era sobre restart e >1 instância.)*
- **`clientIp` fail-open**: lista mais curta que `hops` caía no valor **mais à esquerda** — o que o atacante controla. **Fix:** fail-closed no socket.
- **Dois testes meus eram vácuos**: o de "senha/token nunca no log" só exercitava caminhos de sucesso (que não logam nada), e o seam `trustProxyHops` nunca era exercitado ponta-a-ponta. **Fix:** o log agora passa pelo 500; um segundo servidor com `TRUST_PROXY_HOPS=1` fecha o critério 3.
- **A purga no tick não tinha teste** (nem o isolamento que o critério 6 exige). **Fix:** `purgeSessions` exportada + 2 testes (isolamento com db que lança; purga no dia-1-de-produção, que retorna `sem_ancora` — provando o posicionamento antes dos early-returns).

---

## ⚠️ Duas correções ao texto da SPEC (honestidade sobre o que NÃO se provou)

**1. O critério 6 afirma um gate que não existe.** *"Qualquer suíte que apague `account` sem apagar `session` antes falha por FK"* — **falso**: a FK é `ON DELETE CASCADE` (a própria SPEC especificou o cascade na mesma página). Apagar `account` já leva as sessões junto. As 9 edições de `wipeAll` são **higiene, não rede de segurança**, e removê-las deixaria a suíte igualmente verde. Importa porque a próxima tabela-filha pode nascer **sem** cascade e o time confiaria num gate que nunca funcionou.

**2. A lista de suítes da SPEC estava errada.** Ela nomeia `economy-repo`/`decision-repo`/`injury-repo` (que **não** apagam `account`) e **omite `services/transfer/test/transfer.test.ts`**; `world-entry` são **três** arquivos, não um. São 9 arquivos, mas um 9 diferente — verificado por grep, não pela lista.

**3. Lacuna conhecida de teste:** o teste de logins concorrentes é um **smoke de carga, não uma regressão determinística** — verificado revertendo a correção: ele passa **com o bug presente** (`Promise.all` não força a intercalação SELECT→commit→DELETE). O que protege é a **construção** (statement único = snapshot único), reproduzida e validada ao vivo na revisão. Um refactor que volte a partir a poda em dois statements **não seria pego**.

---

## Arquivos

**Novos:** `services/api/` (package.json · tsconfig · Dockerfile · `src/{main,server,router,index}.ts` · `src/http/{types,body,client-ip,respond,rate-limit}.ts` · `src/auth/{session,require}.ts` · `src/routes/{health,login,logout}.ts` · `test/{session,server-auth}.test.ts`) · `services/player-store/src/schema/session.ts` · `src/store/session-repo.ts` · `src/migrations/0010_session.sql` (+`meta/`) · `test/session-repo.test.ts` · `harness/create-account.ts` · `docs/adr/ADR-003-camada-http-e-sessao.md`.

**Editados:** `player-store` (`drizzle.config.ts` — ⚠️ lista explícita de schemas · `schema/index.ts` · `store/auth.ts` export `OPTS` · barrel) · `scheduler/src/daily-tick.ts` (purga isolada no topo, **antes dos 3 early-returns** e **fora do `runCatchUp`**) · `tsconfig.base.json` · `vitest.config.ts` · `package-lock.json` · `.env.example` · **9 suítes** (`session` antes de `account` no `wipeAll`) · docs (`sdd` P5/P5b/P6 · `vision-scope` P8 · `roadmap` P9 · `adr/README` D1 · runbook).

**Intocado (o critério DURO):** `packages/world-engine` inteiro e os **4 goldens** — `git diff` = **0**. A fatia é 100% borda; nenhum arquivo de `packages/*` foi aberto.

---

## Critérios de aceitação — evidência

| # | Critério | Evidência |
|---|---|---|
| 1 | OP-09 pelo tipo + superfície de erro | 4×401 com o espião provando que o handler não rodou; logout sem header + body quebrado → 401; token inexistente → 204; 500 sem vazar `duplicate key`/`constraint`/`player.` |
| 2 | Sessão (TTLs, deslize, logout, cap, hash) | 11 testes; token nunca em claro no banco; **bordas sondadas** nas 3 constantes |
| 3 | Login não enumera; baldes; derivação de IP | respostas byte-idênticas; `DUMMY_HASH` com parâmetros idênticos (teste puro); 11º IP → 429 + `Retry-After`; 6º e-mail → 429; **servidor com `TRUST_PROXY_HOPS=1`**: esquerda do XFF não troca o balde, IPs reais são independentes, atacante não tranca a vítima |
| 4 | Robustez do transporte | 1 MiB → 413 e servidor vivo; JSON truncado → 400 e o próximo 200; `/healthz` com banco morto → 200; `no-store` em tudo salvo `GET /healthz` (incl. `POST /healthz` 404); zero header CORS; senha/token fora do log **no caminho que loga** |
| 5 | Grep-gates estruturais | zero `pg_advisory_lock`/`LISTEN`/`NOTIFY`/`SET SESSION`; handlers/auth transporte-livres; barrel não exporta `main.ts`; nenhuma rota lê id de ator |
| 6 | Migration real + purga isolada | `player.session` criada com os 3 índices (migration vazia reprovaria); purga isolada com db que lança; purga roda no tick `sem_ancora`. ⚠️ **a parte do `wipeAll` está corrigida acima — o gate por FK não existe** |
| 7 | OPs & gates | sem `any`; ≤50/função; ≤300/arquivo; erros genéricos; migration `0010` versionada; segredos só-env; **engine + 4 goldens intocados** |

**529 testes** (467 preservados + 62 novos), typecheck/eslint/build/prettier verdes, **rodados ao vivo contra Postgres real** (container local) — não apenas com as suítes gated puladas.

---

## Escopo deferido (cards e débitos)

- **`readBandState` + `GET /v1/band`** → **SPEC-038** (card 2, já escrita e auditada, aguardando o card ser iniciado).
- **`POST /signup`** com invite-gating/captcha → card próprio (a rota consome vagas NPC **finitas**; contas nascem por `harness/create-account.ts`).
- **Número da camisa** → card próprio; ⚠️ **dependência DURA antes do card 4**.
- **Rate limit distribuído** (>1 instância) · **Steam auth · reset de senha · verificação de e-mail** (exigem o outbox que a SPEC-023 deferiu) · **`statement_timeout` durante a viragem** (⚠️ `SET LOCAL`, nunca `SET SESSION`) · **multi-seed** · **executar o deploy** (ação de ops).
- **Regressão determinística da corrida da poda** — exige instrumentar a transação; registrada como lacuna conhecida acima.

---

## ⚠️ Para o founder (achados colaterais, fora do escopo)

**Dois docs de fundação terminam TRUNCADOS no meio de uma linha** (D2/D3): `docs/projeto/sdd.md` para em *"Regra NUNCA nº 1 auditada"* sem fechar a tabela de riscos, e `docs/projeto/vision-scope.md` em *"toda lógica no"*. Houve perda de conteúdo. **Não inventei o que faltava** — vale um `git log -p` nesses arquivos para recuperar.

**Devolutiva ao designer pendente:** os relógios dos mockups da faixa (01 CT marca 14:38, que pela regra ratificada é `casa`; 02 CASA marca 21:07, 7 min dentro de `vespera`) e — a causa raiz — o `readme` do design system afirma cadência **Ter/Qui/Sáb**, falsa desde o R4 FINAL. Sem corrigir o readme, os próximos mockups nascem com o mesmo drift. **A arte está certa e é aproveitável inteira.**

---

## AI Declaration

Preenchida no card via `submit_ai_declaration`. Autoria: código gerado pela IA (Claude) sob direção do founder; as decisões de design (sessão opaca vs refresh, signup fora, ordem server-first, regra do `dayPhase`, número da camisa) co-desenhadas com o founder; toda a lógica + a revisão adversarial (4 lentes + verificador cético) + os 13 fixes revisados por humano.

---

*DONE-037 — método H1VE. O card 1 de 4 de "Faixa: a vida no CT": a primeira superfície do projeto que escuta numa porta, com sessão opaca revogável e a segurança do 0.4 exercida pela primeira vez. A decisão central é **autorização por CONSTRUÇÃO** — nenhuma rota aceita identificador de ator; o `athleteId` só vem da sessão. Três bugs só apareceram contra Postgres real (dois relógios, OP-09 invertido, 413 resetando) e a revisão adversarial achou mais 13, incluindo uma corrida que apagava a sessão de um login concorrente **depois** de entregá-la. **Engine e os 4 goldens INTOCADOS.***
