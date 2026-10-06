param([string] $VencordPath)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'bootstrap.ps1') -Mode Uninstall -VencordPath $VencordPath
exit $LASTEXITCODE
