# SPEC-028 — Página Coming Soon na Steam

> Documento de especificação obrigatório antes do início de qualquer desenvolvimento.
> Nenhuma linha de código (aqui: nenhum artefato) é escrita antes desta SPEC ser aprovada.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | SPEC-028 |
| **Feature** | Página Coming Soon na Steam |
| **Slug** | pagina-coming-soon-na-steam |
| **Owner** | Gustavo (founder/solo). Branch atual: `feat/24bit/pagina-coming-soon-na-steam` — ⚠️ specs anteriores usam `feat/gustavo-hartz/…`; **reconciliar o handle do owner** (ver Notas). |
| **Roadmap item** | **G.3** (Trilha GTM — paralela, destrava com a fase de arte) |
| **Appetite** | 14 dias (card). **Ver D8:** repo ~2 dias (DONE-able já); **go-live** é execução externa *gated* em G.1 + G.2 + um **build de cliente que ainda não existe** (screenshots/trailer reais) — sem timeline. Recomenda-se **fatiar o go-live** num card de continuação. |
| **Prioridade** | HIGH |
| **Criada em** | 2026-07-17 |
| **Aprovada em** | {preencher após aprovação} |
| **Aprovada por** | {arquiteto/founder} |
| **Status** | Rascunho |

---

## Objetivo

Preparar — **no repositório e prontos para execução** — todos os artefatos de uma página **Coming Soon na Steam** de **Next Goat**: a **copy fonte-de-verdade** (nome, short description, "About This Game", tags, aviso legal), o **runbook operacional do Steamworks** (specs de assets, prazos de review, mecânica de wishlist) e a **definição do gate de demanda** (**≥2.000 wishlists em 90 dias + 1 festival**). A página substitui a antiga landing/waiting-list própria (rev. 15/07): a **wishlist da Steam É a lista de espera nativa de marketing**. A **publicação** é *gated* na fase de arte (G.1), na clearance jurídica (G.2) e num build de cliente que renderize gameplay real — ação externa do founder no painel. Esta SPEC entrega tudo o que **não** depende desses gates e deixa o go-live pronto para quando fecharem.

---

## Contexto e motivação

- **Onde encaixa.** Item **G.3** da **Trilha GTM** no `docs/projeto/roadmap.md` (seção "Trilha GTM (paralela)", G.3 na linha 33). Objetivo da trilha: *"o relógio de wishlist só começa com nome + capsule no ar"*. Nome **decidido** (Next Goat — Taskbar Football; 15/07); **capsule não existe ainda**.
- **O que desbloqueia.** A wishlist da Steam vira a coleta de demanda nativa (**D10** em `sdd.md`) e **substitui a landing/waiting-list própria** (**D9**, pivô Steam-only de 15/07). A landing **nunca foi construída** (footprint zero; só referência histórica já higienizada pela **SPEC-007**).
- **Distinção obrigatória.** A *wishlist* (lista de espera de **marketing**) é **distinta** da **waiting list in-game** — escassez por **substituição de NPC + congelamento de vaga** (SPEC-020/021/023). *(A substituição e o congelamento estão entregues; a fila que puxa a vaga liberada segue **deferida** — DONE-023.)* **Esta SPEC não toca** essa mecânica.
- **Cadência (fonte de verdade).** O mundo joga **DIÁRIO 7/7 às 15h Brasília** — ratificado pela **SPEC-011** (R4 FINAL), já consistente no charter do `CLAUDE.md` (linhas 7/14/35) e nas docs. A copy usa **diário**. *(Não há drift a corrigir; a única menção a "ter/qui/sáb" no `CLAUDE.md` é o changelog histórico.)*
- **Natureza da entrega.** Docs/GTM + operação externa. Sem `packages/*`, sem gates TS, sem schema/migration. Precedente mais próximo: SPEC-007 (docs-only). O runbook do Steamworks é operacional (plataforma externa), não código de produto.
- **Travas do charter que a copy honra.** Mundo **100% fictício inclusive no marketing** (nenhum clube/jogador/liga real, nem por analogia); **NUNCA** qualquer ponte com aposta; promessas públicas **<1% CPU / zero anti-cheat no cliente / zero ads / zero pay-to-win / dinheiro do jogo não comprável / ausência não destrói a carreira / coleta mínima**.

