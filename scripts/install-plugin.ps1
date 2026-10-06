param([string] $VencordPath)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'bootstrap.ps1') -Mode Install -VencordPath $VencordPath
exit $LASTEXITCODE
