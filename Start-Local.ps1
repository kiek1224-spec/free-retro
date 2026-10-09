param([int]$Port = 8197)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$bundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
Write-Host "Open http://localhost:$Port . Press Ctrl+C to stop."
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 -m http.server $Port --bind 127.0.0.1
} elseif (Test-Path -LiteralPath $bundledPython) {
    & $bundledPython -m http.server $Port --bind 127.0.0.1
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python -m http.server $Port --bind 127.0.0.1
} else {
    throw 'Python 3 is required. Install it and run this script again.'
}
