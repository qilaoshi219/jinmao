# =============================================================================
#  WEB (JinMao Frontend) Quick Start Script
#  Stops any existing server on port 30000, then starts a new one.
#  Usage: .\start.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 30000
$entryFile = "vite"  # Vite dev server，通过 npm run dev 启动

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JinMao Frontend Quick Start" -ForegroundColor Cyan
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

# --- 3. Start dev server ---
Write-Host ""
Write-Host "[3/3] Starting Vite dev server..." -ForegroundColor Yellow
Write-Host "  Port: $port" -ForegroundColor Gray
Write-Host "  Proxy: /api -> http://localhost:8888" -ForegroundColor Gray
Write-Host "  Open: http://localhost:$port" -ForegroundColor Gray
Write-Host ""

npm run dev

Write-Host ""
Write-Host "Server stopped." -ForegroundColor Yellow
Write-Host ""
Read-Host -Prompt "按 Enter 键退出..."
