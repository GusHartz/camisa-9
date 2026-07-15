# Memória do projeto

> Fatos DURÁVEIS destilados automaticamente do fluxo (decisões, gotchas, invariantes), ancorados por
> ENTIDADE. **Gerado pelo H1VE — não editar à mão** (é sobrescrito). Eterno: nada é apagado.

## 🧭 Invariantes (valem sempre — leia antes de mexer na área)

- **Guardrail ESLint barra Intl.DateTimeFormat e Date em packages/*/src; único Date.now permitido é no harness** — eslint.config.mjs estende o guardrail para proibir Intl.DateTimeFormat (além de Date já barrado) dentro de packages/*/src. O único ponto de impureza de relógio/fuso permitido é harness/run-season.ts. Violar isso quebra o determinismo cross-plataforma silenciosamente. · `world-engine` `guardrail` `eslint`

## 🎯 Decisões

- **Determinismo cross-plataforma: sem transcendentais, sem Intl/Date, golden commitado** — O motor usa PRNG uint32 puro (cyrb128+sfc32, saída x>>>0/2**32), CDF de Poisson pré-tabelada em inteiro (sem exp/log/pow) e âncora UTC-3 por aritmética de epoch (offset fixo -3h, sem Intl/ICU/Date). Motivo: float transcendental e ICU variam entre plataformas, corrompendo replay e auditoria. O golden (hash da temporada canônica + KAT do PRNG + vetor de âncora) é assertado no CI, provando determinismo cross-ambiente por construção. · `world-engine` `engine` `determinismo`
- **Persistência in-memory com shim transacional; atomicidade de DB adiada para SPEC-002 (0.2)** — O spike prova o contrato do publicador (rollback total, nenhum leitor vê estado intermediário via begin/stage/commit/swap) mas NÃO prova atomicidade de banco. Concorrência real, durabilidade pós-crash e lock distribuído ficam explicitamente em aberto até 0.2. Registrado como claim honesto para não ser reaberto como dívida técnica surpresa. · `world-engine` `orchestration` `store`
- **Animação WPF barata: usar TranslateTransform.X, não Canvas.Left — roda no render thread sem disparar layout** — Animar Canvas.Left dispara arrange na UI thread por frame. Animar TranslateTransform.X é processado no render/composition thread sem layout por frame. Resultado medido: CPU média 0,249% (~3% de 1 núcleo) com cena animada contínua em WPF, dentro do orçamento <1%. AllowsTransparency deve ficar desligado (composição por-pixel custa CPU). Footprint self-contained WPF: ~161 MB (trim não suportado no .NET 8) — eixo de decisão WPF vs Rust na feature #1. · `cliente` `faixa` `wpf`

## ⚠️ Gotchas (comportamento inesperado a não reaprender)

- **Win+D (mostrar desktop) no Win11 usa DWM cloaking — não interceptável por mensagem de janela** — No Windows 11, Win+D esconde janelas via DWM cloaking sem disparar WM_SHOWWINDOW, WM_SIZE ou SWP_HIDEWINDOW. Barrar SWP_HIDEWINDOW ou engolir SC_MINIMIZE não resolve. A solução é parentar a faixa à camada WorkerW do desktop (técnica Wallpaper Engine/Lively), mas no Win11 o SendMessage 0x052C não spawna a WorkerW separada como no Win10 e o SetParent no Progman não persiste — trabalho não-trivial, deferido ao cliente real. · `cliente` `faixa` `win32`
- **ClipToBounds no elemento <Window> do WPF é propriedade proibida — causa crash de startup** — WPF lança InvalidOperationException ao parsear XAML se ClipToBounds='True' estiver no elemento Window (proibido neste nível). O processo crashava com exit 0xE0434352 em 100% das execuções; o WER segurava o processo ~30–60 s mascarando o crash como 'processo vivo'. Fix: remover do Window — ClipToBounds pertence ao Canvas/painel interno. · `cliente` `faixa` `wpf`