---

## Escopo — o que está DENTRO

- [ ] **D1 — `docs/gtm/store-copy.md`**: copy fonte-de-verdade em **PT-BR**: nome público (`Next Goat` / `Next Goat — Taskbar Football`), **short description** (≤300 chars), **"About This Game"** (pronta para BBCode: cabeçalhos + bullets + marcações de GIF), **bloco de promessas públicas**, seção **"pra quem é / pra quem NÃO é"** (repele anti-usuários por arquétipo, sem citar concorrente), **linha de mundo-fictício**, **aviso legal** curto. Seção **EN como stub** (tradução deferida à F3 — i18n; estrutura PT/EN limpa desde já; ver risco de alcance global).
- [ ] **D2 — Tags e gêneros priorizados** (dentro de `store-copy.md`): gêneros **Sports + Football (Soccer)**; até 20 tags ordenadas por peso de descoberta (ex.: Football (Soccer), Idler, Life Sim, Online Co-Op, Massively Multiplayer, Casual, Relaxing, Persistent World, Character Customization, Pixel Graphics, Free to Play…). **Sem** `Management`/`Sports Management` (repele o min-maxer de gestão — pilar cooperação-não-gestão).
- [ ] **D3 — `docs/gtm/steamworks-runbook.md`**: runbook ordenado do founder solo: conta + Steam Distribution Agreement → Steam Direct (tax W-8BEN + banco/verificação) → criar app + **taxa $100 (recuperável após $1.000 AGR)** → "Your Store Presence" → survey de conteúdo + **AI-content disclosure 2026** → release date interna + granularidade pública "Coming Soon" → **Mark as Ready for Review** (review Valve **3–5 dias úteis**, orçar 7) → wishlist tracking → festival. Inclui, no mínimo:
  - **Tabela de specs de assets**: capsules **920×430** / **462×174** (legível a 120×45) / **1232×706** / **748×896**; **Page Background 1438×810** (opcional — Steam auto-gera do último screenshot se ausente); **≥5 screenshots 1920×1080**; **trailer de gameplay** (recomendado, forte driver de wishlist); library **600×900** / **920×430** / **hero 3840×1240** / **logo PNG** (library só para release).
  - **Prazos**: mínimo de **2 semanas em Coming Soon** antes do release; **hold de 30 dias** entre pagar a taxa Steam Direct e poder **lançar** o 1º produto (não bloqueia a página Coming Soon; entra na conta da data de release).
  - **Next Fest** (correção 2026): **demo jogável OBRIGATÓRIA** (não opcional) + **um Next Fest por jogo, para sempre** + jogo deve lançar **depois** do fest.
  - **≥2 candidatos de festival sem demo** (cozy/idle/Wholesome-style) para o primeiro beat de wishlist, guardando o Next Fest para quando houver demo polida.
  - **Wishlist tracking** (Marketing & Visibility > Wishlists; gross adds / deletes / outstanding balance; ~1 dia de lag).
