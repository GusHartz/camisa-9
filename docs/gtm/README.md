# docs/gtm/ — artefatos de Go-To-Market (Trilha GTM)

Esta pasta guarda os **artefatos operacionais e de copy** da **Trilha GTM** do roadmap (`docs/projeto/roadmap.md`,
seção "Trilha GTM (paralela)"). É o par de marketing/distribuição do que `docs/projeto/` faz para produto/design
e `docs/adr/` faz para decisões de arquitetura.

> **Convenção nova** (introduzida pela SPEC-028, aprovada pelo founder). O precedente da casa embutia GTM como
> prosa dentro de `docs/projeto/`; a partir de G.3 os artefatos GTM ganham pasta própria, porque G.4 (Discord) e
> G.5 (Playtest) também vão gerar os seus.

## Conteúdo

| Arquivo | O quê | SPEC |
|---|---|---|
| [`store-copy.md`](./store-copy.md) | Copy fonte-de-verdade da página Steam (nome, short description, "About This Game", tags/gêneros, aviso legal; PT-BR + EN stub). | SPEC-028 (G.3) |
| [`steamworks-runbook.md`](./steamworks-runbook.md) | Runbook operacional do Steamworks: enrollment, assets, submissão, wishlist tracking, gate de demanda, festivais, gates de pré-publicação. | SPEC-028 (G.3) |

## Regras

- **Sem segredos.** Nenhuma credencial/key do Steamworks (ou de qualquer plataforma) vive aqui — só procedimento (OP-02 / OP-12).
- **Fonte de verdade da copy.** Alterou o posicionamento? Atualize `store-copy.md` primeiro; a página Steam espelha este arquivo, não o contrário.
- **Travas de marketing** (revalidar a cada edição): mundo **100% fictício inclusive no marketing**; **NUNCA** ponte com apostas; cadência **diária 7/7 às 15h** (fonte de verdade — a cadência antiga foi invertida); o **codinome interno** do repo **nunca** na loja; promessas públicas **verificáveis**.

## Próximos (Trilha GTM)

- **G.4 — Discord da comunidade** (canal "monte seu quinteto") → futuros artefatos aqui.
- **G.5 — Steam Playtest** (distribuição do beta) → futuros artefatos aqui.
