param(
    [ValidateSet('Install', 'Update', 'Uninstall')]
    [string] $Mode = 'Install',
    [string] $VencordPath,
    [switch] $PreflightOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$AppRoot = Split-Path -Parent $PSScriptRoot
$ManagedVencordPath = Join-Path $env:LOCALAPPDATA 'PersonalInbox\Vencord'
$PluginSource = Join-Path $AppRoot 'payload\personalInbox'
$PluginName = 'personalInbox'
$OfficialRemote = 'https://github.com/Vendicated/Vencord.git'
$TestedVencordCommit = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'TESTED_VENCORD_COMMIT')).Trim()
$CheckoutConfig = Join-Path $AppRoot 'installed-vencord-path.txt'
$BackupRoot = Join-Path $env:LOCALAPPDATA 'PersonalInbox\backups'
$LogRoot = Join-Path $env:LOCALAPPDATA 'PersonalInbox\logs'
$script:LogPath = $null
$script:TranscriptPath = $null
$script:TranscriptStarted = $false

function Write-Stage([string] $Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $line
    if ($script:LogPath) { Add-Content -LiteralPath $script:LogPath -Value $line -Encoding utf8 }
}

function Get-CommandPath([string] $Name, [string[]] $Fallbacks = @()) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($candidate in $Fallbacks) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = @($machinePath, $userPath, $env:Path) -join ';'
}

function Invoke-WingetInstall([string] $PackageId, [string] $DisplayName) {
    $winget = Get-CommandPath 'winget.exe' @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'),
        (Join-Path $env:ProgramFiles 'WindowsApps\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\winget.exe')
    )
    if (-not $winget) {
        throw "Windows Package Manager (winget) is unavailable. Install $DisplayName from its official source, then run Setup again."
    }

    Write-Stage "Installing $DisplayName using the official Windows Package Manager source..."
    $arguments = @('install', '--id', $PackageId, '--exact', '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements')
    $process = Start-Process -FilePath $winget -ArgumentList $arguments -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) { throw "winget could not install $DisplayName (exit code $($process.ExitCode))." }
    Refresh-ProcessPath
}

