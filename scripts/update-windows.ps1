# OrbitAPRS Windows Updater
# Pulls latest changes, rebuilds, and prompts to restart

param(
    [string]$InstallDir = "$env:USERPROFILE\OrbitAPRS"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "     OrbitAPRS Updater (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $InstallDir)) {
    Write-Host "Installation not found at $InstallDir" -ForegroundColor Red
    Write-Host "Run install-windows.ps1 first, or specify a custom path:" -ForegroundColor Yellow
    Write-Host "  .\scripts\update-windows.ps1 -InstallDir `"C:\path\to\OrbitAPRS`"" -ForegroundColor White
    exit 1
}

Set-Location -LiteralPath $InstallDir

Write-Host "[1/4] Pulling latest code..." -ForegroundColor Yellow
git pull
if (-not $?) { throw "git pull failed" }

Write-Host "[2/4] Updating npm dependencies..." -ForegroundColor Yellow
npm install
if (-not $?) { throw "npm install failed" }

Write-Host "[3/4] Rebuilding application..." -ForegroundColor Yellow
npm run build
if (-not $?) { throw "Build failed" }

Write-Host "[4/4] Update complete!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  OrbitAPRS has been updated." -ForegroundColor Green
Write-Host "  Close and reopen the application." -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
