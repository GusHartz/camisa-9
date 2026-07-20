# ADR-003 — Camada HTTP e sessão: `node:http` puro + sessão opaca server-side

| Campo | Valor |
|---|---|
| **Status** | ✅ **Aceito / Ratificado** |
| **Data** | 2026-07-20 |
| **Decisor** | Gustavo Hartz (founder / architect) |
| **SPEC** | SPEC-037 — Camada HTTP e sessão (`services/api`) — card 1 de 4 de "Faixa: a vida no CT" |
| **Evidência** | Suíte ao vivo da SPEC-037 (516 testes verdes: OP-09 pelo tipo, TTLs, cap de sessões, enumeração por timing, baldes de rate limit, robustez do transporte) |
| **Substitui** | SDD §"Autenticação" — `sdd.md:80` (item **ratificado** que pedia *"tokens de curta duração + refresh"*) + `sdd.md:81` (`[SUPOSIÇÃO]` JWT × sessão server-side) |
| **Escopo** | A borda HTTP (servidor). Não toca a lógica pura (`packages/*`, OP-17), o world-store nem os 4 goldens. |
| **Relaciona** | ADR-002 (a API roda no endpoint **pooled** ⇒ só locks xact-scoped) · SPEC-022/023 (revogação como requisito funcional) · SPEC-038 (`GET /v1/band`, o primeiro consumidor) |

---

## Decisão

Registramos **duas** decisões, tomadas juntas porque a segunda depende do orçamento de dependências da primeira.

### Decisão A — Stack HTTP: `node:http` puro atrás do seam `RouteCtx`

**Ratificamos `node:http` puro** como o transporte de `services/api`, **zero dependência nova**, atrás de um **seam de transporte**: o handler **nunca vê `req`/`res`** — recebe um `RouteCtx { method, path, query, body, ip, epochMs }` e devolve um `RouteResult`.

### Decisão B — Sessão opaca server-side, **sem** par access/refresh

**Ratificamos a sessão opaca hasheada em `player.session`** (migration `0010_session`) como o mecanismo de autenticação: token de **256 bits** (`randomBytes(32).toString('base64url')`), em repouso **apenas `sha256hex(token)`**, transportado em `Authorization: Bearer` (**nunca cookie** ⇒ CSRF não existe por construção), com **TTL absoluto de 30 dias**, **TTL idle de 7 dias**, bump de `last_seen_at` throttled a 12h, **logout deleta a linha**, **cap de 10 sessões vivas por conta** e purga das vencidas 1× por tick do scheduler.

**Sem par access/refresh — por decisão, não por omissão.**

Ambas são decisões **reversíveis** de camada de borda (ver *Reversibilidade*).

---

## Contexto

Até a SPEC-037 o projeto **não tinha superfície que escutasse numa porta**: 36 SPECs de motor, um worker de cron como única borda, e um grep por HTTP em `packages/ services/ harness/` com **zero** hits. O motor era completo e inalcançável de fora do processo.

Duas restrições moldaram o card:

1. **A credencial de banco nunca sai do servidor** (`sdd.md:93` + OP-12) — ligar o cliente WPF direto ao Postgres estava morto na origem. A API é a **única ponte legítima** entre o cliente e os dois bancos.
2. **A superfície do v1 é minúscula:** `GET /healthz`, `POST /v1/auth/login`, `POST /v1/auth/logout` nesta fatia; `GET /v1/band` na SPEC-038; ~4 rotas de escrita de gameplay no card 3 — cada uma ~15 linhas sobre função já testada.

E uma tensão de âncora: `sdd.md:80` é um item **RATIFICADO** que pedia *"tokens de curta duração + refresh"*, e `sdd.md:81` era um `[SUPOSIÇÃO — revisar]` que deixava JWT e sessão server-side empatados.

---

## Decisão A — `node:http` puro atrás de um seam

### Alternativas consideradas

| Candidato | Custo | Ganho para ESTA superfície | Veredito |
|---|---|---|---|
| **`node:http` puro + seam `RouteCtx`** | escrever router (`switch` em `` `${method} ${pathname}` ``), parse de body, serializador de erro | controle total sobre a superfície de segurança (o `respond.ts` é o **único** serializador de erro, com `no-store` por default) | **ESCOLHIDO** |
| **hono** | +2 deps e uma **2ª gramática de contrato** (a do framework) convivendo com o `Result<T>` das libs puras | ergonomia de roteamento — desproporcional para poucas rotas de path exato, sem params | Rejeitado |
| **fastify / express** | ~30 deps transitivas na superfície mais sensível do projeto | plugins/ecossistema que o v1 não consome | Rejeitado — desproporcional |

O repo tem **3 deps de terceiros** no total; a raiz tem 0. Adicionar ~30 pacotes transitivos para servir três rotas contrariava o orçamento de dependências que o projeto sustenta desde a SPEC-001.

### O que torna a escolha reversível

