param([string] $VencordPath)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'bootstrap.ps1') -Mode Update -VencordPath $VencordPath
exit $LASTEXITCODE
