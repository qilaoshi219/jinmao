# =============================================================================
#  JinMao Pack Script - Excludes node_modules, generates jinmao.zip for deployment
#  Usage: .\pack.ps1
# =============================================================================

$ErrorActionPreference = "Continue"

$rootDir = $PSScriptRoot
$outputZip = Join-Path $rootDir "jinmao.zip"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JinMao - Pack Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Includes: node-jinmao/ + WEB/ + key root files" -ForegroundColor Gray
Write-Host "  Excludes: node_modules / .backend.log / .frontend.log" -ForegroundColor Gray
Write-Host ""

# =============================================================================
# 1. Remove old zip
# =============================================================================
Write-Host "[1/3] Checking old zip..." -ForegroundColor Yellow
if (Test-Path $outputZip) {
    Remove-Item $outputZip -Force
    Write-Host "  Old jinmao.zip deleted" -ForegroundColor Green
} else {
    Write-Host "  No old zip found" -ForegroundColor Gray
}

# =============================================================================
# 2. Pack
# =============================================================================
Write-Host ""
Write-Host "[2/3] Packing..." -ForegroundColor Yellow

$itemsToPack = @(
    "$rootDir\node-jinmao",
    "$rootDir\WEB"
)

$extraFiles = @(
    "$rootDir\start.ps1",
    "$rootDir\pack.ps1",
    "$rootDir\WSL部署指南.md",
    "$rootDir\宝塔部署指南.md"
)

$paths = @()
foreach ($item in $itemsToPack) {
    if (Test-Path $item) { $paths += $item }
}
foreach ($f in $extraFiles) {
    if (Test-Path $f) { $paths += $f }
}

Write-Host "  Including:" -ForegroundColor Gray
foreach ($p in $paths) {
    $rel = $p.Replace($rootDir, ".").Replace("\", "/")
    Write-Host "    $rel" -ForegroundColor Gray
}

try {
    # Strategy: copy to a temp dir (excluding node_modules), then zip the temp dir.
    # This preserves directory structure, unlike passing individual file paths.
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("jinmao_pack_" + [System.IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    Write-Host "  Temp dir: $tempDir" -ForegroundColor Gray

    # Robocopy /MIR each source into temp dir, excluding node_modules
    $robocopyLog = Join-Path $tempDir "robocopy.log"

    foreach ($srcPath in $paths) {
        $srcName = (Get-Item $srcPath).Name
        $dstPath = Join-Path $tempDir $srcName

        if (Test-Path $srcPath -PathType Container) {
            # Directory: robocopy /MIR, excluding node_modules
            Write-Host "  Copying $srcName/ ... (excluding node_modules)" -ForegroundColor Gray
            $result = robocopy $srcPath $dstPath /MIR /NJH /NJS /NDL /NP /XD node_modules /XF .backend.log .frontend.log .backend.pid .frontend.pid
            # robocopy exit codes 0-7 are success
            if ($LASTEXITCODE -ge 8) {
                Write-Host "  WARNING: robocopy $srcName exited with $LASTEXITCODE" -ForegroundColor Yellow
            }
        } else {
            # Single file: just copy
            Copy-Item $srcPath $dstPath -Force
        }
    }

    # Count files in temp dir
    $fileCount = (Get-ChildItem -Path $tempDir -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Host "  Files to pack: $fileCount" -ForegroundColor Gray

    if ($fileCount -eq 0) {
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        throw "No files found! Check paths."
    }

    # Zip the temp dir (Compress-Archive on a directory preserves structure)
    Compress-Archive -Path "$tempDir\*" `
        -DestinationPath $outputZip `
        -CompressionLevel Optimal

    # Cleanup temp dir
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue

    $zipSize = (Get-Item $outputZip).Length
    $zipSizeMB = [math]::Round($zipSize / 1MB, 2)
    Write-Host "  Done: $fileCount files packed" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "  ERROR: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Possible causes:" -ForegroundColor Yellow
    Write-Host "    1. node_modules too many files -> delete node_modules first" -ForegroundColor Gray
    Write-Host "    2. File locked by another program -> close VS Code then retry" -ForegroundColor Gray
    Write-Host "    3. Disk full" -ForegroundColor Gray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# =============================================================================
# 3. Verify
# =============================================================================
Write-Host ""
Write-Host "[3/3] Verifying..." -ForegroundColor Yellow

Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($outputZip)
    $allEntries = $zip.Entries
    $totalFiles = $allEntries.Count

    $topLevel = @{}
    foreach ($entry in $allEntries) {
        $topName = $entry.FullName.Split('/')[0]
        if (-not $topLevel.ContainsKey($topName)) { $topLevel[$topName] = 0 }
        $topLevel[$topName]++
    }

    $hasNM = ($allEntries | Where-Object { $_.FullName -match "^[^/]+/node_modules/" } | Measure-Object).Count

    $zip.Dispose()

    Write-Host "  Total files: $totalFiles" -ForegroundColor Gray
    foreach ($key in ($topLevel.Keys | Sort-Object)) {
        Write-Host "    $key  ($($topLevel[$key]) files)" -ForegroundColor Gray
    }

    if ($hasNM -gt 0) {
        Write-Host "  WARNING: $hasNM node_modules files found in zip!" -ForegroundColor Yellow
    } else {
        Write-Host "  OK: node_modules excluded" -ForegroundColor Green
    }
} catch {
    Write-Host "  Cannot verify zip details: $_" -ForegroundColor Yellow
}

# =============================================================================
# Done
# =============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Pack complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  File: $outputZip" -ForegroundColor White
Write-Host "  Size: ${zipSizeMB} MB" -ForegroundColor White
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║         宝塔部署 — 3 步快速上线                ║" -ForegroundColor Cyan
Write-Host "  ╠══════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "  ║                                                  ║" -ForegroundColor Cyan
Write-Host "  ║  1. 宝塔 → 文件 → /www/wwwroot/jinmao/          ║" -ForegroundColor Yellow
Write-Host "  ║     上传 jinmao.zip 并解压                       ║" -ForegroundColor Yellow
Write-Host "  ║                                                  ║" -ForegroundColor Cyan
Write-Host "  ║  2. SSH 到服务器，运行初始化脚本：               ║" -ForegroundColor Yellow
Write-Host "  ║     cd /www/wwwroot/jinmao/node-jinmao           ║" -ForegroundColor White
Write-Host "  ║     bash setup.sh                                ║" -ForegroundColor White
Write-Host "  ║                                                  ║" -ForegroundColor Cyan
Write-Host "  ║  3. 宝塔 → 网站 → Node项目 → 添加Node项目       ║" -ForegroundColor Yellow
Write-Host "  ║     启动文件: .../node-jinmao/app.js             ║" -ForegroundColor White
Write-Host "  ║     运行目录: .../node-jinmao                    ║" -ForegroundColor White
Write-Host "  ║     → 提交 → 启动                                ║" -ForegroundColor White
Write-Host "  ║                                                  ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Read-Host "Press Enter to exit"