- [ ] **D4 — Definição do gate de demanda**: **≥2.000 wishlists em 90 dias + 1 festival** (roadmap G.3). **Métrica precisa**: **adições cumulativas de wishlist (gross adds)** na janela de **90 dias contados do go-live (nome + capsule no ar)** — não o *outstanding balance* (que é líquido). O **"+1 festival"** é **co-condição (AND)**, não mera mitigação. Regra do `functional-spec` **"Gate externo — Steam"**: calendário de festival com folga; **nunca prometer data sem build aprovada**.
- [ ] **D5 — Handoff da fase de arte (G.1)**: a tabela de assets de D3 serve de brief técnico exato para o artista — capsules + Page Background + **≥5 screenshots** + **trailer**, todos de **gameplay REAL** no nível de pixel canônico (o bode inconfundível do sprite 48px à key art — regra-ponte do `sdd.md`; **nunca** key art nas screenshots/trailer — exigência Steam).
- [ ] **D6 — Checklist de pré-publicação (gates de bloqueio)** no runbook — a página **NÃO é submetida** sem os quatro: **(a)** capsule art (G.1); **(b)** clearance jurídica (G.2 — INPI 9/41 + TESS/EUIPO, risco "GOAT Games", + domínios/handles); **(c)** ≥5 screenshots (e o trailer) de **gameplay real** — exigem um build de cliente que renderize a faixa; **(d)** **enrollment Steamworks completo e verificado** (conta + Distribution Agreement + **taxa $100 paga** + W-8BEN/banco).
- [ ] **D7 — `docs/gtm/README.md`**: índice curto da nova pasta GTM, linkando `store-copy.md` e `steamworks-runbook.md`. **[nova convenção — ver Notas/Checklist]**
- [ ] **D8 — Atualizações de âncora** (no DONE): `docs/projeto/roadmap.md` G.3 → **🚧 (artefatos prontos / go-live bloqueado em G.1+G.2+build)** — *não* um "em andamento" genérico, para não mostrar um card HIGH travado por meses; e o bloco **"Estado atual"** do `CLAUDE.md` registrando a SPEC-028.

---

## Escopo — o que está FORA

- **Produzir a capsule/key art, as screenshots e o trailer** — é **G.1** (fase de arte). Bloqueio duro; esta SPEC entrega a copy de **texto** e o **brief** de assets, não a arte.
- **Clearance jurídica do nome** (INPI 9/41 + TESS/EUIPO + domínios/handles) — é **G.2**. Gate de publicação.
- **Build do cliente que renderiza gameplay real** para screenshots/trailer — pós-F0 (hoje só existem spikes: SPEC-003/005/006, que são protótipos de de-risking, **não** o jogo). Caminho crítico do go-live.
- **Criar o app, pagar os $100, subir assets, submeter à review e PUBLICAR** — execução **externa** do founder no painel, *gated* em D6. O runbook guia; a SPEC não "faz" isso no repo. *(A papelada de conta/tax/verificação pode e deve começar em paralelo agora.)*
- **Configurar preço regional BR** — deferido à release (tabela PPP da Valve, **não** conversão direta USD→BRL).
- **Tradução EN completa** — F3 (i18n); fica como stub. *(Ver risco PT-only vs. gate global.)*
- **Qualquer mecânica in-game de waiting list** (SPEC-020/021/023) — distinta; não tocar.
- **G.4 (Discord)** e **G.5 (Playtest)** — outras SPECs da Trilha GTM.
- **Betting / qualquer ponte com apostas** — trava **NUNCA**; reafirmada como negação honesta na própria copy, jamais como gancho.

---

## Arquivos que serão tocados

> A IA só toca arquivos listados aqui — qualquer arquivo fora desta lista exige aprovação.

| Arquivo | Ação | Descrição da mudança |
|---|---|---|
| `docs/gtm/store-copy.md` | criar | Copy PT fonte-de-verdade (nome, short, About This Game, tags/gêneros, aviso legal) + EN stub — D1/D2. |
| `docs/gtm/steamworks-runbook.md` | criar | Runbook + tabela de asset specs + gate de demanda + checklist de pré-publicação — D3/D4/D5/D6. |
| `docs/gtm/README.md` | criar | Índice da pasta GTM (linka os 2 docs) — D7. **[nova convenção]** |
| `docs/projeto/roadmap.md` | editar (no DONE) | G.3 → 🚧 (artefatos prontos / go-live bloqueado). |
| `CLAUDE.md` | editar (no DONE) | Apenas o bloco **"Estado atual"** (registrar SPEC-028). |
| `specs/SPEC-028-pagina-coming-soon-na-steam.md` | criar | Esta SPEC. |
| `specs/DONE-028-pagina-coming-soon-na-steam.md` | criar | O DONE (ao final). |

