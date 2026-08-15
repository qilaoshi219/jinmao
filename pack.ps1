# =============================================================================
#  JinMao 发布包打包脚本
#  功能：将「程序 + 部署说明」打包为 jinmao.zip，用户下载后可直接部署
#
#  用法：  .\pack.ps1                        # 默认打包（含前端预构建产物 dist/）
#          .\pack.ps1 -SkipDist              # 打包源码包（不含 dist/，部署时需自行构建前端）
#          .\pack.ps1 -Output D:\out.zip     # 自定义输出路径
#
#  包含：node-jinmao/（后端源码+部署脚本）、WEB/（前端源码+预构建 dist/）、
#        部署说明.md、API文档.md、数据库结构.md、FILE.md、start.ps1、pack.ps1
#  排除：node_modules、.env 等敏感文件、日志、运行时状态、测试数据、设计稿
#  说明：每次打包自动为 config/admin_config.json 生成新的随机安全后缀
#        （管理员后台入口后缀，可在管理员页面中修改）
#
#  最后修改：2026-08-04
# =============================================================================

param(
    # 是否排除前端预构建产物 dist/（用户部署时需要自行 npm run build）
    [switch]$SkipDist,
    # 输出 zip 路径（默认项目根目录 jinmao.zip）
    [string]$Output = ""
)

$ErrorActionPreference = "Stop"

$rootDir = $PSScriptRoot
if ($Output -eq "") { $Output = Join-Path $rootDir "jinmao.zip" }

# =============================================================================
# 0. 读取版本号
# =============================================================================
$version = "unknown"
try {
    $pkg = Get-Content (Join-Path $rootDir "node-jinmao\package.json") -Raw | ConvertFrom-Json
    $version = $pkg.version
} catch { }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JinMao 发布包打包脚本  v$version" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
if ($SkipDist) {
    Write-Host "  模式: 源码包（不含前端 dist/，部署时需自行构建）" -ForegroundColor Yellow
} else {
    Write-Host "  模式: 完整包（含前端预构建产物 dist/，下载后免构建）" -ForegroundColor Green
}
Write-Host "  输出: $Output" -ForegroundColor Gray
Write-Host ""

# =============================================================================
# 1. 准备工作：删除旧 zip、创建临时目录
# =============================================================================
Write-Host "[1/5] 准备工作..." -ForegroundColor Yellow

