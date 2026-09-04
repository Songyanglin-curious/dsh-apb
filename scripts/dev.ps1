[CmdletBinding()]
param(
    [ValidateSet('start', 'setup', 'status', 'clean')]
    [string]$Action = 'start',

    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]*$')]
    [string]$Profile = 'apb-dev',

    [ValidateRange(0, 65535)]
    [int]$Port = 18081,

    [switch]$NoOpen
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$overlayPath = Join-Path $PSScriptRoot 'apb-dev.patch.yml'
$presetRoot = Join-Path $repoRoot 'presets'
$packageName = '@deepseek-ai/dsh-apb'
$webAppPackage = '@deepseek-ai/dsh-web-app'
$webAppVersion = '0.1.1-rc.2'

if ($Profile -ieq 'web') {
    throw "日常 APB 开发不得使用 web Profile；请保留默认值 apb-dev 或指定另一个开发 Profile。"
}

$effectiveDshHome = if ([string]::IsNullOrWhiteSpace($env:DSH_HOME)) {
    Join-Path $env:USERPROFILE '.dsh'
}
else {
    $env:DSH_HOME
}
$effectiveDshHome = [System.IO.Path]::GetFullPath($effectiveDshHome)
$profileDir = Join-Path $effectiveDshHome "profiles\$Profile"
$profileManifest = Join-Path $profileDir 'package.json'
$linkedPackageDir = Join-Path $profileDir 'node_modules\@deepseek-ai\dsh-apb'
$expectedLinkSpec = 'link:' + ($repoRoot -replace '\\', '/')
$env:APB_DEV_PRESET_ROOT = $presetRoot

function Assert-Command {
    param([Parameter(Mandatory)][string]$Name)

    if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "在 PATH 中找不到必需命令 '$Name'。"
    }
}

function Invoke-Dsh {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & dsh @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "dsh $($Arguments -join ' ') 执行失败，退出代码为 $LASTEXITCODE。"
    }
}

function Invoke-Pnpm {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & pnpm @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm $($Arguments -join ' ') 执行失败，退出代码为 $LASTEXITCODE。"
    }
}