**O handler nunca vê `req`/`res`.** Todo o conhecimento de `node:http` está confinado a `src/http/` + `src/routes/` (grep-gate estrutural no critério 5 da SPEC-037); o handler opera sobre `RouteCtx` e devolve `RouteResult`. Trocar o servidor por hono/fastify num card futuro toca **um arquivo** (`server.ts`) e **zero handler** — é o mesmo instinto do seam `modulate?` da SPEC-029.

### O que foi construído (estado real, não intenção)

- `services/api`: servidor `node:http`, **zero dep nova**; rotas `GET /healthz`, `POST /v1/auth/login`, `POST /v1/auth/logout`; rota desconhecida → `404 not_found`.
- **`respond.ts` é o único serializador de erro** (OP-11): corpo sempre `{ error, code }`, com `code` estável e não-localizável; `Cache-Control: no-store` como **default**, cuja única exceção é `/healthz`.
- **Rate limit in-process**, janela fixa, dois baldes: **IP 10/min** + **e-mail normalizado 5/min**, o mais restritivo vence.
- **Transporte endurecido:** body cap **8 KiB**, `requestTimeout` 10s, `headersTimeout` 8s.
- **CORS: zero header emitido** — o cliente é WPF; sem `Access-Control-Allow-Origin` nenhuma página web lê a resposta. Risco reduzido a custo zero.
- **Derivação de IP normativa:** `clientIp(req, hops)` toma o **n-ésimo valor a partir da DIREITA** de `X-Forwarded-For` (`TRUST_PROXY_HOPS`, default `0` = ignora o header e usa o socket). **Nunca** o valor mais à esquerda — que é escrito pelo cliente e tornaria o limite bypassável.

---

## Decisão B — Sessão opaca server-side, sem refresh

### As três razões (preservadas da Decisão 2 da SPEC-037)

**(a) Revogação é requisito FUNCIONAL aqui, não higiene.** A SPEC-023 reverte a vaga a NPC depois de 30 dias de inatividade; a SPEC-022 encerra a carreira e faz o atleta renascer. Um JWT stateless **não pode ser invalidado** quando o atleta que ele referencia deixa de existir. Com a sessão em tabela, a **linha é o mecanismo**: apagar a linha revoga na hora.

**(b) Zero dependência e UM SEGREDO A MENOS.** JWT exigiria `jose` (+dep) e uma **chave a rotacionar** — segredo novo em ambiente, no CI e no runbook. O token opaco sai de `node:crypto` (precedente: `team-repo.ts`) e o banco guarda só o hash. **Zero segredo novo** é a vantagem concreta desta escolha, e ela casa com o orçamento de deps da Decisão A.

**(c) O par access/refresh existe para COMPENSAR a irrevogabilidade de um token stateless** — é o mecanismo que encurta a janela de dano de um token que não se pode matar. Uma sessão em tabela **não tem essa irrevogabilidade** para compensar; o par seria cerimônia sem função. A "curta duração" que `sdd.md:80` pedia vem do **idle TTL de 7 dias** com renovação deslizante, e a "rotação no logout" vem do **DELETE da linha**.

### ⚠️ Isto CONTRADIZ uma âncora ratificada — e a âncora foi atualizada

`sdd.md:80` é um item **RATIFICADO** que pedia *"tokens de curta duração + refresh"*. A contradição **não foi contornada em silêncio**: subiu explícita ao founder na Decisão 2 da SPEC-037, e o founder **atualizou a âncora em 2026-07-20**.

**A ordem causal importa para a leitura futura:** o patch **P5b** (que reescreve `sdd.md:80`) é **consequência** desta decisão, não o contrário. O ADR é o registro do porquê; o SDD passa a refletir o resultado, apontando para cá — o fluxo descrito em `docs/adr/README.md`.

### Detalhes ratificados junto

- **Enumeração de contas fechada por construção:** no ramo "e-mail não existe" roda-se `verifyPassword(DUMMY_HASH, senha)` e descarta-se o resultado. O `DUMMY_HASH` tem os **mesmos parâmetros argon2** dos hashes reais (`m=19456, t=2, p=1`) — um dummy com parâmetros divergentes tem custo divergente e **reabriria** a enumeração por timing. Não é segredo.
- **OP-09 imposto pelo TIPO:** `requireSession` converte um `AuthedHandler` em `Handler`; uma rota protegida é **inalcançável** sem sessão viva — o handler **não roda**. E o `athleteId` vem **sempre** de `readActiveAthlete(session.accountId)`, **nunca** de path, query ou body ⇒ *"o ator só age sobre os próprios atletas"* (`sdd.md:84`) é satisfeito por construção, não por checagem que alguém pode esquecer.

### Linha normativa de cliente (requisito que esta decisão cria)

> **O cliente persiste o token via DPAPI (`ProtectedData`, escopo `CurrentUser`) ou Credential Manager — nunca arquivo plano. Requisito de aceite do card 4 (o cliente WPF).**

Um token opaco de 30 dias em `%APPDATA%\token.txt` anularia o ganho de guardar só o hash no servidor.

---

## Consequências

