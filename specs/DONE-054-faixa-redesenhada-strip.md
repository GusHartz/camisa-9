# DONE-054 — A faixa redesenhada: o strip da Central da Carreira (fatia 1)

> Artefato de conclusão. O par da SPEC-054.

---

## Metadados

| Campo | Valor |
|---|---|
| **Número** | DONE-054 |
| **SPEC correspondente** | SPEC-054-faixa-redesenhada-strip.md |
| **Feature** | A faixa redesenhada — o strip (fatia 1) |
| **Owner** | gustavo-hartz (dev) |
| **Branch** | `feat/gustavo-hartz/a-faixa-redesenhada-o-strip-fatia-1` |
| **PR** | (a preencher) |
| **Desenvolvimento iniciado** | 2026-07-23 |
| **Desenvolvimento concluído** | 2026-07-23 |
| **Dias utilizados vs appetite** | <1 dia vs 14 dias |

---

## Resumo do que foi feito

O redesign completo do strip (os 5 blocos horizontais do handoff "Faixa Carreira") foi **implementado
fielmente, mostrado ao founder ao vivo e REJEITADO** ("volta ao que era"). Por decisão do founder
tomada na hora (**"deixe só o menu"**), o redesign foi **revertido** e a faixa voltou ao layout atual
(SPEC-042/045/052 + os fixes de bring-up) — mantendo dele **apenas o botão MENU**: um **☰** no canto
esquerdo da linha do atleta que abre o stub **"Central da Carreira — em breve"** (a âncora/seam do hub
das 9 telas, que é fatia futura). Fatia **100% cliente**: `packages/*`/`services/*` intocados, sem
migration, `dotnet build` **0 avisos**.

O objetivo principal da SPEC (o strip no visual do handoff — Cenário 1) **NÃO foi entregue** por
decisão de produto do founder; o redesign do strip fica **em espera por uma nova direção de design**.

---

## Arquivos criados

| Arquivo | Descrição |
|---|---|
| `specs/SPEC-054-faixa-redesenhada-strip.md` | A SPEC. |
| `specs/DONE-054-faixa-redesenhada-strip.md` | Este DONE. |

---

## Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `client/band-wpf/MainWindow.xaml` | +o glifo **☰** (MENU) à esquerda da linha do atleta; +o `MenuPopup` (stub "Central da Carreira — em breve"), ancorado no `BandRoot` como os demais popups. |
| `client/band-wpf/MainWindow.xaml.cs` | +`OnMenuClick` (toggle do stub); +`RaisePopup(MenuPopup)` no `BringPopupsAboveBand` (z-order sobre a faixa topmost). |
| `client/band-wpf/View/BandViewModel.cs` | +`MenuOpen` (propriedade) + `_menuOpen` + `ToggleMenu()` — espelham o padrão já revisado de `ShopOpen`/`ToggleShop`. |
| `CLAUDE.md` | Seção "Estado atual" atualizada. |
| `docs/roadmap.md` | Status do item 3.4 atualizado (redesign do strip em espera; MENU seam entregue). |

> ⚠️ **O redesign do strip (os 5 blocos) foi construído e depois REVERTIDO** (`git checkout HEAD --`
> nos 3 arquivos do cliente) por pedido do founder — não sobrou nada dele no diff final (verificado:
> `git diff` = só as ~36 linhas do MENU).

---

## Mudanças de schema aplicadas

Nenhuma migration neste DONE. Fatia 100% cliente.

---

## Mudanças de API entregues

Nenhuma mudança de API neste DONE.

---

## Critérios de aceitação — verificação

| Critério | Status | Observação |
|---|---|---|
| Cenário 1 — o strip no visual novo (5 blocos) | ❌ não entregue | Construído fiel ao handoff, mostrado ao vivo e **rejeitado pelo founder** ("volta ao que era"). Revertido por decisão de produto — o redesign fica em espera por nova direção de design. |
| Cenário 2 — funcionalidade preservada | ✅ | Nada mudou além do MENU: decisões, loja, escolha do intervalo, card, re-assistir, treino, regen, systray e o cenário (SPEC-052) seguem intactos (o diff não os toca). |
| Cenário 3 — o MENU (stub) | ✅ | O **☰** abre "Central da Carreira — em breve"; clicar de novo fecha; z-order sobre a faixa topmost via `BringPopupsAboveBand`. |
| Cenário 4 — dado ausente degrada | ✅ | Layout atual inalterado — já degradava sem crash (fila/sem-jogo); o MENU não depende de dado. |
| Cenário 5 — orçamento e cena | ✅ | Altura e cena inalteradas; **nenhum pulso/animação novo** (o "AO VIVO" do design não entrou). ~112 MB RAM medidos ao lançar. |
| Cenário 6 — o selo | ✅ | `packages/*` e `services/*` intocados (`git status` = só 3 arquivos do cliente), sem migration, `dotnet build` **0 avisos**. |