if (Test-Path $Output) {
    Remove-Item $Output -Force
    Write-Host "  旧 zip 已删除" -ForegroundColor Green
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("jinmao_pack_" + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "  临时目录: $tempDir" -ForegroundColor Gray

# =============================================================================
# 2. 复制项目文件（robocopy 排除 node_modules / 敏感文件 / 运行时文件）
# =============================================================================
Write-Host ""
Write-Host "[2/5] 复制项目文件（排除 node_modules 与敏感文件）..." -ForegroundColor Yellow

function Copy-Tree($src, $dst, $excludeDirs, $excludeFiles) {
    $roArgs = @($src, $dst, "/MIR", "/NJH", "/NJS", "/NDL", "/NP")
    foreach ($d in $excludeDirs) { $roArgs += "/XD"; $roArgs += $d }
    foreach ($f in $excludeFiles) { $roArgs += "/XF"; $roArgs += $f }
    $null = robocopy @roArgs
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy 失败（退出码 $LASTEXITCODE）：$src"
    }
}

# --- 2.1 后端 node-jinmao ---
$backendSrc = Join-Path $rootDir "node-jinmao"
if (-not (Test-Path $backendSrc)) { throw "未找到后端目录: $backendSrc" }
Write-Host "  复制 node-jinmao/ ..." -ForegroundColor Gray
Copy-Tree $backendSrc (Join-Path $tempDir "node-jinmao") @(
    "node_modules", "test", "output", "temp_pdf", "logs", ".git"
) @(
    ".env", ".migration_version", ".schema_hash", "*.log", "*.pid", "*.tmp"
)

# 为发布包生成新的管理员安全后缀（不修改本地源文件）
# 使用无 BOM 的 UTF-8 写入，确保 Node 的 require 读取 JSON 无兼容问题
$adminConfigPath = Join-Path $tempDir "node-jinmao\config\admin_config.json"
$suffix = "jm_" + ([System.Guid]::NewGuid().ToString("N").Substring(0, 10))
$adminJson = @{ securitySuffix = $suffix } | ConvertTo-Json
[System.IO.File]::WriteAllText($adminConfigPath, $adminJson, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  已生成新的管理员安全后缀: $suffix" -ForegroundColor Green

# --- 2.2 前端 WEB ---
$webSrc = Join-Path $rootDir "WEB"
if (-not (Test-Path $webSrc)) { throw "未找到前端目录: $webSrc" }
$webExcludeDirs = @("node_modules", ".pw-tmp", ".vscode", ".git")
$webExcludeFiles = @("*.log", "*.pid")
if ($SkipDist) { $webExcludeDirs += "dist" }
Write-Host "  复制 WEB/ ..." -ForegroundColor Gray
Copy-Tree $webSrc (Join-Path $tempDir "WEB") $webExcludeDirs $webExcludeFiles

$distPath = Join-Path $webSrc "dist"
if ($SkipDist) {
    Write-Host "  dist/ 已按 -SkipDist 排除（部署时需自行构建前端）" -ForegroundColor Gray
} elseif (Test-Path $distPath) {
    Write-Host "  ✅ 前端预构建产物 dist/ 已包含" -ForegroundColor Green
} else {
    Write-Host "  ⚠ WEB/dist 不存在！" -ForegroundColor Yellow
    Write-Host "    用户下载后将无法直接部署前端，建议先执行: cd WEB && npm install && npm run build" -ForegroundColor Yellow
    Write-Host "    或使用 -SkipDist 生成源码包" -ForegroundColor Yellow
}

# --- 2.3 根目录文档与脚本 ---
$extraFiles = @(
    "部署说明.md",
    "API文档.md",
    "数据库结构.md",
    "FILE.md",
    "start.ps1",
    "pack.ps1"
)
foreach ($f in $extraFiles) {
    $src = Join-Path $rootDir $f
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $tempDir $f) -Force
        Write-Host "  复制 $f" -ForegroundColor Gray
    }
}

# =============================================================================
# 3. 统计并压缩
# =============================================================================
Write-Host ""
Write-Host "[3/5] 压缩..." -ForegroundColor Yellow

$fileCount = (Get-ChildItem -Path $tempDir -Recurse -File -ErrorAction SilentlyContinue).Count
if ($fileCount -eq 0) {
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    throw "临时目录中没有文件，请检查项目完整性！"
}
Write-Host "  待打包文件数: $fileCount" -ForegroundColor Gray

# 使用 .NET ZipArchive 打包：
#  - 文件名按 UTF-8 存储（中文文件名在 Windows/宝塔/Linux 解压均正常显示）
#  - 不用内置 7za.exe（9.20 版对 UTF-8 文件名支持有缺陷，中文会乱码）
#  - 不用 Compress-Archive（PowerShell 5.1 下中文文件名同样会乱码）
function New-ReleaseZip($srcDir, $zipPath) {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $fs = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
    $archive = $null
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create, $false, [System.Text.Encoding]::UTF8)
        Get-ChildItem -Path $srcDir -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring($srcDir.Length).TrimStart('\').Replace('\', '/')
            $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
            $es = $entry.Open()
            try {
                $in = [System.IO.File]::OpenRead($_.FullName)
                try { $in.CopyTo($es) } finally { $in.Dispose() }
            } finally { $es.Dispose() }
        }
    } finally {
        if ($archive) { $archive.Dispose() }
        $fs.Dispose()
    }
}

$outDir = Split-Path $Output -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
New-ReleaseZip $tempDir $Output
Write-Host "  ✅ 压缩完成" -ForegroundColor Green

Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

