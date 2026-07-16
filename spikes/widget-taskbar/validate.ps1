<#
.SYNOPSIS
  Publica o EXE real e lança a faixa numa das duas posturas para validação visual (SPEC-006).
  O agente publica/lança/mede; o FOUNDER observa o que o agente não vê (ancoragem, foco/Alt-Tab,
  mover/auto-hide da taskbar, app em tela cheia, Win+D). NUNCA `dotnet run` (geometria/perf irreais).

.EXAMPLE
  .\validate.ps1 -Posture topmost      # postura A (flutuante)
  .\validate.ps1 -Posture appbar       # postura B (AppBar, reserva a borda)
  .\validate.ps1 -Posture topmost -Footprint   # + mede o self-contained
#>
param(
  [ValidateSet("topmost", "appbar")][string]$Posture = "topmost",
  [switch]$Footprint
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$proj = Join-Path $root "csharp-wpf\WidgetTaskbar.csproj"
$exe  = Join-Path $root "csharp-wpf\publish\WidgetTaskbar.exe"

Write-Host "Publicando o EXE real (framework-dependent)..."
dotnet publish $proj -c Release -r win-x64 --self-contained false -o (Join-Path $root "csharp-wpf\publish") | Out-Null
if (-not (Test-Path $exe)) { throw "Publish falhou — $exe não existe." }

# Fecha instância anterior de forma GRACIOSA. ACHADO (validado ao vivo): CloseMainWindow() é
# NO-OP aqui — WS_EX_TOOLWINDOW + ShowInTaskbar=false => a janela NÃO tem MainWindowHandle.
# Então enviamos WM_CLOSE direto ao HWND (EnumWindows por PID) -> Closing -> ABM_REMOVE.
# Stop-Process -Force (TerminateProcess) NÃO dispara isso e VAZA a reserva de borda da AppBar.
if (-not ([System.Management.Automation.PSTypeName]'GracefulClose').Type) {
  Add-Type @"
using System; using System.Runtime.InteropServices;
public static class GracefulClose {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  public static void ByPid(uint target) {
    EnumWindows((h,p)=>{ uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid==target && IsWindowVisible(h)) PostMessage(h, 0x0010 /*WM_CLOSE*/, IntPtr.Zero, IntPtr.Zero);
      return true; }, IntPtr.Zero);
  }
}
"@
}
$prev = Get-Process WidgetTaskbar -ErrorAction SilentlyContinue
if ($prev) {
  $prev | ForEach-Object { [GracefulClose]::ByPid([uint32]$_.Id) }  # WM_CLOSE -> Closing -> ABM_REMOVE
  Start-Sleep -Milliseconds 1200
  Get-Process WidgetTaskbar -ErrorAction SilentlyContinue | Stop-Process -Force  # fallback só se travou
}
Start-Process $exe -ArgumentList "--posture=$Posture"
Write-Host ""
Write-Host "Lançado posture=$Posture. Confira (o agente não vê):"
Write-Host "  1. A faixa aparece ancorada à taskbar? no monitor certo?"
Write-Host "  2. Não rouba foco / fora do Alt-Tab?"
Write-Host "  3. topmost: app maximizado a cobre? | appbar: reserva a borda (nada sobrepõe)?"
Write-Host "  4. Auto-hide da taskbar, app em tela cheia, Win+D — o status na faixa reflete?"
Write-Host "  Fechar: duplo-clique na faixa (dispara ABM_REMOVE). NÃO use CloseMainWindow — é no-op (tool-window sem MainWindowHandle)."
Write-Host "          — na postura appbar, NÃO use Stop-Process -Force: vaza a reserva de borda."

if ($Footprint) {
  Write-Host "`nMedindo footprint self-contained..."
  dotnet publish $proj -c Release -r win-x64 --self-contained true -o (Join-Path $root "csharp-wpf\publish-sc") | Out-Null
  $sc = Get-ChildItem (Join-Path $root "csharp-wpf\publish-sc") -Recurse -File | Measure-Object -Property Length -Sum
  Write-Host ("Footprint self-contained: {0:N1} MB ({1} arquivos) — vs. ~161 MB da SPEC-003." -f ($sc.Sum / 1MB), $sc.Count)
}
