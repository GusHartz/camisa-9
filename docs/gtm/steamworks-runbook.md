# Steamworks — Runbook da página Coming Soon (Next Goat)

> **Entregável D3/D4/D5/D6 da SPEC-028.** Runbook operacional para o founder solo publicar uma página
> **Coming Soon** e começar a acumular **wishlist**. A copy da página vem de [`store-copy.md`](./store-copy.md).
>
> **Regra de ouro:** a página **NÃO é submetida** sem os quatro gates de pré-publicação (§6). O relógio de
> wishlist só começa com **nome + capsule no ar** (roadmap G.3).
>
> ⚠️ **Segurança:** este runbook **referencia**, mas **nunca contém**, credenciais/keys do Steamworks
> (OP-02 / OP-12). Nada de segredo neste arquivo nem no repo.

---

## 0. Pré-condições de negócio (antes do painel)

- **Nome travado:** `Next Goat` (P1 encerrado 15/07).
- **Clearance jurídica (G.2) — gate de publicação:** INPI classes **9/41** + TESS/EUIPO (risco nomeado: **"GOAT Games"**, publisher mobile) + stores + domínios/handles. **Não listar publicamente antes de limpar.**
- **Capsule art (G.1) — bloqueio duro:** a página não vai a review sem as capsules (§4). Hoje **não existe**.
- **Build de cliente para screenshots/trailer:** exige gameplay real; **pós-F0** (só há spikes). Caminho crítico.

---

## 1. Conta e enrollment (começar JÁ, em paralelo à arte)

1. Criar/confirmar conta em **partner.steamgames.com**; assinar o **Steam Distribution Agreement**; concluir a **verificação de identidade** (indivíduo ou empresa).
2. **Steam Direct — papelada financeira** (pode levar dias): **tax interview** (W-8BEN para pessoa física brasileira, ou W-8BEN-E para empresa) + dados de **pagamento/banco** (CPF/CNPJ à mão).
3. Confirmar **no painel** se há **período de espera de conta/identidade** antes de o app poder ir público — **não assumir zero**; iniciar o relógio agora para sobrepor à arte.

---

## 2. Criar o app e pagar a taxa

4. **"Create New App"** → pagar a **taxa Steam Direct de $100 USD** (por produto/AppID). É **recuperável**: a Valve credita de volta quando o produto atinge **$1.000 USD de Adjusted Gross Revenue**. Anotar o **AppID**.
5. Definir o **nome público do app = `Next Goat`** (o codinome `camisa-9` fica **só interno**).

> **Prazo estrutural:** há um **hold de 30 dias** entre pagar a taxa Steam Direct e poder **LANÇAR** o 1º produto. Isso **não** bloqueia a página Coming Soon (wishlist), mas entra na conta da data de release.

---

## 3. "Your Store Presence" (o bloco que a Valve exige para postar a página)

6. Subir os **assets** (§4). Colar a **short description** e a **"About This Game"** de [`store-copy.md`](./store-copy.md) (já em BBCode). Preencher o **Legal Notice**.
7. **Gêneros:** Sports + Casual + Massively Multiplayer (+ Free to Play). **Tags:** até 20, na ordem de [`store-copy.md`](./store-copy.md) — a **ordem** pesa na descoberta/"More like this". **Sem `Management`.**
8. **Idiomas suportados:** PT-BR (+ EN quando a copy EN existir) e **requisitos de sistema** básicos.
9. **Survey de conteúdo/legal:** questionário de conteúdo adulto + **AI-content disclosure 2026** (declarar honestamente qualquer ferramenta de IA usada na arte/assets).
10. **Release date:** a Steam **força uma data interna exata** — usar uma data conservadora **depois** do Next Fest alvo; exibir publicamente só granularidade grossa (**"Coming Soon"**). Ajustar depois.

---

## 4. Tabela de assets (brief técnico da fase de arte — D5)

> Screenshots e trailer = **gameplay REAL** no nível de pixel canônico. **Nunca key art.** Capsule art **não pode** ter texto de review/prêmio/desconto (regra Steam desde set/2022): logo + key art.

| Asset | Dimensão | Quando | Observação |
|---|---|---|---|
| **Header capsule** | 920×430 | Coming Soon | Banner do topo + listas/recomendações. |
| **Small capsule** | 462×174 | Coming Soon | Legível a **120×45** (Steam auto-gera 184×69 e 120×45). Busca/listas. |
| **Main capsule** | 1232×706 | Coming Soon | Carrossel da home / daily deals. |
| **Vertical capsule** | 748×896 | Coming Soon | Páginas de promoção sazonal / "under $X". |
| **Screenshots** | 1920×1080 (16:9) | Coming Soon | **≥5**, gameplay real da faixa. |
| **Page background** | 1438×810 | Opcional | Se ausente, Steam auto-gera do último screenshot. |
| **Trailer / vídeo** | fonte ≥1280×720 (1080p ideal) | Recomendado | **Não** bloqueia postar a página, mas é o **maior driver de wishlist**. MP4/WebM. |
| **Library capsule** | 600×900 | **Release** | Tile vertical na biblioteca. Preparar já. |
| **Library header** | 920×430 | **Release** | — |
| **Library hero** | 3840×1240 (safe 860×380) | **Release** | Só arte, sem texto. |
| **Library logo** | ≤1280×720, PNG transparente | **Release** | Logotipo; define posição (canto/centro). |

