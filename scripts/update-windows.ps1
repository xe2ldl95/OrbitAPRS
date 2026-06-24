# OrbitAPRS Windows Updater
# Downloads latest source, rebuilds, and prompts to restart

param(
    [string]$InstallDir = "$env:USERPROFILE\OrbitAPRS"
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/xe2ldl95/OrbitAPRS"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "     OrbitAPRS Updater (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $InstallDir)) {
    Write-Host "Installation not found at $InstallDir" -ForegroundColor Red
    Write-Host "Run install-windows.ps1 first:" -ForegroundColor Yellow
    Write-Host "  curl.exe -L $RepoUrl/raw/main/scripts/install-windows.ps1 | powershell -c -" -ForegroundColor White
    exit 1
}

Set-Location -LiteralPath $InstallDir

Write-Host "[1/3] Downloading latest version..." -ForegroundColor Yellow
$zipUrl = "$RepoUrl/archive/main.tar.gz"
$tarGz = "$env:TEMP\orbitaprs-update.tar.gz"
curl.exe -L --silent --output $tarGz $zipUrl
tar -xzf $tarGz --strip-components=1 -C $InstallDir
Remove-Item -Path $tarGz -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] Updating npm dependencies..." -ForegroundColor Yellow
npm install
if (-not $?) { throw "npm install failed" }

Write-Host "[3/3] Rebuilding application..." -ForegroundColor Yellow
npm run build
if (-not $?) { throw "Build failed" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  OrbitAPRS has been updated." -ForegroundColor Green
Write-Host "  Close and reopen the application." -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
