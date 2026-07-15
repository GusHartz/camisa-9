<#
.SYNOPSIS
  Stub LOCAL do servidor (SPEC-005). Stand-in do world-engine (que não existe no F0).
  Escuta os POSTs do handler de ativação do toast, faz APPEND durável de cada decisão
  num log jsonl e devolve 200 + ack. Prova a CADEIA toast -> botão -> ativação -> servidor.

.EXAMPLE
  .\stub-server.ps1
  .\stub-server.ps1 -Port 5599 -LogPath "$env:LOCALAPPDATA\camisa9-toast-spike\server-log.jsonl"

.NOTES
  Escuta em http://localhost:PORT/ — localhost NÃO exige urlacl/admin (ao contrário de + ou *).
  Roda em Windows PowerShell 5.1 e PowerShell 7. Grava UTF-8 SEM BOM (jsonl limpo).
  Ctrl+C para parar. O cliente (ToastSpike.exe) posta em http://localhost:5599/ por padrão.
#>
param(
  [int]$Port = 5599,
  [string]$LogPath = "$env:LOCALAPPDATA\camisa9-toast-spike\server-log.jsonl"
)

$ErrorActionPreference = "Stop"
$utf8 = [System.Text.UTF8Encoding]::new($false)  # sem BOM

$dir = Split-Path -Parent $LogPath
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$prefix = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch { Write-Error "Falha ao escutar em $prefix (porta em uso?): $_"; exit 1 }

Write-Host "Stub ouvindo em $prefix" -ForegroundColor Cyan
Write-Host "Log: $LogPath"
Write-Host "Ctrl+C para parar."

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request

    $body = ""
    if ($req.HasEntityBody) {
      $reader = [System.IO.StreamReader]::new($req.InputStream, $req.ContentEncoding)
      $body = $reader.ReadToEnd()
      $reader.Close()
    }

    $receivedAt = (Get-Date).ToUniversalTime().ToString("o")
    $entry = [ordered]@{
      receivedAt = $receivedAt
      method     = $req.HttpMethod
      remote     = $req.RemoteEndPoint.ToString()
      payload    = $body
    }
    [System.IO.File]::AppendAllText($LogPath, (($entry | ConvertTo-Json -Compress) + "`n"), $utf8)
    Write-Host "[$receivedAt] $($req.HttpMethod) <- $body" -ForegroundColor Green

    $ack = @{ ack = $true; receivedAt = $receivedAt } | ConvertTo-Json -Compress
    $buf = [System.Text.Encoding]::UTF8.GetBytes($ack)
    $ctx.Response.StatusCode = 200
    $ctx.Response.ContentType = "application/json"
    $ctx.Response.ContentLength64 = $buf.Length
    $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    $ctx.Response.OutputStream.Close()
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