**Positivas**
- Primeira superfície de entrada do projeto **com o baseline 0.4 exercido de fato**: OP-09 pelo tipo, OP-11 num único serializador, segredos só-env.
- **Zero dep nova e zero segredo novo** — a superfície mais sensível do projeto não herdou árvore transitiva de terceiros.
- Revogação real: expirar vaga (SPEC-023) ou encerrar carreira (SPEC-022) mata as sessões correspondentes.
- Aditiva e **desligável**: parar o container remove a superfície inteira sem tocar mundo, motor ou tick.

**Negativas / custos aceitos**
- **O rate limit in-process não sobrevive a mais de uma instância** (nem a um restart). Aceito nesta fatia; **gatilho de revisão declarado: >1 instância** ⇒ limitador compartilhado (card próprio).
- **Um poll a cada request** custa um `SELECT` por `token_hash` (indexado, único) — o preço de ser revogável, contra a validação puramente local do JWT. Mitigado pelo bump de `last_seen_at` throttled a 12h, que evita 1.440 `UPDATE`s/dia/conta.
- **`POST /signup` fica fora** (Decisão 3 da SPEC-037: endpoint não-autenticado que escreve no mundo consome vagas NPC finitas). Custo pago com um script de operador — contas nascem por `harness/create-account.ts`.

**Requisitos que esta decisão cria**
- **Cliente (card 4):** persistir o token via DPAPI/Credential Manager — requisito de aceite.
- **Operacional:** a API roda no endpoint **pooled** da Neon ⇒ vale integralmente o invariante do **ADR-002:57** — **zero lock de sessão** (`pg_advisory_lock`, `LISTEN/NOTIFY`, `SET SESSION`); só `_xact_`. É grep-gate no critério 5 da SPEC-037.
- **Purga de sessões** vive no tick diário, **isolada em try/catch**: auth nunca derruba a rodada das 15h.

---

## Lições de implementação (bugs reais, pegos pelos testes ao vivo)

Registradas porque generalizam além desta fatia:

1. **Dois relógios na mesma linha.** `expires_at` vinha do `nowMs` injetado, mas `created_at`/`last_seen_at` vinham do `defaultNow()` do Postgres — dois relógios numa entidade cujos TTLs são relativos entre si. **Corrigido:** o repo grava os três a partir do `nowMs` injetado. *Regra: numa borda com tempo injetado, o default do banco é uma segunda fonte de verdade silenciosa.*
2. **Violação de OP-09 pelo transporte.** JSON malformado respondia **400 no transporte, antes da autenticação** — invertendo a ordem `auth → authz → input`. **Corrigido:** body inválido vira `body: undefined` e a validação do handler (**pós-auth**) devolve o 400. *Regra: o transporte não valida conteúdo; só entrega.*
3. **413 virava `ECONNRESET`.** `destroy()` manda RST e o cliente descarta a resposta já escrita — o 413 nunca era lido. **Corrigido:** **drenar e descartar** o excedente sem acumular (memória plana), deixando o cliente terminar de escrever.

---

## Reversibilidade & gatilhos de revisão

**Reversível** — camada de borda (OP-17), aditiva e desligável; a migration `0010` é aditiva.

- **Decisão A:** reverter custa **um arquivo** (`server.ts`), zero handler — o seam `RouteCtx` é a garantia.
- **Decisão B:** reverter para JWT custa a introdução de `jose` + uma chave a rotacionar, e **reabre** o problema (a) — por isso o gatilho abaixo é estreito.

**O que reverteria/revisaria:**
- **>1 instância da API** → o rate limit in-process deixa de valer (gatilho já declarado) e um cache/limitador compartilhado entra em cena.
- O `SELECT` de sessão por request virar gargalo medido → cache curto do resolve (não JWT), preservando a revogação.
- Um consumidor **federado** (Steam auth, serviço terceiro) exigir token verificável sem consultar o banco → rever B **só para esse consumidor**, mantendo a sessão opaca para o cliente próprio.
- A superfície de rotas crescer a ponto de o router `switch` doer (params, versionamento, validação declarativa) → rever A, trocando `server.ts` por um framework.

---

## Referências

- **SPEC-037 / DONE-037** — `specs/SPEC-037-camada-http-e-sessao.md` (Decisões travadas, seção *Segurança*, patches de docs).
- **ADR-002** — `docs/adr/ADR-002-neon-persistencia-prod.md` (§ invariante xact-lock, linha 57 — a API roda no pooled).
- **SDD** — `docs/projeto/sdd.md` §"Autenticação" (linhas 80-81, flipadas pelos patches P5/P5b) · `:84` (autorização) · `:93` (a credencial de banco nunca sai do servidor) · `:100` (rate limit por conta **e** IP).
- **SPEC-022 / SPEC-023** — as duas mecânicas que tornam a revogação um requisito funcional.
- **SPEC-038** — `readBandState` + `GET /v1/band`, o primeiro consumidor do seam e do middleware de sessão.
- **CLAUDE.md** — OP-09, OP-11, OP-12/02, OP-17.

---

*ADR-003 — método H1VE. Registro de decisão durável; ver `docs/adr/README.md` para o fluxo de ADRs.*
