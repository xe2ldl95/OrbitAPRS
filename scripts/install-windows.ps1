# OrbitAPRS Windows Installer
# Auto-installs Node.js, downloads source, builds, and creates launcher

param(
    [string]$InstallDir = "$env:USERPROFILE\OrbitAPRS",
    [switch]$NoShortcut
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/xe2ldl95/OrbitAPRS"

function Write-Step {
    param([string]$Message, [string]$Color = "Yellow")
    Write-Host ""; Write-Host ">> $Message" -ForegroundColor $Color
}

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-NodeJS {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        Write-Host "  Node.js $(node --version) already installed." -ForegroundColor Green
        return
    }
    Write-Step "Installing Node.js..."

    $wingetAvailable = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetAvailable) {
        Write-Host "  Trying winget..." -ForegroundColor DarkYellow
        & winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements 2>&1
        if ($LASTEXITCODE -eq 0) {
            $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
            refreshenv 2>$null
            if (Get-Command node -ErrorAction SilentlyContinue) { return }
        }
    }

    Write-Host "  Downloading Node.js MSI..." -ForegroundColor DarkYellow
    $nodeVersion = "22.14.0"
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    $url = "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-$arch.msi"
    $msi = "$env:TEMP\node-install.msi"
    Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing

    $installArgs = "/i `"$msi`" /quiet /norestart"
    if (-not (Test-Admin)) {
        Write-Host "  Requesting admin privileges for Node.js installation..." -ForegroundColor DarkYellow
        Start-Process msiexec.exe -Wait -Verb RunAs -ArgumentList $installArgs
    } else {
        Start-Process msiexec.exe -Wait -ArgumentList $installArgs
    }

    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js installation failed. Install manually from https://nodejs.org"
    }
    Write-Host "  Node.js $(node --version) installed." -ForegroundColor Green
}

function Download-Source {
    Write-Step "Downloading OrbitAPRS..."

    if (-not (Test-Path -LiteralPath $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $zipUrl = "$RepoUrl/archive/main.tar.gz"
    $tarGz = "$env:TEMP\orbitaprs.tar.gz"

    Write-Host "  Downloading..." -ForegroundColor DarkYellow
    curl.exe -L --silent --output $tarGz $zipUrl

    Write-Host "  Extracting..." -ForegroundColor DarkYellow
    tar -xzf $tarGz --strip-components=1 -C $InstallDir

    Remove-Item -Path $tarGz -Force -ErrorAction SilentlyContinue
    Write-Host "  Source code downloaded to $InstallDir" -ForegroundColor Green
}

# ── Main ──
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "     OrbitAPRS Windows Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Install-NodeJS
Download-Source

Set-Location -LiteralPath $InstallDir

Write-Step "Installing npm dependencies (this downloads Electron, may take a while)..."
npm install
if (-not $?) { throw "npm install failed" }

Write-Step "Building application..."
npm run build
if (-not $?) { throw "Build failed" }

# Create launcher batch file
Write-Step "Creating launcher..."
$launcherContent = @"
@echo off
cd /d "$InstallDir"
call npm run electron
"@
$launcherPath = "$InstallDir\OrbitAPRS.bat"
Set-Content -Path $launcherPath -Value $launcherContent -Encoding ASCII

# Create desktop shortcut
if (-not $NoShortcut) {
    Write-Step "Creating desktop shortcut..."
    try {
        $WScriptShell = New-Object -ComObject WScript.Shell
        $shortcut = $WScriptShell.CreateShortcut("$env:USERPROFILE\Desktop\OrbitAPRS.lnk")
        $shortcut.TargetPath = $launcherPath
        $shortcut.WorkingDirectory = $InstallDir
        $shortcut.Description = "OrbitAPRS - APRS satellite and terrestrial communication app"
        $shortcut.IconLocation = "$InstallDir\icons\icon-512.png"
        $shortcut.Save()
        Write-Host "  Shortcut created on Desktop." -ForegroundColor Green
    } catch {
        Write-Host "  Could not create shortcut: $_" -ForegroundColor DarkYellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  OrbitAPRS installed successfully!" -ForegroundColor Green
Write-Host "  Location: $InstallDir" -ForegroundColor Cyan
Write-Host ""
if (-not $NoShortcut) {
    Write-Host "  Run from: Desktop shortcut or:" -ForegroundColor White
}
Write-Host "  cd $InstallDir && npm run electron" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
