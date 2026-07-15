<#
.SYNOPSIS
  Mede CPU (% da máquina) e RAM (working set total, MB) de um processo ao longo do tempo.
  Spike SPEC-003 — valida "< 1% CPU médio" e "< 150 MB RAM", inclusive num soak de 8 h.

.EXAMPLE
  # Verificação rápida (5 min, amostra a cada 1 s):
  .\measure-usage.ps1 -ProcessName FaixaSpike -Seconds 300

.EXAMPLE
  # Soak de 8 h (amostra a cada 5 s):
  .\measure-usage.ps1 -ProcessName FaixaSpike -Seconds 28800 -IntervalSeconds 5

.NOTES
  Usa System.Diagnostics.Process (NÃO Get-Counter) → INDEPENDENTE DE LOCALE: roda igual
  em Windows pt-BR e en-US (Get-Counter exige nomes de contador localizados e quebraria no pt-BR).
  CPU = % da MÁQUINA inteira (100% = todos os núcleos saturados), a mesma convenção do
  Gerenciador de Tarefas — derivada de TotalProcessorTime / (tempo decorrido × núcleos).
  RAM = WorkingSet64 (working set TOTAL, casa com o "< 150 MB" da SPEC — não o "private", que
  subestima o WPF/.NET). A cena animada deve estar RODANDO durante a medida.
  Drift de RAM = fim − início; positivo e persistente = leak.
#>
param(
  [string]$ProcessName = "FaixaSpike",
  [int]$Seconds = 300,
  [int]$IntervalSeconds = 1
)

$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors

$procs = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($procs.Count -eq 0) { Write-Error "Processo '$ProcessName' não encontrado — ele está rodando?"; exit 1 }
if ($procs.Count -gt 1) { Write-Warning "Múltiplas instâncias de '$ProcessName' ($($procs.Count)) — medindo a primeira (PID $($procs[0].Id))." }
$p = $procs[0]

Write-Host "Medindo '$ProcessName' (PID $($p.Id)) por $Seconds s (intervalo ${IntervalSeconds}s) em $cores núcleos..."
Write-Host "CPU = % da máquina (100% = todos os núcleos; convenção do Gerenciador de Tarefas). Deixe ocioso."

$cpu = New-Object System.Collections.Generic.List[double]
$ram = New-Object System.Collections.Generic.List[double]
$prevCpu = $p.TotalProcessorTime
$prevT = Get-Date
$iterations = [int][Math]::Ceiling($Seconds / $IntervalSeconds)

for ($i = 0; $i -lt $iterations; $i++) {
  Start-Sleep -Seconds $IntervalSeconds
  try { $p.Refresh() } catch { Write-Warning "Falha ao atualizar o processo."; break }
  if ($p.HasExited) { Write-Warning "Processo terminou durante a medida."; break }

  $nowCpu = $p.TotalProcessorTime
  $nowT = Get-Date
  $elapsed = ($nowT - $prevT).TotalSeconds
  if ($elapsed -le 0) { continue }

  # CPU-segundos consumidos no intervalo ÷ (tempo real × núcleos) → % da máquina.
  $cpu.Add([double]((($nowCpu - $prevCpu).TotalSeconds / ($elapsed * $cores)) * 100))
  $ram.Add([double]($p.WorkingSet64 / 1MB))
  $prevCpu = $nowCpu
  $prevT = $nowT
}

if ($cpu.Count -eq 0) { Write-Error "Sem amostras coletadas."; exit 1 }

$cpuSorted = $cpu | Sort-Object
$cpuAvg = ($cpu | Measure-Object -Average).Average
$cpuMax = ($cpu | Measure-Object -Maximum).Maximum
$p95i = [Math]::Min($cpuSorted.Count - 1, [int][Math]::Floor($cpuSorted.Count * 0.95))
$cpuP95 = $cpuSorted[$p95i]

$ramAvg = ($ram | Measure-Object -Average).Average
$ramMax = ($ram | Measure-Object -Maximum).Maximum
$ramDrift = $ram[$ram.Count - 1] - $ram[0]

$verdict = if (($cpuAvg -lt 1.0) -and ($ramMax -lt 150.0)) { "PASS (< 1% CPU & < 150 MB)" } else { "FAIL" }

Write-Host ""
Write-Host ("Amostras   : {0}"        -f $cpu.Count)
Write-Host ("CPU média  : {0:N3} % (máquina)" -f $cpuAvg)
Write-Host ("CPU p95    : {0:N3} %"   -f $cpuP95)
Write-Host ("CPU pico   : {0:N3} %"   -f $cpuMax)
Write-Host ("RAM média  : {0:N1} MB (working set total)" -f $ramAvg)
Write-Host ("RAM pico   : {0:N1} MB"  -f $ramMax)
Write-Host ("RAM drift  : {0:N1} MB (fim - início; >0 persistente = leak)" -f $ramDrift)
Write-Host ("Veredito   : {0}"        -f $verdict)