function Get-ProfileManifest {
    if (-not (Test-Path -LiteralPath $profileManifest)) {
        return $null
    }

    return Get-Content -LiteralPath $profileManifest -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-DependencySpec {
    param(
        [AllowNull()][object]$Manifest,
        [Parameter(Mandatory)][string]$Name
    )

    if ($null -eq $Manifest) {
        return $null
    }
    $dependencies = $Manifest.PSObject.Properties['dependencies']
    if ($null -eq $dependencies) {
        return $null
    }
    $dependency = $dependencies.Value.PSObject.Properties[$Name]
    if ($null -eq $dependency) {
        return $null
    }
    return [string]$dependency.Value
}

function Test-RepositoryDependencies {
    return Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules\.bin\nodemon.cmd')
}

function Approve-KoffiBuildIfPending {
    $workspaceConfig = Join-Path $profileDir 'pnpm-workspace.yaml'
    if (-not (Test-Path -LiteralPath $workspaceConfig)) {
        return $false
    }
    $configText = Get-Content -LiteralPath $workspaceConfig -Raw -Encoding UTF8
    if ($configText -notmatch '(?m)^\s*koffi:\s*set this to true or false\s*$') {
        return $false
    }

    Write-Host '正在定向批准 DSH Web 所需的 koffi 构建脚本...'
    Push-Location $profileDir
    try {
        Invoke-Pnpm -Arguments @('approve-builds', 'koffi')
    }
    finally {
        Pop-Location
    }
    return $true
}

function Resolve-LinkTarget {
    if (-not (Test-Path -LiteralPath $linkedPackageDir)) {
        return $null
    }

    $item = Get-Item -LiteralPath $linkedPackageDir -Force
    if ([string]::IsNullOrWhiteSpace([string]$item.Target)) {
        return $item.FullName
    }
    $target = [string]$item.Target
    if (-not [System.IO.Path]::IsPathRooted($target)) {
        $target = Join-Path $item.DirectoryName $target
    }
    return [System.IO.Path]::GetFullPath($target)
}

function Initialize-DevelopmentEnvironment {
    Assert-Command -Name 'dsh'
    Assert-Command -Name 'pnpm'

    if (-not (Test-RepositoryDependencies)) {
        Write-Host '正在安装仓库开发依赖（用于 link 的 peer dependency 解析和 Host 自动重启）...'
        Push-Location $repoRoot
        try {
            Invoke-Pnpm -Arguments @('install')
        }
        finally {
            Pop-Location
        }
    }

    $manifest = Get-ProfileManifest
    if ($null -eq (Get-DependencySpec -Manifest $manifest -Name $webAppPackage)) {
        Write-Host "正在为 $Profile Profile 安装 DSH Web 基础 bundle..."
        try {
            Invoke-Dsh -Arguments @('plugin', '--profile', $Profile, 'add', "$webAppPackage@$webAppVersion")
        }
        catch {
            if (-not (Approve-KoffiBuildIfPending)) {
                throw
            }
            Invoke-Dsh -Arguments @('plugin', '--profile', $Profile, 'add', "$webAppPackage@$webAppVersion")
        }
    }
    elseif (Approve-KoffiBuildIfPending) {
        Invoke-Dsh -Arguments @('plugin', '--profile', $Profile, 'add', "$webAppPackage@$webAppVersion")
    }

    $manifest = Get-ProfileManifest
    $installedSpec = Get-DependencySpec -Manifest $manifest -Name $packageName
    $linkTarget = Resolve-LinkTarget
    $linkMatches = $null -ne $linkTarget -and
        $linkTarget.Equals($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)
    if ($installedSpec -ne $expectedLinkSpec -or -not $linkMatches) {
        Write-Host "正在将 $packageName 链接到 $repoRoot ..."
        Invoke-Dsh -Arguments @('plugin', '--profile', $Profile, 'add', $expectedLinkSpec)
    }
}

function Show-DevelopmentStatus {
    $manifest = Get-ProfileManifest
    $webAppSpec = Get-DependencySpec -Manifest $manifest -Name $webAppPackage
    $apbSpec = Get-DependencySpec -Manifest $manifest -Name $packageName
    $linkTarget = Resolve-LinkTarget

    Write-Host "仓库目录：$repoRoot"
    Write-Host "DSH_HOME：$effectiveDshHome（与其他 Profile 共享 Home 级数据）"
    Write-Host "开发 Profile：$Profile"
    Write-Host "Profile 目录：$profileDir"
    Write-Host "Web 基础 bundle：$(if ($null -eq $webAppSpec) { '未安装' } else { $webAppSpec })"
    Write-Host "APB 依赖：$(if ($null -eq $apbSpec) { '未安装' } else { $apbSpec })"
    Write-Host "APB link 目标：$(if ($null -eq $linkTarget) { '不存在' } else { $linkTarget })"
    Write-Host "Preset 源目录：$presetRoot"
    Write-Host "开发 overlay：$overlayPath"
    Write-Host "启动端口：$Port"

    if ($null -ne $manifest) {
        Write-Host "`n组合配置中的 APB 与 preset 行："
        & dsh --profile $Profile --patch $overlayPath --dump-config 2>&1 |
            Select-String -Pattern '@deepseek-ai/dsh-apb|apb-mode|agent-presets|apb-coding'
        if ($LASTEXITCODE -ne 0) {
            throw "dsh --profile $Profile --patch $overlayPath --dump-config 执行失败，退出代码为 $LASTEXITCODE。"
        }
    }
}

function Remove-DevelopmentLink {
    Assert-Command -Name 'dsh'
    $manifest = Get-ProfileManifest
    if ($null -ne (Get-DependencySpec -Manifest $manifest -Name $packageName)) {
        Write-Host "正在从 $Profile Profile 移除 $packageName；Web 基础 bundle 和 Home 级数据会保留。"
        Invoke-Dsh -Arguments @('plugin', '--profile', $Profile, 'remove', $packageName)
    }
}

switch ($Action) {
    'setup' {
        Initialize-DevelopmentEnvironment
        Show-DevelopmentStatus
    }
    'status' {
        Assert-Command -Name 'dsh'
        Show-DevelopmentStatus
    }
    'clean' {
        Remove-DevelopmentLink
        Show-DevelopmentStatus
    }
    'start' {
        Initialize-DevelopmentEnvironment
        Show-DevelopmentStatus

        if (-not $NoOpen -and $Port -ne 0) {
            $url = "http://127.0.0.1:$Port"
            $openScript = "Start-Sleep -Seconds 2; Start-Process '$url'"
            Start-Process -FilePath 'powershell.exe' -ArgumentList @(
                '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $openScript
            ) -WindowStyle Hidden | Out-Null
        }

        Write-Host "`n正在启动 DSH：Client 由内建 HMR 更新；Host、bundle patch 或 preset 变化时自动重启。"
        Write-Host '按 Ctrl+C 停止。不要让此 Profile 与其他 Profile 同时操作同一个 Session。'
        Write-Host '提示：Ctrl+C 后，脚本会自动清理占用 18081 端口的残留进程。'
        $dshCommand = "dsh --profile `"$Profile`" --patch `"$overlayPath`" --port $Port --no-open"
        Push-Location $repoRoot
        try {
            Invoke-Pnpm -Arguments @(
                'exec', 'nodemon',
                '--watch', 'host/lib',
                '--watch', 'cordis.patch.yml',
                '--watch', 'presets',
                '--ext', 'js,yml,yaml',
                '--delay', '300ms',
                '--exec', $dshCommand
            )
        }
        finally {
            Pop-Location
            # nodemon 默认拦截 Ctrl+C 仅重启子进程，即使按两次退出，dsh 子进程
            # 也可能残留。此处清理任何仍在监听本端口的进程。
            $listener = netstat -ano 2>$null | Select-String ":${Port}.*LISTENING"
            if ($null -ne $listener) {
                $pidToKill = ($listener.ToString() -split '\s+')[-1]
                if ($pidToKill -match '^\d+$') {
                    Write-Host "正在清理残留的 DSH 进程（PID $pidToKill）..."
                    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}
