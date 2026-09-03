# APB v2 (Ask/Plan/Build 渐进编码助手) 一键迁移安装脚本
# 在目标机器上右键"使用 PowerShell 运行"，或在终端执行：  ./install.ps1
# 要求：目标机器已安装同一（或更新）版本的 DSH；脚本会将四件套安装到用户级 DSH_HOME。
# 安装完成后需重启 DSH（关闭 dsh web 后重新运行），再新建会话选择「APB 渐进编码助手」。

$ErrorActionPreference = 'Stop'

# ---- 1. 定位 DSH_HOME ------------------------------------------------------
$dshHome = $env:DSH_HOME
if ([string]::IsNullOrEmpty($dshHome)) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
Write-Host "[1/4] DSH_HOME = $dshHome" -ForegroundColor Cyan
if (-not (Test-Path $dshHome)) { Write-Host "DSH_HOME 不存在：$dshHome 。请先安装/运行过 DSH 再执行本脚本。" -ForegroundColor Red; exit 1 }

# ---- 2. preset 目录 ---------------------------------------------------------
$presetDir = Join-Path $dshHome '.agent-presets'
New-Item -ItemType Directory -Force -Path $presetDir | Out-Null
$srcPreset = Join-Path $PSScriptRoot 'apb-coding'
$dstPreset = Join-Path $presetDir 'apb-coding'
if (Test-Path $dstPreset) { Write-Host "[2/4] 已存在 $dstPreset ，覆盖为本次包内容…" -ForegroundColor Yellow }
Copy-Item -Recurse -Force $srcPreset $dstPreset
Write-Host "[2/4] preset 已安装: $dstPreset" -ForegroundColor Green

# ---- 3. host / client 插件包 ------------------------------------------------
$pkgDir = Join-Path $dshHome 'profiles\node_modules\@deepseek-ai'
New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null
foreach ($name in @('dsh-apb-mode', 'dsh-client-ui-apb-mode')) {
  $src = Join-Path $PSScriptRoot $name
  $dst = Join-Path $pkgDir $name
  if (Test-Path $dst) { Write-Host "[3/4] 已存在 $dst ，覆盖为本次包内容…" -ForegroundColor Yellow }
  Copy-Item -Recurse -Force $src $dst
  Write-Host "[3/4] 插件已安装: $dst" -ForegroundColor Green
}

# ---- 4. profile 组合行 (cordis.patch.yml) -----------------------------------
$patchFile = Join-Path $dshHome 'profiles\web\cordis.patch.yml'
$insertBlock = @(
  '# APB mode composer chip (user-level client plugin): registers the',
  '# conversation.input.right seat over the apbMode projection + /apb command.',
  '- insert:',
  "    - id: ui-apb-mode",
  "      name: '@deepseek-ai/dsh-client-ui-apb-mode'"
)
$needle = 'ui-apb-mode'

if (Test-Path $patchFile) {
  $current = Get-Content -Raw -Path $patchFile
  if ($current -match [regex]::Escape($needle)) {
    Write-Host "[4/4] $patchFile 已包含 $needle ，无需修改" -ForegroundColor Green
  } elseif ($current -match '(?m)^\s*\[\s*\]\s*$') {
    # 空补丁层（仅注释 + []）：直接改写为 insert 结构
    $header = ($current -split "`r?`n" | Where-Object { $_ -match '^\s*#' }) -join "`n"
    $body = $header.TrimEnd() + "`n" + ($insertBlock -join "`n") + "`n"
    Set-Content -Path $patchFile -Value $body -Encoding UTF8
    Write-Host "[4/4] 已写入 $patchFile" -ForegroundColor Green
  } else {
    Write-Host "[4/4] $patchFile 已有自定义内容，未自动修改（避免破坏）。" -ForegroundColor Yellow
    Write-Host "      请手动把以下块追加进该文件的顶层数组：" -ForegroundColor Yellow
    $insertBlock | ForEach-Object { Write-Host "      $_" -ForegroundColor Yellow }
  }
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $patchFile) | Out-Null
  Set-Content -Path $patchFile -Value ($insertBlock -join "`n") -Encoding UTF8
  Write-Host "[4/4] 已创建 $patchFile" -ForegroundColor Green
}

Write-Host ""
Write-Host "安装完成。请重启 DSH（关闭 dsh web 后重新运行），再新建会话选择「APB 渐进编码助手」。"
Write-Host "验证：输入区右侧出现 APB chip；Alt+M 或点击循环 ask→plan→build；切换后文件策略在 read-only 与 workspace-write 间变化。"
