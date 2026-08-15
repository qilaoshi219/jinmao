# =============================================================================
#  JinMao 代码移交打包脚本（给继承开发者）
#  功能：把「完整源码 + Git 完整历史 + 开发文档」打包为一个 zip，直接发给对方
#
#  用法：  .\handover.ps1                      # 默认打包
#          .\handover.ps1 -Out D:\handover.zip # 自定义输出路径
#          .\handover.ps1 -IncludeTests        # 额外包含 test/ 测试数据（约 822MB）
#          .\handover.ps1 -IncludeMedia        # 额外包含 video-promo/ 宣传片素材（约 783MB）
#
#  包内容：全部源码、开发文档（开发日志/API文档/部署说明等）、Git 完整历史（.git）
#  已排除：node_modules、.env / ftp.txt / token.txt 等敏感凭据、日志、运行时状态
#
#  ★ Git 历史安全清理（本脚本的核心价值）：
#    原始 .git 约 689MB，且历史提交中包含过敏感文件（.env/ftp.txt/token.txt）
#    和大型冗余文件（旧 jinmao.zip 339MB、LibreOffice AppImage 340MB、node_modules、
#    WEB/dist、日志等）。脚本在【临时克隆】中执行 filter-branch 清理历史后重新打包，
#    ★ 本地仓库不会被修改，所有历史提交哈希会被重写（对方拿到的是全新干净历史）。
#
#  最后修改：2026-08-04
# =============================================================================

param(
    # 额外包含 test/（测试数据与旧刷题项目，约 822MB）
    [switch]$IncludeTests,
    # 额外包含 video-promo/（宣传片制作素材，约 783MB）
    [switch]$IncludeMedia,
    # 输出 zip 路径（默认项目根目录 jinmao-handover-v<版本>-<日期>.zip）
    [string]$Out = ""
)

$ErrorActionPreference = "Stop"

$rootDir = $PSScriptRoot

# =============================================================================
# 0. 前置检查
# =============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JinMao 代码移交打包脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 git 是否可用
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  ❌ 未找到 git 命令，请先安装 Git for Windows" -ForegroundColor Red
    exit 1
}

# 检查是否在 git 仓库内
$repoOk = git -C $rootDir rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ❌ 当前目录不是 git 仓库：$rootDir" -ForegroundColor Red
    exit 1
}

# 读取版本号与日期
$version = "unknown"
try {
    $pkg = Get-Content (Join-Path $rootDir "node-jinmao\package.json") -Raw | ConvertFrom-Json
    $version = $pkg.version
} catch { }
$dateStr = Get-Date -Format "yyyyMMdd"
if ($Out -eq "") { $Out = Join-Path $rootDir "jinmao-handover-v$version-$dateStr.zip" }

$commitCount = git -C $rootDir rev-list --count --all
$branchName = git -C $rootDir branch --show-current

Write-Host "  源码版本 : v$version  (分支: $branchName, 共 $commitCount 个提交)" -ForegroundColor Gray
Write-Host "  输出文件 : $Out" -ForegroundColor Gray
Write-Host "  敏感凭据 : .env / ftp.txt / token.txt 等 → 已排除" -ForegroundColor Yellow
Write-Host "  Git 历史 : 在临时克隆中清理敏感文件与冗余大文件后随包交付" -ForegroundColor Yellow
if ($IncludeTests) { Write-Host "  包含 test/（测试数据）" -ForegroundColor Magenta }
if ($IncludeMedia) { Write-Host "  包含 video-promo/（宣传素材）" -ForegroundColor Magenta }
Write-Host ""