---

## Como testar manualmente

```
1. Suba a API local + Postgres (docker) e abra o BandClient logado.
2. Repare no glifo ☰ (azul) à esquerda do nome do atleta, na 1ª linha da faixa.
3. Clique no ☰ → abre o painel "CENTRAL DA CARREIRA / Em breve — ...".
4. Clique no ☰ de novo → fecha.
5. Confirme que decisões, loja (🛒), re-assistir (↻), card (📸), treino (chips),
   e ocultar/mostrar pelo tray seguem funcionando como antes.
   Resultado esperado: a faixa é idêntica à de antes, com o ☰ a mais.
```

**Dados de teste necessários:**
- Uma conta com atleta no mundo (o ambiente local de jogo).
- API em `localhost:3000`, Postgres em `localhost:5434`.

---

## Testes automatizados

Nenhum teste automatizado novo. É fatia de **UI do cliente** (C#/WPF), que vive fora dos workspaces
TS — sem projeto de teste C# (débito conhecido desde a SPEC-042). Verificação: `dotnet build` **0
avisos** + **smoke ao vivo** (a faixa na tela, o ☰ abrindo/fechando, as demais affordances intactas).

**Comando para rodar (gates TS — inalterados, o cliente não os afeta):**
```bash
npm test
```

---

## AI Declaration

| Arquivo | % gerado por IA | Revisado manualmente? |
|---|---|---|
| `client/band-wpf/MainWindow.xaml` | 100% | sim (founder aprovou ao vivo) |
| `client/band-wpf/MainWindow.xaml.cs` | 100% | sim |
| `client/band-wpf/View/BandViewModel.cs` | 100% | sim |

**A IA sugeriu mudanças fora do escopo da SPEC?**
- [x] Sim → A IA implementou o **escopo COMPLETO da SPEC** (o redesign dos 5 blocos). O founder o
  rejeitou ao vivo e reduziu o escopo a "só o menu". O redesign foi revertido; nada dele permaneceu.

---

## Desvios em relação à SPEC

| Item da SPEC | O que foi feito | Motivo do desvio |
|---|---|---|
| Cenário 1 / Escopo DENTRO (o re-layout dos 5 blocos) | **Não entregue** — construído e revertido | Decisão do founder ao vivo ("volta ao que era / deixe só o menu"). Correção de rumo (a âncora foi atualizada por decisão de produto), não drift silencioso. |
| Paleta do handoff / brushes | Não entregue | Parte do redesign revertido. |
| Altura 112 DIP | Não aplicada | Parte do redesign revertido; a faixa segue na altura atual do `config`. |

---

## Limitações conhecidas

- **A faixa segue no visual estrutural atual** — o layout do handoff "Faixa Carreira" NÃO foi adotado.
  Só o MENU (o seam do hub) entrou.
- **O MENU é um stub** — abre "Central da Carreira — em breve", sem nenhuma das 9 telas.
- **Sem projeto de teste C#** — verificação por build + smoke ao vivo (débito herdado da SPEC-042).

---

## Débito técnico gerado

| Item | Impacto | Quando resolver |
|---|---|---|
| Redesign do strip precisa de **nova direção de design** (o handoff atual foi rejeitado) | Médio | SPEC futura, quando o founder decidir o visual. |
| O hub das 9 telas (o destino do MENU) + as mecânicas que a maioria pressupõe | Médio | Cards de backend + fatias de UI futuras. |
| Assets pendentes (avatar em camadas, 16 escudos, nomes de divisão) | Baixo | Devolutiva ao designer (acumulada). |

---

## Checklist de entrega

- [x] Todos os critérios de aceitação verificados (Cenário 1 = conscientemente não entregue)
- [x] Testes criados e passando (n/a — UI cliente; build verde)
- [x] Typecheck limpo (cliente não afeta os gates TS; inalterados)
- [x] Lint limpo (idem)
- [x] Nenhum log de debug em código de produção
- [x] Nenhum tipo `any` introduzido
- [x] Nenhum segredo hardcoded
- [x] AI Declaration preenchida acima
- [x] `CLAUDE.md` seção "Estado atual" atualizada
- [x] `docs/roadmap.md` status do item atualizado
- [x] Este DONE está completo e commitado na branch

---

*DONE-054 — método H1VE. O redesign do strip foi construído, mostrado e rejeitado ao vivo; por decisão
do founder ficou só o botão MENU (o seam da Central da Carreira). 100% cliente, sem migration, selo
byte-idêntico.*
