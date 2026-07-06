# =============================================================================
#  JinMao Full-Stack Quick Start
#  Starts backend (node-jinmao, port 8888) and frontend (WEB, port 30000)
#  Usage: .\start.ps1
# =============================================================================

$ErrorActionPreference = "Continue"

$rootDir = $PSScriptRoot
$backendDir = "$rootDir\node-jinmao"
$frontendDir = "$rootDir\WEB"
$backendPort = 8888
$frontendPort = 30000

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JinMao Full-Stack Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# 1. Port cleanup
# =============================================================================
Write-Host "[Step 1/5] Port check and cleanup" -ForegroundColor Yellow

function Clear-Port($port, $label) {
    Write-Host "  Checking port $port ($label)..." -ForegroundColor Gray
    $match = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
    if (-not $match) {
        Write-Host "    Port $port is free" -ForegroundColor Green
        return
    }
    $parts = $match -split '\s+' | Where-Object { $_ -ne '' }
    $pidVal = $parts[-1]
    Write-Host "    Port $port in use by PID=$pidVal, stopping..." -ForegroundColor Yellow
    Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    $still = netstat -ano 2>$null | Select-String ":$port\s" | Select-String "LISTENING"
    if ($still) {
        Write-Host "    Failed! Please close PID=$pidVal manually" -ForegroundColor Red
        exit 1
    }
    Write-Host "    Port $port released" -ForegroundColor Green
}

Clear-Port $backendPort "Express backend"
Clear-Port $frontendPort "Vite frontend"

# =============================================================================
# 2. Backend env check
# =============================================================================
Write-Host ""
Write-Host "[Step 2/5] Backend check (node-jinmao)" -ForegroundColor Yellow

if (-not (Test-Path "$backendDir\.env")) {
    Write-Host "  ERROR: .env not found! Copy .env.example to .env first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  .env found" -ForegroundColor Green

Push-Location $backendDir
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing backend dependencies..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Host "  npm install failed!" -ForegroundColor Red; Pop-Location; Read-Host "Press Enter to exit"; exit 1 }
    Write-Host "  Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  Dependencies ready" -ForegroundColor Green
}

Write-Host "  Prisma init..." -ForegroundColor Gray
npx prisma generate 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "    WARN: prisma generate failed" -ForegroundColor Yellow }
npx prisma migrate deploy 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "    WARN: prisma migrate deploy failed" -ForegroundColor Yellow }
Write-Host "  Prisma done" -ForegroundColor Green
Pop-Location

# =============================================================================
# 3. Frontend dep check
# =============================================================================
Write-Host ""
Write-Host "[Step 3/5] Frontend check (WEB)" -ForegroundColor Yellow

Push-Location $frontendDir
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Host "  npm install failed!" -ForegroundColor Red; Pop-Location; Read-Host "Press Enter to exit"; exit 1 }
    Write-Host "  Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  Dependencies ready" -ForegroundColor Green
}
Pop-Location

# =============================================================================
# 4. Start backend (new window)
# =============================================================================
Write-Host ""
Write-Host "[Step 4/5] Start backend (port $backendPort)" -ForegroundColor Yellow

# Use cmd /k to avoid any bat file encoding issues
# /k = keep window open after command completes
$backendCmd = "/k cd /d `"$backendDir`" && title JinMao-Backend-8888 && echo ======================================== && echo   Backend - Express Server && echo   Port: $backendPort && echo ======================================== && echo. && node app.js"
Start-Process cmd -ArgumentList $backendCmd

Write-Host "  Backend started in new window" -ForegroundColor Green

# Wait for backend port to be ready (max 30s)
Write-Host "  Waiting for backend..." -ForegroundColor Gray
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 1
    $portReady = netstat -ano 2>$null | Select-String ":$backendPort\s" | Select-String "LISTENING"
    if ($portReady) {
        Write-Host "  Backend ready! (${i}s)" -ForegroundColor Green
        $ready = $true
        break
    }
}
if (-not $ready) {
    Write-Host "  WARN: Backend not ready after 30s, check the backend window" -ForegroundColor Yellow
}

# =============================================================================
# 5. Start frontend (new window)
# =============================================================================
Write-Host ""
Write-Host "[Step 5/5] Start frontend (port $frontendPort)" -ForegroundColor Yellow

$frontendCmd = "/k cd /d `"$frontendDir`" && title JinMao-Frontend-30000 && echo ======================================== && echo   Frontend - Vite Dev Server && echo   Port: $frontendPort && echo   Proxy: /api -^> http://localhost:$backendPort && echo ======================================== && echo. && npm run dev"
Start-Process cmd -ArgumentList $frontendCmd

Write-Host "  Frontend started in new window" -ForegroundColor Green

# Wait for frontend port
for ($i = 1; $i -le 15; $i++) {
    Start-Sleep -Seconds 1
    $portReady = netstat -ano 2>$null | Select-String ":$frontendPort\s" | Select-String "LISTENING"
    if ($portReady) {
        Write-Host "  Frontend ready! (${i}s)" -ForegroundColor Green
        break
    }
}

# =============================================================================
# Done
# =============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  All services started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Backend API:   http://localhost:$backendPort" -ForegroundColor White
Write-Host "  API Docs:      http://localhost:$backendPort/api/v1/docs" -ForegroundColor White
Write-Host "  Frontend:      http://localhost:$frontendPort" -ForegroundColor White
Write-Host ""
Write-Host "  Close each window to stop the corresponding service." -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close this window (services keep running)..."