---

## Mudanças de schema (se aplicável)

Nenhuma mudança de schema nesta feature. Docs/GTM-only.

---

## Mudanças de API (se aplicável)

Nenhuma mudança de API nesta feature. Docs/GTM-only.

---

## Critérios de aceitação

> Verificáveis por **leitura dos artefatos + grep + git diff** (não há código para testar por unidade). Todos os greps são escopados a `docs/gtm/`. Fecho no DONE com uma tabela Cenário → ✅ → evidência.

**Cenário 1 — Identidade e nome**
- Dado o `store-copy.md`; quando lido; então o nome público é exatamente **"Next Goat"** (ou "Next Goat — Taskbar Football"), o mascote é o **bode coroado, camisa 10**, e o codinome **"camisa-9" NÃO aparece** na copy de loja. `grep -ni "camisa-9" docs/gtm/store-copy.md` → **0**.

**Cenário 2 — Campos da Steam preenchidos**
- Dado o `store-copy.md`; então existem: **short description** com **≤300 caracteres**, **"About This Game"** com os 4 pilares + o **bloco de promessas públicas**, a **seção "pra quem é / pra quem NÃO é"**, a **seção EN stub**, a lista de **tags** (≥12, ordenadas) e **gêneros** (Sports + Football), e o **aviso legal**.

**Cenário 3 — Mundo 100% fictício (trava)**
- Dado o `store-copy.md`; quando se procura por nome real de clube/jogador/liga ou analogia proibida; então **não há nenhum** — só nomes inventados/canônicos (ex.: "Copa da Baixada", "Liga Nacional"). Blocklist finalizada: `grep -niwE "brasileirao|brasileirão|libertadores|neymar|pele|pelé|messi|flamengo|corinthians|palmeiras|santos|premier ?league|la ?liga|bundesliga|serie ?a|uefa|fifa|conmebol|cbf" docs/gtm/` → **0**.

**Cenário 4 — Zero aposta (trava NUNCA)**
- Dado o `store-copy.md`; então **não há** menção a odds, bolão premiado, casa de aposta ou qualquer adjacência de betting — **exceto** a negação honesta ("não é aposta"). `grep -niwE "aposta|apostar|odds|bolao|bolão|betting|casa de aposta" docs/gtm/` → só ocorrências dentro da negação. *(Padrão com `\b`/`-w` para **não** casar "beta"/"Playtest".)*

**Cenário 5 — Cadência correta (fonte de verdade)**
- Dado o `store-copy.md`; então a cadência é **"todo dia às 15h" (diário 7/7)**: (a) presença — `grep -niE "todo dia|di[áa]rio|15h" docs/gtm/store-copy.md` → **≥1**; (b) ausência da antiga — `grep -niE "ter/qui/s|3 jogos/semana|3×/semana|terça.*quinta.*sábado" docs/gtm/` → **0**.

**Cenário 6 — Runbook operacional completo**
- Dado o `steamworks-runbook.md`; então cobre, no mínimo: **taxa $100 + recuperação em $1.000 AGR**; as **4 capsules** + **Page Background 1438×810** + **≥5 screenshots 1920×1080** + **trailer**; **review Valve 3–5 dias úteis (orçar 7)** + **2 semanas mínimas em Coming Soon** + **hold de 30 dias** taxa→release; **wishlist tracking**; **Next Fest = demo OBRIGATÓRIA + um por jogo**; e **≥2 candidatos de festival sem demo**.

