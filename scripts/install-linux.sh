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

step() { echo -e "\n${YELLOW}>>${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
err()  { echo -e "  ${RED}✗${NC} $1"; }

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
        err "Unsupported package manager."
        echo "Install Node.js + git manually, then:"
        echo "  git clone $REPO_URL $INSTALL_DIR"
        echo "  cd $INSTALL_DIR && npm install && npm run build"
        exit 1
    fi
}

install_nodejs() {
    if command -v node &>/dev/null; then
        ok "Node.js $(node --version) already installed"
        return
    fi
    step "Installing Node.js..."
    case "$PKG_MANAGER" in
        apt)
            if ! command -v curl &>/dev/null; then
                $PKG_UPDATE; $PKG_INSTALL curl gnupg
            fi
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            $PKG_INSTALL nodejs
            ;;
        pacman)  $PKG_UPDATE; $PKG_INSTALL nodejs npm ;;
        dnf)     $PKG_UPDATE; $PKG_INSTALL nodejs npm ;;
        zypper)  $PKG_UPDATE; $PKG_INSTALL nodejs npm ;;
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
    $PKG_UPDATE; $PKG_INSTALL git
    ok "Git installed"
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

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
    step "Updating existing installation at $INSTALL_DIR..."
    cd "$INSTALL_DIR" && git pull
else
    step "Cloning repository to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# npm install (descarga Electron)
step "Installing npm dependencies (this downloads Electron, may take a while)..."
npm install
ok "Dependencies installed"

# Build
step "Building application..."
npm run build
ok "Build complete"

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
echo ""
echo -e "  To update:  ./scripts/update-linux.sh"
echo -e "  To uninstall:  ./scripts/uninstall-linux.sh"
echo -e "${GREEN}========================================${NC}"