---

## 5. Submeter e ir ao ar

11. **Preview** da página → zerar o checklist → **remover todo placeholder** → **"Mark as Ready for Review"**.
12. **Review da Valve: 3–5 dias úteis** (orçar **7** para absorver correções + re-review). Rejeição reinicia o relógio.
13. Aprovada → a página **Coming Soon vai pública** e **wishlists acumulam automaticamente**. Redirecionar o tráfego da antiga landing para a página Steam; push de **trailer + CTA de wishlist**.

> **Prazos que se somam:** review da página (3–5 dú) · **mínimo de 2 semanas em Coming Soon** antes de poder lançar · review **separada do build** no release (3–5 dú) · hold de 30 dias taxa→release.

---

## 6. Checklist de pré-publicação — GATES DE BLOQUEIO (D6)

> **A página NÃO é submetida ("Mark as Ready for Review") sem os quatro.** Faltando qualquer um: **PARAR** e registrar o bloqueio.

- [ ] **(a) Capsule art (G.1)** — as 4 capsules entregues (+ screenshots).
- [ ] **(b) Clearance jurídica (G.2)** — INPI 9/41 + TESS/EUIPO limpos + domínios/handles garantidos.
- [ ] **(c) Screenshots/trailer de gameplay real** — ≥5 screenshots 1920×1080 (e, idealmente, o trailer) de um **build de cliente** que renderize a faixa. *(A cena do spike SPEC-003 serve só de preview interno de WIP — **jamais** como asset de submissão.)*
- [ ] **(d) Enrollment Steamworks completo e verificado** — conta + Distribution Agreement + **taxa $100 paga** + W-8BEN/banco verificados.

---

## 7. Wishlist tracking + gate de demanda (D4)

- **Onde:** Steamworks → **Marketing & Visibility → Wishlists** (e Sales & Activation Reports). Mostra **gross adds / deletes / outstanding balance** + quebra por país, com ~**1 dia de lag**.
- **Gate de demanda (roadmap G.3):** **≥2.000 wishlists em 90 dias + 1 festival.**
  - **Métrica:** **adições cumulativas (gross adds)** na janela de **90 dias** — **não** o *outstanding balance* (que é líquido: adds − deletes − ativações).
  - **Início do relógio:** go-live da página (**nome + capsule no ar**).
  - **"+1 festival":** **co-condição (AND)**, não mera mitigação.
- **Cadência de acompanhamento:** checagem **semanal** contra o relógio de 90 dias.
- **Regra "Gate externo — Steam" (`functional-spec`):** planejar festival com folga; **nunca prometer data de lançamento sem build aprovada**.

---

## 8. Festivais

- **Steam Next Fest** — festival oficial de **demos** (3×/ano). **Regras que importam:**
  - **Demo jogável OBRIGATÓRIA** (correção 2026: **não** é opcional) e live no início do fest.
  - **Um Next Fest por jogo, para sempre** — não queimar o slot antes de ter demo polida + momentum de wishlist.
  - O jogo deve **lançar depois** do fest; precisa de página pública já publicada.
- **Candidatos de festival SEM demo (para o primeiro beat de wishlist):**
  - **Wholesome Direct / Wholesome Games Celebration** (~junho, curadoria por aplicação) — encaixe tonal forte (cozy/baixa-atenção).
  - **Festivais cozy/calm sazonais da Steam** (curados) — bom fit tonal.
  - **Idle/incremental curator events** (o "Idler Fest"-type) — casa com a tag Idler e o loop ambiente.
  - **Screenshot Saturday Fest / mini-fests indie de baixa barreira** — visibilidade barata para solo.
- **Estratégia:** usar um festival **sem demo** primeiro (destrava o "+1 festival" do gate), guardando o **Next Fest** para quando a demo estiver polida.

---

## 9. Deferido para o release (fora da janela de wishlist)

- **Preço regional BR:** usar a **tabela PPP recomendada da Valve** (não conversão direta USD→BRL); recalibrar R$ 49,90 vs $9.99.
- **Library assets finais** (§4) + **review do build** + **"Release"** (respeitando o hold de 30 dias e o mínimo de 2 semanas em Coming Soon).
- **Materialização F2P + compra única "Carreira"** (pós-T1) — checada contra as regras NUNCA.