**Cenário 7 — Gate de demanda documentado**
- Dado o `steamworks-runbook.md`; então o gate **≥2.000 wishlists em 90 dias + 1 festival** está escrito com a **métrica precisa** (gross adds cumulativos na janela de 90 dias do go-live), o **início do relógio** (nome + capsule no ar) e o **"+1 festival" como co-condição (AND)**.

**Cenário 8 — Gates de pré-publicação (edge / hard stop)**
- Dado que **falta** a capsule (G.1) **ou** a clearance (G.2) **ou** as screenshots/trailer de gameplay real **ou** o enrollment Steamworks verificado; quando se avalia publicar; então o checklist do runbook **PARA a submissão** e registra o bloqueio — nenhuma "Mark as Ready for Review" sem os quatro.

**Cenário 9 — Índice e âncoras**
- Dado o merge; então `docs/gtm/README.md` existe e linka `store-copy.md` + `steamworks-runbook.md`; o `docs/projeto/roadmap.md` mostra **G.3 → 🚧 (go-live bloqueado)**; e o bloco **"Estado atual"** do `CLAUDE.md` registra a SPEC-028. *(Estes dois últimos no DONE.)*

**Cenário 10 — Gates verdes / docs-only**
- Dado que a mudança é só `**/*.md`; quando o CI roda; então os 4 gates TS (`lint`/`typecheck`/`test`/`build`) seguem **verdes** (Prettier ignora `**/*.md`) e `git diff` toca **apenas** `docs/gtm/*`, `docs/projeto/roadmap.md`, `CLAUDE.md`, `specs/*`.

---

## Segurança (se aplicável)

N/A — docs/GTM-only. Sem código, sem superfície de rede, sem input não-confiável. **Nota operacional:** o runbook **referencia**, mas **nunca contém**, credenciais/keys do Steamworks (OP-02 / OP-12 — nenhum segredo commitado; tudo em painel/gestor externo).

---

## Riscos e dependências

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Capsule art (G.1) bloqueia o go-live — sem as 4 capsules + 5 screenshots não há "Ready for Review" | **Alta** | Arte é caminho crítico: travar o nome e produzir capsules + screenshots reais **antes** de tocar o Steamworks. Tudo o mais em paralelo. |
| **Build de cliente para gameplay real** (screenshots + trailer) não existe — pós-F0; sem ele a página **não passa na review** | **Alta** | Caminho crítico co-igual à capsule. Sem build que renderize gameplay canônico, **não submeter**. A cena do spike SPEC-003 é só **preview interno de WIP**, **jamais** asset de submissão (não é o jogo). |
| Colisão de marca "Next Goat" (G.2 — risco "GOAT Games") | Média | Clearance (INPI 9/41 + TESS/EUIPO) + domínios/handles **antes** da listagem pública. |
| Next Fest — **demo OBRIGATÓRIA** + **um por jogo, para sempre** | Média | Não queimar o slot: festival cozy/idle/Wholesome (sem demo) primeiro; guardar o Next Fest para a demo polida. |
| **Página PT-only** na janela de wishlist vs. gate global 2.000/90d (Steam é majoritariamente EN) | Média | Calibrar a expectativa a tráfego BR + festival, **ou** puxar **short desc + About EN mínimos** (fora do stub F3). Decisão do founder. |
| Preço BR por conversão ingênua USD→BRL super-precifica o primário | Baixa (deferido) | Preço não é exigido na fase wishlist; usar a tabela PPP da Valve. |
| Gate de demanda (2.000/90d) difícil só com a página | Média | Sincronizar go-live com festival/anúncio; redirecionar tráfego da landing; **trailer** + CTA; monitorar semanalmente. |
| Enrollment Steam Direct (W-8BEN, CPF/CNPJ, verificação + hold de 30 dias p/ release) | Média | Iniciar a papelada **agora**, em paralelo à arte; confirmar o período de espera no painel. |

