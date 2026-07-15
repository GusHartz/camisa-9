# RESULTS — Spike faixa always-on-bottom (SPEC-003)

> Preenchido pelo **founder no Windows**. O agente (macOS) não compila nem roda estes
> binários — cole aqui os números do `measure-usage.ps1` e marque os comportamentos.

**Ambiente de teste**
- Windows: {10 / 11 — build}
- CPU / núcleos lógicos: {}
- RAM total: {}
- Monitores: {quantos, resolução, escala DPI %}
- Taskbar: {posição — inferior padrão?}
- Data: {}

---

## Candidato A — C#/WPF (.NET 8)

| Métrica | Valor |
|---|---|
| Abre sem borda, full-width, acima da taskbar? | ☐ sim / ☐ não |
| **Cena animada** roda suave? | ☐ sim / ☐ não |
| Fica ATRÁS de janelas normais (não rouba foco)? | ☐ sim / ☐ não |
| Fora da taskbar e do Alt-Tab? | ☐ sim / ☐ não |
| Sobrevive a "mostrar desktop" (Win+D)? | ☐ sim / ☐ não |
| Sobrevive a clicar/alternar janelas? | ☐ sim / ☐ não |
| **Multi-monitor:** ancora certo no primário / estável no hotplug? | ☐ sim / ☐ não / ☐ N/A |
| **CPU média (% da máquina), 5 min** | ___ % |
| CPU p95 / pico | ___ % / ___ % |
| **RAM média / pico (working set total)** | ___ / ___ MB |
| **Soak 8 h — CPU média** | ___ % |
| **Soak 8 h — RAM pico / drift** | ___ MB / ___ MB |
| **Veredito** (CPU < 1% **e** RAM < 150 MB, sustentado 8 h?) | ☐ PASS / ☐ FAIL |
| Tamanho publicado (self-contained, MB) | ___ |
| Tamanho (framework-dependent, MB) | ___ |
| Startup (instantâneo / perceptível / lento) | ___ |
| Complexidade de build (1 fácil – 5 difícil) | ___ |
| Bugs / observações | |

**Log do measure-usage.ps1 (rápido, 5 min):**
```
{cole a saída aqui}
```

**Log do measure-usage.ps1 (soak 8 h):**
```
{cole a saída aqui}
```

---

## Candidato B — Rust/Win32 (windows-rs)

_A implementar após o candidato A validar (sequência ratificada na SPEC-003)._

| Métrica | Valor |
|---|---|
| (mesmas linhas do candidato A) | |

---

## Recomendação para a Ratificação de stack (#1)

- **Candidato recomendado:** {}
- **Justificativa** (CPU × RAM × footprint × velocidade de dev × manutenibilidade): {}
- **Go/No-go da forma padrão** (faixa animada always-on-bottom a < 1% CPU / < 150 MB, 8 h): {}
- **Plano B (modo compacto) necessário?** {}