# =============================================================================
# 1. 临时克隆仓库（--no-hardlinks 强制真实复制，避免硬链接损坏原仓库）
# =============================================================================
Write-Host "[1/6] 创建临时克隆..." -ForegroundColor Yellow

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("jinmao_handover_" + [System.IO.Path]::GetRandomFileName())
$cloneDir = Join-Path $tempRoot "repo"
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    Write-Host "  正在克隆（原 .git 约 689MB，需要一点时间）..." -ForegroundColor Gray
    git clone --no-hardlinks --quiet $rootDir $cloneDir
    if ($LASTEXITCODE -ne 0) { throw "git clone 失败（退出码 $LASTEXITCODE）" }
    Write-Host "  克隆完成" -ForegroundColor Green

    # 移除 origin 远程（指向本机路径，对方不需要）
    git -C $cloneDir remote remove origin 2>$null

    # =============================================================================
    # 2. 清理历史：移除敏感文件与冗余大文件
    # =============================================================================
    Write-Host ""
    Write-Host "[2/6] 清理 Git 历史（filter-branch）..." -ForegroundColor Yellow
    Write-Host "  移除: .env ftp.txt token.txt admin_config.json *.log *.pid" -ForegroundColor Gray
    Write-Host "  移除: node_modules WEB/dist 旧zip libreoffice-portable test .uploads" -ForegroundColor Gray

    # 注意：--index-filter 内的命令由 sh 执行，双引号字符串需整体传入
    # 注意：git glob pathspec 按【文件完整路径】匹配，目录型模式必须写成 **/目录/** 形式
    #       （写成 **/目录 匹配不到目录下的文件，导致该目录无法从历史中移除）
    $filterCmd = 'git rm --cached --ignore-unmatch -r -q .env ftp.txt token.txt config/admin_config.json jinmao.zip node_modules ".backend.log" ".frontend.log" ".backend.pid" ".frontend.pid" ":(glob)**/node_modules/**" ":(glob)**/dist/**" ":(glob)**/*.log" ":(glob)**/*.pid" ":(glob)**/*.zip" ":(glob)**/libreoffice-portable/**" ":(glob)**/test/**" ":(glob)**/.uploads/**"'
    git -C $cloneDir filter-branch --index-filter $filterCmd -- --all
    if ($LASTEXITCODE -ne 0) { throw "filter-branch 失败（退出码 $LASTEXITCODE）" }

    # 删除 filter-branch 备份引用 + 过期 reflog + 立即回收对象
    git -C $cloneDir for-each-ref --format='%(refname)' refs/original | ForEach-Object {
        git -C $cloneDir update-ref -d $_
    }
    git -C $cloneDir reflog expire --expire=now --all
    git -C $cloneDir gc --prune=now --aggressive --quiet
    if ($LASTEXITCODE -ne 0) { throw "git gc 失败（退出码 $LASTEXITCODE）" }

    # 校验：历史中不应再出现敏感文件
    $leftover = git -C $cloneDir log --all --oneline -- .env ftp.txt token.txt config/admin_config.json 2>$null
    if ($leftover) {
        throw "历史清理未完成，仍发现敏感文件提交：$leftover"
    }
    # 校验：不应残留大型冗余文件（>10MB 的历史 blob）
    $bigBlobs = @()
    git -C $cloneDir rev-list --objects --all 2>$null | ForEach-Object {
        $parts = $_ -split ' ', 2
        if ($parts.Count -eq 2) {
            $sz = git -C $cloneDir cat-file -s $parts[0] 2>$null
            if ($sz -and [long]$sz -gt 10MB) { $bigBlobs += "{0:N1} MB  {1}" -f ([long]$sz / 1MB), $parts[1] }
        }
    }
    if ($bigBlobs.Count -gt 0) {
        Write-Host "  ⚠ 历史中仍残留大文件（>10MB）：" -ForegroundColor Yellow
        $bigBlobs | ForEach-Object { Write-Host "    $_" -ForegroundColor Yellow }
        throw "历史清理未完成，仍残留大型冗余文件，请检查 filter-branch 规则"
    }
    Write-Host "  ✅ 历史清理完成，敏感文件与冗余大文件已从历史中移除" -ForegroundColor Green
    $newGitSize = (Get-ChildItem (Join-Path $cloneDir ".git") -Recurse -File | Measure-Object -Property Length -Sum).Sum
    Write-Host "  .git 大小: $([math]::Round($newGitSize / 1MB, 1)) MB（原 689 MB）" -ForegroundColor Green

    # =============================================================================
    # 3. 同步工作区到新 HEAD 并清理（dist 等已被移出历史，工作区同步删除）
    # =============================================================================
    Write-Host ""
    Write-Host "[3/6] 同步工作区..." -ForegroundColor Yellow
    git -C $cloneDir reset --hard --quiet HEAD
    git -C $cloneDir clean -fdx --quiet
    if ($LASTEXITCODE -ne 0) { throw "git reset/clean 失败（退出码 $LASTEXITCODE）" }
    Write-Host "  工作区已同步（node_modules / dist / 日志 / 临时文件已清除）" -ForegroundColor Green

    # 复制「未提交的改动」和「未跟踪的文档」到克隆中（对方拿到的是当前磁盘上的最新状态）
    # -c core.quotePath=false：防止 git 给中文文件名加引号导致复制失败
    Write-Host "  复制未提交改动与未跟踪文档..." -ForegroundColor Gray
    $dirtyFiles = git -C $rootDir -c core.quotePath=false diff --name-only 2>$null | Where-Object { $_ -ne "node-jinmao/.schema_hash" }
    foreach ($f in $dirtyFiles) {
        $src = Join-Path $rootDir $f
        $dst = Join-Path $cloneDir $f
        if (Test-Path $src) {
            $dstDir = Split-Path $dst -Parent
            if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
            Copy-Item $src $dst -Force
            Write-Host "    + $f" -ForegroundColor Gray
        }
    }
    # 排除打包产物自身（上次运行生成的 zip 会出现在未跟踪列表中，不能打进新包）
    $outName = Split-Path $Out -Leaf
    $untracked = git -C $rootDir -c core.quotePath=false status --porcelain 2>$null |
        Where-Object { $_ -match '^\?\?' } |
        ForEach-Object { $_.Substring(3) } |
        Where-Object { $_ -ne $outName -and $_ -notmatch '\.zip$' }
    foreach ($f in $untracked) {
        $src = Join-Path $rootDir $f
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $cloneDir $f) -Force
            Write-Host "    + $f" -ForegroundColor Gray
        }
    }

    # 小体积设计稿目录（gitignore 中但属于项目设计遗产，随包带上）
    foreach ($d in @("profile-settings-design", "jinmao-nerv-redesign")) {
        if (Test-Path (Join-Path $rootDir $d)) {
            robocopy (Join-Path $rootDir $d) (Join-Path $cloneDir $d) /E /NJH /NJS /NDL /NP | Out-Null
        }
    }

    # 可选：测试数据 / 宣传素材
    if ($IncludeTests -and (Test-Path (Join-Path $rootDir "test"))) {
        Write-Host "  复制 test/ ..." -ForegroundColor Magenta
        robocopy (Join-Path $rootDir "test") (Join-Path $cloneDir "test") /E /NJH /NJS /NDL /NP | Out-Null
    }
    if ($IncludeMedia -and (Test-Path (Join-Path $rootDir "video-promo"))) {
        Write-Host "  复制 video-promo/ ..." -ForegroundColor Magenta
        robocopy (Join-Path $rootDir "video-promo") (Join-Path $cloneDir "video-promo") /E /NJH /NJS /NDL /NP | Out-Null
    }

    # =============================================================================
    # 4. 生成新的管理员安全后缀（admin_config.json 被排除，需重新生成，否则后端无法启动）
    # =============================================================================
    Write-Host ""
    Write-Host "[4/6] 生成管理员安全后缀..." -ForegroundColor Yellow
    $adminConfigPath = Join-Path $cloneDir "node-jinmao\config\admin_config.json"
    $suffix = "jm_" + ([System.Guid]::NewGuid().ToString("N").Substring(0, 10))
    $adminJson = @{ securitySuffix = $suffix } | ConvertTo-Json
    [System.IO.File]::WriteAllText($adminConfigPath, $adminJson, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "  新管理员安全后缀: $suffix" -ForegroundColor Green

    # =============================================================================
    # 5. 打包（.NET ZipArchive，UTF-8 文件名，含 .git 完整历史）
    # =============================================================================
    Write-Host ""
    Write-Host "[5/6] 打包..." -ForegroundColor Yellow

    function New-ReleaseZip($srcDir, $zipPath) {
        Add-Type -AssemblyName System.IO.Compression
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $fs = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
        $archive = $null
        try {
            $archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create, $false, [System.Text.Encoding]::UTF8)
            Get-ChildItem -Path $srcDir -Recurse -File -Force | ForEach-Object {
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

    $fileCount = (Get-ChildItem -Path $cloneDir -Recurse -File -Force | Measure-Object).Count
    Write-Host "  待打包文件数: $fileCount" -ForegroundColor Gray
    New-ReleaseZip $cloneDir $Out
    $zipSize = (Get-Item $Out).Length
    $zipSizeMB = [math]::Round($zipSize / 1MB, 2)
    Write-Host "  ✅ 打包完成: $fileCount 个文件，${zipSizeMB} MB" -ForegroundColor Green

    # =============================================================================
    # 6. 校验
    # =============================================================================
    Write-Host ""
    Write-Host "[6/6] 校验 zip 内容..." -ForegroundColor Yellow

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Out)
    $entries = $zip.Entries
    $hasEnv = ($entries | Where-Object { $_.FullName -match '(^|/)\.env$|(^|/)ftp\.txt$|(^|/)token\.txt$' } | Measure-Object).Count
    $hasNM = ($entries | Where-Object { $_.FullName -match 'node_modules/' } | Measure-Object).Count
    $hasGit = ($entries | Where-Object { $_.FullName -match '^\.git/' } | Measure-Object).Count
    $docCount = ($entries | Where-Object { $_.FullName -match '^部署说明\.md$|^开发日志\.md$|^API文档\.md$|^数据库结构\.md$' } | Measure-Object).Count
    $zip.Dispose()

    Write-Host "  总文件数: $($entries.Count)" -ForegroundColor Gray
    if ($hasEnv -gt 0) { Write-Host "  ❌ 发现敏感文件！" -ForegroundColor Red; exit 1 }
    else { Write-Host "  ✅ 无敏感凭据" -ForegroundColor Green }
    if ($hasNM -gt 0) { Write-Host "  ⚠ 发现 node_modules" -ForegroundColor Yellow }
    else { Write-Host "  ✅ 无 node_modules" -ForegroundColor Green }
    if ($hasGit -eq 0) { Write-Host "  ❌ 缺少 .git 历史！" -ForegroundColor Red; exit 1 }
    else { Write-Host "  ✅ 包含 .git 完整历史（$($entries | Where-Object { $_.FullName -match '^\.git/' } | Measure-Object | Select-Object -ExpandProperty Count) 个条目）" -ForegroundColor Green }
    if ($docCount -lt 4) { Write-Host "  ⚠ 文档不完整" -ForegroundColor Yellow }
    else { Write-Host "  ✅ 核心文档齐全（部署说明/开发日志/API文档/数据库结构）" -ForegroundColor Green }

    # =============================================================================
    # 完成
    # =============================================================================
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  移交包已生成！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  文件: $Out" -ForegroundColor White
    Write-Host "  大小: ${zipSizeMB} MB  （git 历史已从 689MB 清理至 $([math]::Round($newGitSize / 1MB, 1)) MB）" -ForegroundColor White
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║  发给对方时建议附上以下交接说明：                            ║" -ForegroundColor Cyan
    Write-Host "  ╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host "  ║  1. 解压后 git 历史完整可用（已清理旧凭据与冗余大文件，       ║" -ForegroundColor Yellow
    Write-Host "  ║     提交哈希已重写，与本地仓库不再一致，请以新仓库为准）      ║" -ForegroundColor Yellow
    Write-Host "  ║  2. 首次运行前: npm install（node-jinmao 和 WEB 各一次）      ║" -ForegroundColor Yellow
    Write-Host "  ║  3. 部署与配置见 部署说明.md；开发历程见 开发日志.md           ║" -ForegroundColor Yellow
    Write-Host "  ║  4. 敏感凭据（数据库密码/API Key/SMTP 授权码）已刻意排除，     ║" -ForegroundColor Yellow
    Write-Host "  ║     需要时向原开发者单独索取并填写 node-jinmao/.env           ║" -ForegroundColor Yellow
    Write-Host "  ║  5. 管理员后台安全后缀: $suffix" -ForegroundColor Magenta
    Write-Host "  ╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
} finally {
    # 清理临时目录（无论成功失败）
    Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
