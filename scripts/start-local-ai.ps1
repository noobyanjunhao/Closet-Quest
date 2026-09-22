$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$ollamaExe = Join-Path $projectDir 'tmp/ollama/bin/ollama.exe'
if (!(Test-Path -LiteralPath $ollamaExe)) {
  $command = Get-Command ollama -ErrorAction SilentlyContinue
  if (!$command) { throw 'Install Ollama from https://ollama.com/download/windows first.' }
  $ollamaExe = $command.Source
}
$env:OLLAMA_MODELS = Join-Path $projectDir '.model-cache/ollama'
$env:OLLAMA_HOST = '127.0.0.1:11434'
$env:OLLAMA_NO_CLOUD = '1'
try { Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null }
catch { Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden }
Write-Output 'Local Ollama started. If needed, run: ollama pull gemma3:4b. Then npm run dev.'
