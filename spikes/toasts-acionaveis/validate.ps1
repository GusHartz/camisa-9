<#
.SYNOPSIS
  Harness de validação do spike SPEC-005 (toasts acionáveis). Automatiza a perna COLD.
  Publica o EXE REAL (NUNCA `dotnet run` — o LocalServer32 registraria dotnet.exe e a
  cold-activation quebra), sobe o stub, e guia a verificação warm + cold.

.NOTES
  Rode num Windows 11, NÃO-elevado, com as notificações do app LIGADAS e Focus Assist OFF
  no happy-path. O clique nos botões do toast é HUMANO (o agente não clica). Ao final,
  cole a saída + os arquivos de prova/log no RESULTS.md.
#>
param(
  [int]$Port = 5599,
  [string]$Configuration = "Release",
  [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Join-Path $root "csharp-wpf\ToastSpike.csproj"
$publishDir = Join-Path $root "csharp-wpf\publish"
$baseDir = Join-Path $env:LOCALAPPDATA "camisa9-toast-spike"
$proofPath = Join-Path $baseDir "proof.jsonl"
$serverLog = Join-Path $baseDir "server-log.jsonl"

Write-Host "== SPEC-005 validate — toasts acionáveis ==" -ForegroundColor Cyan

# 0) Limpa provas antigas para uma corrida limpa.
New-Item -ItemType Directory -Force -Path $baseDir | Out-Null
Remove-Item -ErrorAction SilentlyContinue $proofPath, $serverLog

# 1) Publica o EXE REAL (framework-dependent basta para o teste funcional).
Write-Host "1) Publicando o EXE (framework-dependent)..." -ForegroundColor Yellow
dotnet publish $proj -c $Configuration -r $Runtime --self-contained false -o $publishDir | Out-Host
$exe = Join-Path $publishDir "ToastSpike.exe"
if (-not (Test-Path $exe)) { throw "EXE não encontrado em $exe" }
Write-Host "   EXE: $exe"

# 2) Sobe o stub em background (Windows PowerShell — sempre presente).
Write-Host "2) Subindo o stub local (porta $Port)..." -ForegroundColor Yellow
$stubScript = Join-Path $root "server-stub\stub-server.ps1"
$stub = Start-Process powershell -PassThru -ArgumentList @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $stubScript, "-Port", $Port, "-LogPath", $serverLog
)
Start-Sleep -Seconds 2

try {
  # 3) WARM: app aberto — clique um botão do toast.
  Write-Host "3) WARM — abrindo o app. NA JANELA: clique '1) Enviar toast', depois clique UM botão DO TOAST." -ForegroundColor Green
  $app = Start-Process $exe -PassThru
  [void](Read-Host "   [ENTER] quando tiver clicado um botão do toast com o app ABERTO")

  # 4) COLD: mata o app, confirma morto, clique o outro botão com o app fechado.
  Write-Host "4) COLD — matando o app para simular 'fechado'..." -ForegroundColor Green
  try { Stop-Process -Id $app.Id -Force -ErrorAction Stop } catch {}
  Start-Sleep -Seconds 1
  $alive = @(Get-Process -Name ToastSpike -ErrorAction SilentlyContinue)
  if ($alive.Count -gt 0) { Write-Warning "   Ainda há ToastSpike vivo (PIDs: $($alive.Id -join ','))." }
  else { Write-Host "   Confirmado: nenhum ToastSpike rodando." }
  $deadPids = @($app.Id)
  [void](Read-Host "   Agora clique o OUTRO botão do toast (banner ou Action Center) com o app FECHADO, e [ENTER]")

  # 5) Verificação.
  Write-Host "5) Verificando provas..." -ForegroundColor Yellow
  $proof = if (Test-Path $proofPath) { @(Get-Content $proofPath | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json }) } else { @() }
  $log   = if (Test-Path $serverLog) { @(Get-Content $serverLog | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json }) } else { @() }

  $coldProof = @($proof | Where-Object { $_.cold -eq $true })
  $newPidCold = @($coldProof | Where-Object { $deadPids -notcontains $_.pid })

  Write-Host ""
  Write-Host "  Linhas de prova (cliente): $($proof.Count)"
  Write-Host "  Linhas de log (stub)     : $($log.Count)"
  Write-Host "  Prova COLD (cold=true)   : $($coldProof.Count)"
  Write-Host "  Prova COLD com PID NOVO  : $($newPidCold.Count)   (PID morto: $($deadPids -join ','))"
  Write-Host ""
  if ($newPidCold.Count -ge 1 -and $log.Count -ge 2) {
    Write-Host "  RESULTADO: PLAUSÍVEL GO — houve ativação COLD (PID novo) + POSTs no stub." -ForegroundColor Green
  } else {
    Write-Host "  RESULTADO: REVISAR — sem prova de cold-activation com PID novo. Ver README (Plano B / kill)." -ForegroundColor Red
  }
  Write-Host ""
  Write-Host "  Provas: $proofPath"
  Write-Host "  Log   : $serverLog"
  Write-Host "  Cole a saída acima + o conteúdo desses arquivos no RESULTS.md."
}
finally {
  if ($stub -and -not $stub.HasExited) { Stop-Process -Id $stub.Id -Force -ErrorAction SilentlyContinue }
}