$zipSize = (Get-Item $Output).Length
$zipSizeMB = [math]::Round($zipSize / 1MB, 2)
Write-Host "  ✅ 打包完成: $fileCount 个文件，${zipSizeMB} MB" -ForegroundColor Green

# =============================================================================
# 4. 校验 zip 内容
# =============================================================================
Write-Host ""
Write-Host "[4/5] 校验 zip 内容..." -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Output)
    $entries = $zip.Entries
    $topLevel = @{}
    foreach ($e in $entries) {
        $top = $e.FullName.Split('/')[0]
        if (-not $topLevel.ContainsKey($top)) { $topLevel[$top] = 0 }
        $topLevel[$top]++
    }
    $hasNM = ($entries | Where-Object { $_.FullName -match "node_modules/" } | Measure-Object).Count
    # 敏感/运行时文件黑名单（精确匹配；.env.example 与 config/admin_config.json 应存在，不在名单内）
    $badPatterns = '(^|/)\.env$|(^|/)\.migration_version$|(^|/)\.schema_hash$|(^|/)ftp\.txt$|(^|/)token\.txt$|\.backend\.|\.frontend\.|(^|/)\.uploads/'
    $hasEnv = ($entries | Where-Object { $_.FullName -match $badPatterns } | Measure-Object).Count
    $zip.Dispose()

    Write-Host "  总文件数: $($entries.Count)" -ForegroundColor Gray
    foreach ($key in ($topLevel.Keys | Sort-Object)) {
        Write-Host "    $key  ($($topLevel[$key]) 个文件)" -ForegroundColor Gray
    }
    if ($hasNM -gt 0) { Write-Host "  ⚠ 发现 $hasNM 个 node_modules 文件！" -ForegroundColor Yellow }
    else { Write-Host "  ✅ 无 node_modules（干净）" -ForegroundColor Green }
    if ($hasEnv -gt 0) { Write-Host "  ⚠ 发现 .env 文件！请检查排除规则" -ForegroundColor Yellow }
    else { Write-Host "  ✅ 无 .env 敏感文件" -ForegroundColor Green }
} catch {
    Write-Host "  无法校验 zip: $_" -ForegroundColor Yellow
}

# =============================================================================
# 5. 完成
# =============================================================================
Write-Host ""
Write-Host "[5/5] 完成" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  发布包已生成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  文件: $Output" -ForegroundColor White
Write-Host "  大小: ${zipSizeMB} MB" -ForegroundColor White
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║  部署三步走（详细步骤见包内 部署说明.md）                      ║" -ForegroundColor Cyan
Write-Host "  ╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "  ║                                                              ║" -ForegroundColor Cyan
Write-Host "  ║  Windows: 解压 → 配置 node-jinmao/.env → 运行 start.ps1       ║" -ForegroundColor Yellow
Write-Host "  ║                                                              ║" -ForegroundColor Cyan
Write-Host "  ║  Linux:   解压 → 配置 .env → bash setup_first_deploy.sh       ║" -ForegroundColor Yellow
Write-Host "  ║           → pm2 start ecosystem.config.js → Nginx 反代        ║" -ForegroundColor Yellow
Write-Host "  ║                                                              ║" -ForegroundColor Cyan
Write-Host "  ║  宝塔:    上传解压到 /www/wwwroot/jinmao → bash setup.sh       ║" -ForegroundColor Yellow
Write-Host "  ║           → 添加Node项目 → 添加站点+反代                      ║" -ForegroundColor Yellow
Write-Host "  ║                                                              ║" -ForegroundColor Cyan
Write-Host "  ║  必填: MySQL 8 + MinIO + SMTP + DeepSeek/Doc2x Key            ║" -ForegroundColor Magenta
Write-Host "  ║  本次管理员安全后缀: $suffix" -ForegroundColor Magenta
Write-Host "  ╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  （提示：管理员后台地址 = http://服务器IP:端口/admin/<安全后缀>" -ForegroundColor Gray
Write-Host "    后缀会打印在后端启动日志中，也可在管理员页面「安全」设置中修改）" -ForegroundColor Gray
Write-Host ""
