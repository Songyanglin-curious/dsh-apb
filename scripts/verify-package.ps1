[CmdletBinding()]
# APB 发布包隔离验证入口。
#
# 输入：Action、可选的隔离 DSH_HOME、端口和是否打开浏览器的开关。
# 输出：在隔离目录中安装/检查/清理当前 bundle 与 preset；start 还会启动 DSH Web。
# 该脚本不应修改正式 DSH 用户目录。
param(
    [ValidateSet('start', 'setup', 'refresh', 'status', 'clean')]
    [string]$Action = 'start',

    [string]$DebugHome,

    [ValidateRange(0, 65535)]
    [int]$Port = 18081,

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
    # 校验外部命令入口，缺少依赖时立即停止并给出明确错误。
    param([Parameter(Mandatory)][string]$Name)

    if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "在 PATH 中找不到必需命令 '$Name'。"
    }
}

function Invoke-Dsh {
    # 执行 DSH CLI；非零退出码通过异常返回给当前 Action。
    param([Parameter(Mandatory)][string[]]$Arguments)

    & dsh @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "dsh $($Arguments -join ' ') 执行失败，退出代码为 $LASTEXITCODE。"
    }
}

function Invoke-Pnpm {
    # 执行 pnpm；非零退出码通过异常返回给当前 Action。
    param([Parameter(Mandatory)][string[]]$Arguments)

    & pnpm @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm $($Arguments -join ' ') 执行失败，退出代码为 $LASTEXITCODE。"
    }
}

function Test-BundleInstalled {
    # 读取隔离 profile manifest，返回当前 bundle 是否已安装。
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
    # 重新打包当前源码，并把唯一 tarball 安装到隔离 web profile。
    New-Item -ItemType Directory -Path $debugPackageDir -Force | Out-Null
    Get-ChildItem -LiteralPath $debugPackageDir -Filter '*.tgz' -File |
        Remove-Item -Force

    Write-Host "正在从 $repoRoot 打包 $packageName"
    Push-Location $repoRoot
    try {
        Invoke-Pnpm -Arguments @('pack', '--pack-destination', $debugPackageDir)
    }
    finally {
        Pop-Location
    }

    $tarballs = @(Get-ChildItem -LiteralPath $debugPackageDir -Filter '*.tgz' -File)
    if ($tarballs.Count -ne 1) {
        throw "预期只生成一个调试压缩包，实际找到 $($tarballs.Count) 个。"
    }

    if (Test-BundleInstalled) {
        Write-Host "正在移除上一次安装的调试包 $packageName"
        Invoke-Dsh -Arguments @('plugin', '--profile', 'web', 'remove', $packageName)
    }

    Write-Host "正在安装调试压缩包：$($tarballs[0].FullName)"
    Invoke-Dsh -Arguments @('plugin', '--profile', 'web', 'add', $tarballs[0].FullName)
}

function Write-DebugPreset {
    # 将仓库中的 preset 元数据和 Agent-Plane 组合复制到隔离发现目录。
    $sourcePreset = Join-Path $repoRoot 'presets\apb-coding\preset.yml'
    $sourceComposition = Join-Path $repoRoot 'presets\apb-coding\agent.cordis.yml'
    New-Item -ItemType Directory -Path $debugPresetDir -Force | Out-Null
    Copy-Item -LiteralPath $sourcePreset -Destination (Join-Path $debugPresetDir 'preset.yml') -Force
    Copy-Item -LiteralPath $sourceComposition -Destination (Join-Path $debugPresetDir 'agent.cordis.yml') -Force
    Write-Host "已生成隔离 preset：$debugPresetDir"
}

function Initialize-DebugEnvironment {
    # 初始化隔离调试环境：检查依赖、安装 bundle、生成 preset。
    Assert-Command -Name 'dsh'
    Assert-Command -Name 'pnpm'
    New-Item -ItemType Directory -Path $resolvedDebugHome -Force | Out-Null
    Install-DebugBundle
    Write-DebugPreset
}

function Show-DebugStatus {
    # 输出隔离目录、bundle 安装状态和最终 profile 组合中的 APB 行。
    Write-Host "仓库目录：$repoRoot"
    Write-Host "DSH_HOME：$resolvedDebugHome"
    Write-Host "Preset 目录：$debugPresetDir"
    Write-Host "Bundle 状态：$(if (Test-BundleInstalled) { '已安装' } else { '未安装' })"

    if (Test-Path -LiteralPath $profileManifest) {
        Write-Host "`n组合配置中的 APB 行："
        & dsh --profile web --dump-config 2>&1 |
            Select-String -Pattern '@deepseek-ai/dsh-apb|apb-mode'
        if ($LASTEXITCODE -ne 0) {
            throw "dsh --profile web --dump-config 执行失败，退出代码为 $LASTEXITCODE。"
        }
    }
}

function Remove-DebugArtifacts {
    # 删除本脚本生成的隔离 bundle 与 preset；删除前校验目标仍在隔离目录内。
    Assert-Command -Name 'dsh'
    if (Test-BundleInstalled) {
        Write-Host "正在从隔离 profile 中移除 $packageName"
        Invoke-Dsh -Arguments @('plugin', '--profile', 'web', 'remove', $packageName)
    }

    if (Test-Path -LiteralPath $debugPresetDir) {
        $presetFullPath = [System.IO.Path]::GetFullPath($debugPresetDir)
        $homePrefix = $resolvedDebugHome.TrimEnd('\') + '\'
        if (-not $presetFullPath.StartsWith($homePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "拒绝删除调试目录之外的 preset：$presetFullPath"
        }
        Remove-Item -LiteralPath $presetFullPath -Recurse -Force
        Write-Host "已删除生成的 preset：$presetFullPath"
    }
}

# 脚本出口：按 Action 执行初始化、刷新、状态查看、清理或 Web 启动。
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
        Write-Host "`n正在端口 $Port 上启动 DSH Web。按 Ctrl+C 停止。"
        Write-Host '本次运行验证的是打包产物；源码发生变化后，请停止服务并重新运行此命令。'
        $webArguments = @('web', '--port', [string]$Port)
        if ($NoOpen) {
            $webArguments += '--no-open'
        }
        Invoke-Dsh -Arguments $webArguments
    }
}
