[CmdletBinding()]
param(
    [ValidateSet('start', 'setup', 'refresh', 'status', 'clean')]
    [string]$Action = 'start',

    [string]$DebugHome,

    [ValidateRange(0, 65535)]
    [int]$Port = 8081,

    [switch]$NoOpen
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($DebugHome)) {
    $DebugHome = Join-Path $repoRoot '.debug\dsh-home'
}
$resolvedDebugHome = [System.IO.Path]::GetFullPath($DebugHome)
$profileManifest = Join-Path $resolvedDebugHome 'profiles\web\package.json'
$debugPresetDir = Join-Path $resolvedDebugHome '.agent-presets\apb-coding'
$debugPackageDir = Join-Path $repoRoot '.debug\packages'
$packageName = '@deepseek-ai/dsh-apb'
$env:DSH_HOME = $resolvedDebugHome

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)

    if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Invoke-Dsh {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & dsh @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "dsh $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Invoke-Pnpm {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & pnpm @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

function Test-BundleInstalled {
    if (-not (Test-Path -LiteralPath $profileManifest)) {
        return $false
    }

    $manifest = Get-Content -LiteralPath $profileManifest -Raw -Encoding UTF8 |
        ConvertFrom-Json
    $dependenciesProperty = $manifest.PSObject.Properties['dependencies']
    if ($null -eq $dependenciesProperty) {
        return $false
    }

    return $null -ne $dependenciesProperty.Value.PSObject.Properties[$packageName]
}

function Install-DebugBundle {
    New-Item -ItemType Directory -Path $debugPackageDir -Force | Out-Null
    Get-ChildItem -LiteralPath $debugPackageDir -Filter '*.tgz' -File |
        Remove-Item -Force

    Write-Host "Packing $packageName from $repoRoot"
    Push-Location $repoRoot
    try {
        Invoke-Pnpm -Arguments @('pack', '--pack-destination', $debugPackageDir)
    }
    finally {
        Pop-Location
    }

    $tarballs = @(Get-ChildItem -LiteralPath $debugPackageDir -Filter '*.tgz' -File)
    if ($tarballs.Count -ne 1) {
        throw "Expected exactly one debug tarball, found $($tarballs.Count)."
    }

    if (Test-BundleInstalled) {
        Write-Host "Removing the previous $packageName debug installation"
        Invoke-Dsh -Arguments @('plugin', '--profile', 'web', 'remove', $packageName)
    }

    Write-Host "Installing debug tarball: $($tarballs[0].FullName)"
    Invoke-Dsh -Arguments @('plugin', '--profile', 'web', 'add', $tarballs[0].FullName)
}

function Write-DebugPreset {
    $sourcePreset = Join-Path $repoRoot 'apb-coding\preset.yml'
    $sourceComposition = Join-Path $repoRoot 'apb-coding\agent.cordis.yml'
    New-Item -ItemType Directory -Path $debugPresetDir -Force | Out-Null
    Copy-Item -LiteralPath $sourcePreset -Destination (Join-Path $debugPresetDir 'preset.yml') -Force

    $composition = Get-Content -LiteralPath $sourceComposition -Raw -Encoding UTF8
    # Keep this pattern ASCII-only so Windows PowerShell 5.1 can parse this
    # BOM-less UTF-8 script regardless of the active system code page.
    $legacyApbBlock = '(?ms)^#[^\r\n]*APB mode[^\r\n]*\r?\n.*?(?=^#[^\r\n]*shell[^\r\n]*\r?$)'
    $matches = [regex]::Matches($composition, $legacyApbBlock)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one legacy APB preset block, found $($matches.Count)."
    }

    $replacement = @'
# APB mode (provided by the profile bundle during local debugging)

# Local debug copy: the host controller is mounted once by the profile bundle.
# The source preset still contains the retired standalone package reference;
# removing that block here avoids a duplicate or unresolved host mount.

'@
    $generated = [regex]::Replace($composition, $legacyApbBlock, $replacement)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText(
        (Join-Path $debugPresetDir 'agent.cordis.yml'),
        $generated,
        $utf8NoBom
    )
    Write-Host "Generated isolated preset: $debugPresetDir"
    Write-Warning 'The generated preset removes the stale @deepseek-ai/dsh-apb-mode row only in the debug copy (APB-003 workaround).'
}

function Initialize-DebugEnvironment {
    Assert-Command -Name 'dsh'
    Assert-Command -Name 'pnpm'
    New-Item -ItemType Directory -Path $resolvedDebugHome -Force | Out-Null
    Install-DebugBundle
    Write-DebugPreset
}

function Show-DebugStatus {
    Write-Host "Repository : $repoRoot"
    Write-Host "DSH_HOME   : $resolvedDebugHome"
    Write-Host "Preset     : $debugPresetDir"
    Write-Host "Bundle     : $(if (Test-BundleInstalled) { 'installed' } else { 'not installed' })"

    if (Test-Path -LiteralPath $profileManifest) {
        Write-Host "`nComposed APB rows:"
        & dsh --profile web --dump-config 2>&1 |
            Select-String -Pattern '@deepseek-ai/dsh-apb|apb-mode'
        if ($LASTEXITCODE -ne 0) {
            throw "dsh --profile web --dump-config failed with exit code $LASTEXITCODE."
        }
    }
}

function Remove-DebugArtifacts {
    Assert-Command -Name 'dsh'
    if (Test-BundleInstalled) {
        Write-Host "Removing $packageName from isolated profile"
        Invoke-Dsh -Arguments @('plugin', '--profile', 'web', 'remove', $packageName)
    }

    if (Test-Path -LiteralPath $debugPresetDir) {
        $presetFullPath = [System.IO.Path]::GetFullPath($debugPresetDir)
        $homePrefix = $resolvedDebugHome.TrimEnd('\') + '\'
        if (-not $presetFullPath.StartsWith($homePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove preset outside debug home: $presetFullPath"
        }
        Remove-Item -LiteralPath $presetFullPath -Recurse -Force
        Write-Host "Removed generated preset: $presetFullPath"
    }
}

switch ($Action) {
    'setup' {
        Initialize-DebugEnvironment
        Show-DebugStatus
    }
    'refresh' {
        Initialize-DebugEnvironment
        Show-DebugStatus
    }
    'status' {
        Assert-Command -Name 'dsh'
        Show-DebugStatus
    }
    'clean' {
        Remove-DebugArtifacts
        Show-DebugStatus
    }
    'start' {
        Initialize-DebugEnvironment
        Show-DebugStatus
        Write-Host "`nStarting DSH web on port $Port. Press Ctrl+C to stop."
        Write-Host 'The current source was packed and installed for this run; stop and run this command again after any source change.'
        $webArguments = @('web', '--port', [string]$Port)
        if ($NoOpen) {
            $webArguments += '--no-open'
        }
        Invoke-Dsh -Arguments $webArguments
    }
}
