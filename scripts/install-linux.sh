#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/xe2ldl95/OrbitAPRS.git"
INSTALL_DIR="${INSTALL_DIR:-$HOME/OrbitAPRS}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step()  { echo -e "\n${YELLOW}>>${NC} $1"; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
err()   { echo -e "  ${RED}✗${NC} $1"; }

detect_pkg_manager() {
    if command -v apt &>/dev/null; then
        PKG_MANAGER="apt"
        PKG_INSTALL="sudo apt install -y"
        PKG_UPDATE="sudo apt update"
    elif command -v pacman &>/dev/null; then
        PKG_MANAGER="pacman"
        PKG_INSTALL="sudo pacman -S --noconfirm"
        PKG_UPDATE="sudo pacman -Sy"
    elif command -v dnf &>/dev/null; then
        PKG_MANAGER="dnf"
        PKG_INSTALL="sudo dnf install -y"
        PKG_UPDATE="sudo dnf check-update || true"
    elif command -v zypper &>/dev/null; then
        PKG_MANAGER="zypper"
        PKG_INSTALL="sudo zypper install -y"
        PKG_UPDATE="sudo zypper refresh"
    else
        err "Unsupported package manager. Install Node.js manually."
        exit 1
    fi
    ok "Detected package manager: $PKG_MANAGER"
}

install_nodejs() {
    if command -v node &>/dev/null; then
        ok "Node.js $(node --version) already installed"
        return
    fi
    step "Installing Node.js..."

    # Prefer nvm (cleaner for users, no sudo)
    if command -v curl &>/dev/null; then
        echo "  Trying nvm..."
        export NVM_DIR="$HOME/.nvm"
        if [ ! -s "$NVM_DIR/nvm.sh" ]; then
            curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        fi
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        if nvm --version &>/dev/null; then
            nvm install --lts --latest-npm
            nvm use --lts
            ok "Node.js $(node --version) installed via nvm"
            return
        fi
    fi

    # Fallback: distribution packages
    echo "  Falling back to $PKG_MANAGER..."
    $PKG_UPDATE
    case "$PKG_MANAGER" in
        apt)   $PKG_INSTALL nodejs npm ;;
        pacman) $PKG_INSTALL nodejs npm ;;
        dnf)   $PKG_INSTALL nodejs npm ;;
        zypper) $PKG_INSTALL nodejs npm ;;
    esac

    if ! command -v node &>/dev/null; then
        err "Node.js installation failed. Install manually: https://nodejs.org"
        exit 1
    fi
    ok "Node.js $(node --version) installed"
}

install_git() {
    if command -v git &>/dev/null; then
        ok "Git already installed"
        return
    fi
    step "Installing Git..."
    $PKG_UPDATE
    $PKG_INSTALL git
    if ! command -v git &>/dev/null; then
        err "Git installation failed."
        exit 1
    fi
    ok "Git installed"
}

install_electron_deps() {
    step "Installing system dependencies for Electron..."
    case "$PKG_MANAGER" in
        apt)
            $PKG_INSTALL libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libdrm2 libgbm1 libxkbcommon0
            ;;
        pacman)
            $PKG_INSTALL gtk3 libnotify nss libxss xdg-utils
            ;;
        dnf)
            $PKG_INSTALL gtk3 libnotify nss libXScrnSaver xdg-utils
            ;;
        zypper)
            $PKG_INSTALL gtk3 libnotify4 nss libXScrnSaver xdg-utils
            ;;
    esac
    ok "System dependencies installed"
}

# ── Main ──
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}     OrbitAPRS Linux Installer${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

detect_pkg_manager
install_nodejs
install_git
install_electron_deps

# Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
    step "Updating existing installation at $INSTALL_DIR..."
    cd "$INSTALL_DIR"
    git pull
else
    step "Cloning repository to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install npm dependencies
step "Installing npm dependencies..."
npm install

# Build web assets
step "Building application..."
npm run build

# Desktop integration
step "Setting up desktop integration..."
bash "$SCRIPT_DIR/install-desktop.sh"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  OrbitAPRS installed successfully!${NC}"
echo -e "${CYAN}  Location: $INSTALL_DIR${NC}"
echo ""
echo -e "  Run from application menu or:"
echo -e "  ${CYAN}cd $INSTALL_DIR && npm run electron${NC}"
echo -e "${GREEN}========================================${NC}"
