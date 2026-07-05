#=============================================================================
#  node-jinmao Quick Start Script
#  Stops any existing server on port 8888, then starts a new one.
#  Usage: .\start.ps1
#=============================================================================

$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8888
$entryFile = "app.js"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  node-jinmao Quick Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Check if port is already in use ---
Write-Host "[1/3] Checking port $port ..." -ForegroundColor Yellow
$portInUse = netstat -ano | Select-String ":$port " | Select-String "LISTENING"

if ($portInUse) {
    $line = $portInUse -split '\s+'
    $existingPid = $line[$line.Length - 1]
    Write-Host "  Port $port is in use by PID=$existingPid, stopping..." -ForegroundColor Yellow
    
    # Try to stop the process
    Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    # Verify port is now free
    $stillInUse = netstat -ano | Select-String ":$port " | Select-String "LISTENING"
    if ($stillInUse) {
        Write-Host "  Failed to stop PID=$existingPid. Please close it manually." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Process PID=$existingPid stopped." -ForegroundColor Green
} else {
    Write-Host "  Port $port is free." -ForegroundColor Green
}

# --- 2. Check dependencies ---
Write-Host ""
Write-Host "[2/3] Checking dependencies..." -ForegroundColor Yellow
Set-Location $projectDir

# --- 2.1 检查 .env 文件 ---
Write-Host "  Checking .env file..." -ForegroundColor Gray
if (-not (Test-Path ".env")) {
    Write-Host "  .env file not found!" -ForegroundColor Red
    if (Test-Path ".env.example") {
        Write-Host "  Please copy .env.example to .env and fill in your credentials:" -ForegroundColor Yellow
        Write-Host "    cp .env.example .env" -ForegroundColor Gray
    } else {
        Write-Host "  Please create a .env file with the required API credentials." -ForegroundColor Yellow
    }
    exit 1
}
Write-Host "  .env file found." -ForegroundColor Green

# --- 2.2 检查依赖 ---
if (-not (Test-Path "node_modules")) {
    Write-Host "  node_modules not found, installing..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  npm install failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Dependencies installed." -ForegroundColor Green
} else {
    Write-Host "  Dependencies already installed." -ForegroundColor Green
}

# --- 2.3 Prisma 初始化 ---
Write-Host "  Initializing Prisma..." -ForegroundColor Gray

# 生成 Prisma Client（类型安全的数据库查询客户端）
Write-Host "    Running prisma generate..." -ForegroundColor Gray
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "  prisma generate failed!" -ForegroundColor Yellow
    Write-Host "  Please check DATABASE_URL in .env and ensure MySQL is running." -ForegroundColor Yellow
    # 不退出，允许继续启动（Prisma 可能尚未初始化）
}

# 执行数据库迁移（确保数据库结构最新）
Write-Host "    Running prisma migrate deploy..." -ForegroundColor Gray
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "  prisma migrate deploy failed!" -ForegroundColor Yellow
    Write-Host "  First time setup: run 'npx prisma migrate dev --name init_auth' manually." -ForegroundColor Yellow
    # 不退出，允许继续启动
}

Write-Host "  Prisma initialization completed." -ForegroundColor Green

# --- 3. Start server ---
Write-Host ""
Write-Host "[3/3] Starting server..." -ForegroundColor Yellow
Write-Host "  Entry: $entryFile" -ForegroundColor Gray
Write-Host "  Port:  $port" -ForegroundColor Gray
Write-Host ""

node $entryFile

Write-Host ""
Write-Host "Server stopped." -ForegroundColor Yellow
Write-Host ""
Read-Host -Prompt "按 Enter 键退出..."
