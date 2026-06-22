# Windows Installer Script for OrbitAPRS
# Uses electron-builder to create NSIS installer and portable build

param(
    [switch]$Portable,
    [switch]$Dev,
    [string]$Arch = "x64"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Write-Host "=== OrbitAPRS Windows Installer Builder ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build the application
Write-Host "[1/4] Building application..." -ForegroundColor Yellow
Set-Location -LiteralPath $ProjectDir
node build.js
if (-not $?) { Write-Error "Build failed"; exit 1 }

# Step 2: Check for electron-builder
Write-Host "[2/4] Checking electron-builder..." -ForegroundColor Yellow
$builderPath = Join-Path $ProjectDir "node_modules\.bin\electron-builder.cmd"
if (-not (Test-Path -LiteralPath $builderPath)) {
    Write-Host "  Installing electron-builder..." -ForegroundColor DarkYellow
    npm install electron-builder --save-dev --legacy-peer-deps
}

# Step 3: Build the installer
Write-Host "[3/4] Building installer..." -ForegroundColor Yellow
$electronArgs = @()

if ($Portable) {
    Write-Host "  Target: Portable (single .exe)" -ForegroundColor Green
    $electronArgs += "--win=portable"
} else {
    Write-Host "  Target: NSIS Installer" -ForegroundColor Green
    $electronArgs += "--win=nsis"
}

if ($Dev) {
    $electronArgs += "--dev"
}

$electronArgs += "--arch=$Arch"
$electronArgs += "--config"

# Run electron-builder
& npx electron-builder $electronArgs
if (-not $?) { Write-Error "Installer build failed"; exit 1 }

# Step 4: Show output
Write-Host "[4/4] Build complete!" -ForegroundColor Green
Write-Host ""
$outputDir = Join-Path $ProjectDir "dist"
if (Test-Path -LiteralPath $outputDir) {
    Get-ChildItem -Path $outputDir -Filter "*.exe" | ForEach-Object {
        Write-Host "  Created: $($_.FullName)" -ForegroundColor Cyan
    }
    Get-ChildItem -Path $outputDir -Filter "*.dmg" | ForEach-Object {
        Write-Host "  Created: $($_.FullName)" -ForegroundColor Cyan
    }
}
Write-Host ""
Write-Host "Done!" -ForegroundColor Green