function Ensure-Prerequisites {
    Write-Stage 'Checking prerequisites...'

    $git = Get-CommandPath 'git.exe' @(
        (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Git\cmd\git.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe')
    )
    if (-not $git) {
        Invoke-WingetInstall 'Git.Git' 'Git for Windows'
        $git = Get-CommandPath 'git.exe' @((Join-Path $env:ProgramFiles 'Git\cmd\git.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe'))
    }
    if (-not $git) { throw 'Git is still unavailable after installation. Restart Windows or install Git for Windows, then retry.' }

    $node = Get-CommandPath 'node.exe' @((Join-Path $env:ProgramFiles 'nodejs\node.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))
    if ($node) {
        $nodeVersion = (& $node --version).Trim().TrimStart('v')
        $nodeMajor = [int]($nodeVersion.Split('.')[0])
    } else { $nodeMajor = 0 }
    if ($nodeMajor -lt 22) {
        Invoke-WingetInstall 'OpenJS.NodeJS.LTS' 'Node.js LTS (version 22 or later)'
        $node = Get-CommandPath 'node.exe' @((Join-Path $env:ProgramFiles 'nodejs\node.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))
        if (-not $node) { throw 'Node.js was installed but is not available in standard locations. Restart Windows and retry.' }
        $nodeVersion = (& $node --version).Trim().TrimStart('v')
        $nodeMajor = [int]($nodeVersion.Split('.')[0])
        if ($nodeMajor -lt 22) { throw "Node.js $nodeVersion is too old; Vencord requires Node.js 22 or later." }
    }

    $nodeDirectory = Split-Path -Parent $node
    $corepack = Get-CommandPath 'corepack.cmd' @((Join-Path $nodeDirectory 'corepack.cmd'), (Join-Path $nodeDirectory 'corepack.exe'))
    if (-not $corepack) { throw 'Corepack is unavailable. Install a supported Node.js LTS release with Corepack, then retry.' }

    $script:Git = $git
    $script:Node = $node
    $script:Corepack = $corepack
    Write-Stage "Found Git, Node.js $nodeVersion, and Corepack. Vencord pins pnpm 11.9.0 in package.json."
}

function Test-OfficialCheckout([string] $Path) {
    if (-not (Test-Path -LiteralPath (Join-Path $Path 'package.json') -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $Path 'src\userplugins') -PathType Container)) { return $false }
    $remote = (& $script:Git -C $Path remote get-url origin 2>$null)
    if ($LASTEXITCODE -ne 0) { return $false }
    return @(
        'https://github.com/Vendicated/Vencord.git',
        'https://github.com/Vendicated/Vencord',
        'git@github.com:Vendicated/Vencord.git',
        'ssh://git@github.com/Vendicated/Vencord.git'
    ) -contains $remote.Trim()
}

function Find-CandidateCheckouts {
    $candidates = @(
        $ManagedVencordPath,
        (Join-Path $env:USERPROFILE 'Vencord'),
        (Join-Path $env:USERPROFILE 'source\Vencord'),
        (Join-Path $env:USERPROFILE 'Projects\Vencord'),
        (Join-Path $env:USERPROFILE 'Documents\Vencord'),
        (Join-Path $env:USERPROFILE 'Desktop\Vencord')
    ) | Select-Object -Unique

    # Check only immediate child directories of fixed local drives and the user
    # profile. This can discover user-named folders such as "Plugin discord"
    # without recursively crawling user files or network locations.
    $searchRoots = @($env:USERPROFILE)
    $searchRoots += [System.IO.DriveInfo]::GetDrives() |
        Where-Object { $_.DriveType -eq [System.IO.DriveType]::Fixed -and $_.IsReady } |
        ForEach-Object { $_.RootDirectory.FullName }
    foreach ($root in $searchRoots | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        $candidates += Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue |
            Where-Object {
                (Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') -PathType Leaf)
                -and (Test-Path -LiteralPath (Join-Path $_.FullName 'src\userplugins') -PathType Container)
            } |
            ForEach-Object { $_.FullName }
    }
    $candidates = $candidates | Select-Object -Unique

    return @($candidates | Where-Object { (Test-Path -LiteralPath $_ -PathType Container) -and (Test-OfficialCheckout $_) })
}

function Select-VencordCheckout {
    if (-not $VencordPath -and (Test-Path -LiteralPath $CheckoutConfig -PathType Leaf)) {
        $configuredPath = (Get-Content -Raw -LiteralPath $CheckoutConfig).Trim()
        if (-not (Test-OfficialCheckout $configuredPath)) {
            throw "The Vencord checkout previously selected for PersonalInbox is no longer available or official. No files were changed. Select a valid official checkout and try again."
        }
        return (Resolve-Path -LiteralPath $configuredPath).Path
    }

    if ($VencordPath) {
        $resolved = (Resolve-Path -LiteralPath $VencordPath -ErrorAction Stop).Path
        if (-not (Test-OfficialCheckout $resolved)) { throw "The selected path is not an official Vencord source checkout: $resolved" }
        return $resolved
    }

    $candidates = Find-CandidateCheckouts
    if ($candidates.Count -eq 0) {
        Write-Stage "Preparing managed Vencord checkout at $ManagedVencordPath..."
        if (Test-Path -LiteralPath $ManagedVencordPath) {
            throw "Managed Vencord path exists but is not a recognized official checkout. It was left untouched: $ManagedVencordPath"
        }
        $parent = Split-Path -Parent $ManagedVencordPath
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        & $script:Git clone $OfficialRemote $ManagedVencordPath
        if ($LASTEXITCODE -ne 0 -or -not (Test-OfficialCheckout $ManagedVencordPath)) {
            throw 'Could not clone and validate the official Vencord repository.'
        }
        & $script:Git -C $ManagedVencordPath checkout --detach $TestedVencordCommit
        if ($LASTEXITCODE -ne 0) { throw 'Could not select the Vencord revision tested for this release.' }
        return $ManagedVencordPath
    }

    if ($candidates.Count -eq 1) { return $candidates[0] }

    Write-Host 'Several official Vencord source checkouts were found. Choose which one to use:'
    for ($index = 0; $index -lt $candidates.Count; $index++) { Write-Host "[$($index + 1)] $($candidates[$index])" }
    while ($true) {
        $choice = Read-Host 'Enter a number, or X to cancel'
        if ($choice -match '^[Xx]$') { throw 'Setup cancelled; no Vencord checkout was changed.' }
        $number = 0
        if ([int]::TryParse($choice, [ref]$number) -and $number -ge 1 -and $number -le $candidates.Count) {
            return $candidates[$number - 1]
        }
        Write-Host 'Choose one of the displayed numbers.'
    }
}

function Assert-CheckoutSafe([string] $Path) {
    if (-not (Test-OfficialCheckout $Path)) { throw "Vencord origin or source layout changed; refusing to continue: $Path" }
    $status = & $script:Git -C $Path status --porcelain --untracked-files=normal
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect Git status for $Path" }
    $unsafe = @($status | Where-Object { $_ -notmatch 'src/userplugins/' })
    if ($unsafe.Count -gt 0) {
        throw "The Vencord checkout has local changes outside its ignored userplugin directory. Resolve or commit them before installing. Details: $($unsafe -join '; ')"
    }
}

function Install-PluginSource([string] $Path) {
    if (-not (Test-Path -LiteralPath $PluginSource -PathType Container)) { throw "Bundled PersonalInbox payload is missing: $PluginSource" }
    $pluginRoot = Join-Path $Path 'src\userplugins'
    if (-not (Test-Path -LiteralPath $pluginRoot -PathType Container)) { throw "Vencord userplugin directory is missing: $pluginRoot" }
    $destination = Join-Path $pluginRoot $PluginName

    $staging = Join-Path $pluginRoot ("personalInbox.installing-" + [guid]::NewGuid().ToString('N'))
    Copy-Item -LiteralPath $PluginSource -Destination $staging -Recurse

    if (Test-Path -LiteralPath $destination) {
        New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
        $backup = Join-Path $BackupRoot ("PersonalInbox-" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
        if (Test-Path -LiteralPath $backup) { throw "Backup already exists; refusing to overwrite it: $backup" }
        Copy-Item -LiteralPath $destination -Destination $backup -Recurse
        Write-Stage "Existing PersonalInbox source was backed up outside plugin discovery to $backup"
        Remove-Item -LiteralPath $destination -Recurse -Force
    }

    Move-Item -LiteralPath $staging -Destination $destination
    Write-Stage 'Installing PersonalInbox source; other userplugins are untouched.'
}

function Wait-ForDiscordToClose {
    Add-Type -AssemblyName System.Windows.Forms
    while (Get-Process -Name Discord -ErrorAction SilentlyContinue) {
        $result = [System.Windows.Forms.MessageBox]::Show(
            'Discord must be fully closed before PersonalInbox can be installed. Close Discord, then choose Retry. Choose Cancel to stop setup.',
            'PersonalInbox Setup',
            [System.Windows.Forms.MessageBoxButtons]::RetryCancel,
            [System.Windows.Forms.MessageBoxIcon]::Information
        )
        if ($result -ne [System.Windows.Forms.DialogResult]::Retry) { throw 'Setup cancelled because Discord is still running.' }
    }
}

function Build-And-Inject([string] $Path) {
    Assert-CheckoutSafe $Path
    Install-PluginSource $Path

    Push-Location $Path
    try {
        Write-Stage 'Installing Vencord dependencies with the repository-pinned pnpm version...'
        & $script:Corepack pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "Vencord dependency installation failed (exit code $LASTEXITCODE). See the full log at $script:LogPath" }

        Write-Stage 'Building Vencord with the repository-supported development build...'
        & $script:Corepack pnpm build --dev
        if ($LASTEXITCODE -ne 0) { throw "Vencord build failed (exit code $LASTEXITCODE). See the full log at $script:LogPath" }

        Wait-ForDiscordToClose
        Write-Stage 'Starting Vencord official installer CLI in development-install mode...'
        & $script:Corepack pnpm inject
        if ($LASTEXITCODE -ne 0) { throw "Vencord installation failed (exit code $LASTEXITCODE). See the full log at $script:LogPath" }
    } finally { Pop-Location }
}

function Remove-PluginAndRebuild([string] $Path) {
    if (-not (Test-OfficialCheckout $Path)) { throw "Refusing to modify an unrecognized Vencord checkout: $Path" }
    $destination = Join-Path $Path 'src\userplugins\personalInbox'
    if (-not (Test-Path -LiteralPath $destination)) {
        Write-Stage 'PersonalInbox source is already absent; no plugin files were removed.'
        return
    }

    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    $backup = Join-Path $BackupRoot ("PersonalInbox-uninstall-" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
    if (Test-Path -LiteralPath $backup) { throw "Backup already exists; refusing to overwrite it: $backup" }
    Copy-Item -LiteralPath $destination -Destination $backup -Recurse
    Remove-Item -LiteralPath $destination -Recurse -Force
    Write-Stage "PersonalInbox source was backed up to $backup and removed. No other plugin or inbox data was touched."

    Push-Location $Path
    try {
        Write-Stage 'Rebuilding Vencord without PersonalInbox...'
        & $script:Corepack pnpm build --dev
        if ($LASTEXITCODE -ne 0) { throw "Vencord rebuild failed (exit code $LASTEXITCODE). Full log: $script:LogPath" }
    } finally { Pop-Location }

    Add-Type -AssemblyName System.Windows.Forms
    $answer = [System.Windows.Forms.MessageBox]::Show(
        'PersonalInbox source was removed and Vencord rebuilt. Install the rebuilt Vencord now?',
        'PersonalInbox Uninstaller',
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Question
    )
    if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) {
        Wait-ForDiscordToClose
        Push-Location $Path
        try {
            Write-Stage 'Starting Vencord official installer CLI for the rebuilt client...'
            & $script:Corepack pnpm inject
            if ($LASTEXITCODE -ne 0) { throw "Vencord reinstall failed (exit code $LASTEXITCODE). Full log: $script:LogPath" }
        } finally { Pop-Location }
    }
}

function Start-Log {
    New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
    $script:LogPath = Join-Path $LogRoot ("setup-" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.log')
    New-Item -ItemType File -Path $script:LogPath -ErrorAction Stop | Out-Null
    $script:TranscriptPath = "$script:LogPath.transcript.txt"
    Start-Transcript -Path $script:TranscriptPath -Force | Out-Null
    $script:TranscriptStarted = $true
    Write-Stage "Full log: $script:LogPath"
}

function Stop-SetupTranscript {
    if ($script:TranscriptStarted) {
        Stop-Transcript | Out-Null
        $script:TranscriptStarted = $false
    }
}

try {
    Start-Log
    Ensure-Prerequisites
    if ($PreflightOnly) {
        Write-Stage 'Preflight completed; no Vencord files were changed.'
        Stop-SetupTranscript
        exit 0
    }

    switch ($Mode) {
        'Install' { $selected = Select-VencordCheckout; Set-Content -LiteralPath $CheckoutConfig -Value $selected -Encoding utf8; Build-And-Inject $selected }
        'Update' { $selected = Select-VencordCheckout; Set-Content -LiteralPath $CheckoutConfig -Value $selected -Encoding utf8; Build-And-Inject $selected }
        'Uninstall' {
            if (-not $VencordPath -and (Test-Path -LiteralPath $CheckoutConfig -PathType Leaf)) { $VencordPath = (Get-Content -Raw -LiteralPath $CheckoutConfig).Trim() }
            if (-not $VencordPath) {
                Write-Stage 'No Vencord checkout is recorded for this installer; no Vencord files were changed.'
                break
            }
            $selected = (Resolve-Path -LiteralPath $VencordPath -ErrorAction Stop).Path
            Remove-PluginAndRebuild $selected
        }
    }

    Write-Stage 'PersonalInbox setup completed. In Discord, open Settings → Vencord → Plugins and enable PersonalInbox.'
    Stop-SetupTranscript
    exit 0
} catch {
    Write-Stage "ERROR: $($_.Exception.Message)"
    Stop-SetupTranscript
    Write-Host "Setup stopped. No Discord process was terminated. Full log: $script:LogPath" -ForegroundColor Red
    [void](Read-Host 'Press Enter to close this window')
    exit 1
}