**Dependências:**
- **G.1** — Briefing/entrega de identidade visual (capsule + screenshots + trailer). **Bloqueio duro.**
- **G.2** — Verificação jurídica do nome. **Gate de publicação.**
- **Build do cliente** que renderiza a faixa (para screenshots/trailer) — pós-F0. **Caminho crítico.**
- **Conta Steamworks + Steam Direct** ($100/app, tax, verificação, hold de 30 dias p/ release).

---

## Notas de implementação

- **Cadência (ratificada, porém reversível no beta).** A fonte de verdade é **DIÁRIO 7/7 às 15h** (SPEC-011, PR #14; já consistente no charter e nas docs). A copy usa diário. **Ao escrever a copy:** o roadmap (linha 109, "Gate de cadência R4 — beta") deixa a cadência **reversível no beta** — não cravá-la como garantia imutável na loja (a copy é editável pós-beta).
- **Nova pasta `docs/gtm/`.** O precedente embute GTM em `docs/projeto/` (não há pasta de marketing). Propõe-se `docs/gtm/` porque G.4/G.5 também gerarão artefatos GTM (espelha `docs/adr/`). **Convenção nova — precisa de OK.** *Fallback:* `docs/projeto/store-copy.md` + `steamworks-runbook.md`. **(Aprovado: `docs/gtm/`.)**
- **Ângulo da copy.** Dois candidatos rascunhados (**ambiente/baixa-atenção** e **coop/social**); o entregável **funde os dois**: gancho ambiente na primeira dobra, depois coop/social ("meu passe, seu gol", quinteto fura a fila), promessas, "pra quem é / não é", e preço (T1 grátis → compra única vitalícia).
- **Screenshots/trailer.** Exigência Steam: **gameplay real** no nível de pixel canônico, nunca key art (regra-ponte do `sdd.md`).
- **Não publicar antes de D6 (a–d).** O relógio de wishlist só começa com nome + capsule no ar.
- **Owner/branch.** Branch criada como `feat/24bit/…`; a convenção do repo é `feat/gustavo-hartz/…`. Confirmar se `24bit` é alias intencional; senão, renomear antes do PR.
- **Registro da SPEC.** Via H1VE **MCP `set_spec`** (founder/architect), não pela CLI. Cap ~20k UTF-16 — manter enxuta.
- **Betting: NUNCA.** A copy reafirma a negação honesta; qualquer SPEC que toque monetização passa pela checagem das "regras NUNCA".

---

## Checklist de aprovação

> A ser preenchido pelo arquiteto/founder antes de aprovar.

- [ ] Objetivo está claro e verificável
- [ ] Escopo está bem delimitado (dentro e fora) — incluindo a fronteira com a waiting-list in-game
- [ ] Arquivos listados estão corretos e completos
- [ ] Mudanças de schema estão documentadas (N/A — docs/GTM-only)
- [ ] Critérios de aceitação são verificáveis (leitura/grep/diff) e cobrem cada entregável D1–D8
- [ ] Riscos e dependências (G.1 arte, G.2 jurídico, build p/ screenshots/trailer, enrollment) foram avaliados
- [ ] Appetite é razoável (repo ~2 dias; go-live externo gated e sem timeline)
- [x] **DECISÃO: pasta `docs/gtm/`** (nova convenção) — **aprovada**
- [x] **DECISÃO: ângulo da copy — fundido** (ambiente→social)
- [x] **DECISÃO: janela de wishlist — PT-only** (EN como stub F3)
- [ ] **DECISÃO: fatiar o go-live** num card de continuação (recomendado) ou manter em G.3
- [ ] **CIÊNCIA: go-live gated** — a página não é publicada nesta SPEC
- [ ] Não há conflito com SPECs abertas em paralelo

---

*SPEC-028 — método H1VE. Docs/GTM-only; sem código, sem schema, sem API. Substitui a landing própria pela wishlist nativa da Steam (D9/D10); não toca a waiting-list in-game (SPEC-020/021/023). ADR-001 inalterado / não se aplica.*
