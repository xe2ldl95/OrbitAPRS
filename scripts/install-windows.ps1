# OrbitAPRS Windows Installer
# Auto-installs Node.js, Git, clones repo, builds, and creates launcher

param(
    [string]$InstallDir = "$env:USERPROFILE\OrbitAPRS",
    [switch]$NoShortcut
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/xe2ldl95/OrbitAPRS.git"

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
        $ver = node --version
        Write-Host "  Node.js $ver already installed." -ForegroundColor Green
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
        throw "Node.js installation failed. Please install manually from https://nodejs.org"
    }
    Write-Host "  Node.js $(node --version) installed." -ForegroundColor Green
}

function Install-Git {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host "  Git already installed." -ForegroundColor Green
        return
    }
    Write-Step "Installing Git..."

    $wingetAvailable = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetAvailable) {
        & winget install -e --id Git.Git --silent --accept-package-agreements 2>&1
        if ($LASTEXITCODE -eq 0) {
            $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
            if (Get-Command git -ErrorAction SilentlyContinue) { return }
        }
    }

    Write-Host "  Downloading Git installer..." -ForegroundColor DarkYellow
    $url = "https://github.com/git-for-windows/git/releases/download/v2.48.1.windows.1/Git-2.48.1-64-bit.exe"
    $exe = "$env:TEMP\git-install.exe"
    Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
    $installArgs = "/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS=`"icons,ext,reg,assoc,gitlfs`""
    if (-not (Test-Admin)) {
        Start-Process $exe -Wait -Verb RunAs -ArgumentList $installArgs
    } else {
        Start-Process $exe -Wait -ArgumentList $installArgs
    }

    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git installation failed. Please install manually from https://git-scm.com"
    }
    Write-Host "  Git installed." -ForegroundColor Green
}

# ── Main ──
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "     OrbitAPRS Windows Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Install-NodeJS
Install-Git

# Clone or update repo
if (Test-Path -LiteralPath $InstallDir) {
    Write-Step "Updating existing installation at $InstallDir..."
    Set-Location -LiteralPath $InstallDir
    git pull
    if (-not $?) { throw "git pull failed" }
} else {
    Write-Step "Cloning repository to $InstallDir..."
    git clone $RepoUrl $InstallDir
    if (-not $?) { throw "git clone failed" }
    Set-Location -LiteralPath $InstallDir
}

# Install npm dependencies
Write-Step "Installing npm dependencies..."
npm install
if (-not $?) { throw "npm install failed" }

# Build web assets
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
