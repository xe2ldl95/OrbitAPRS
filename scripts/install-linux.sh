#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/xe2ldl95/OrbitAPRS"
INSTALL_DIR="${INSTALL_DIR:-$HOME/OrbitAPRS}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

step() { echo -e "\n${YELLOW}>>${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
err()  { echo -e "  ${RED}✗${NC} $1"; }

detect_pkg_manager() {
    if command -v apt &>/dev/null; then
        PKG_INSTALL="sudo apt install -y"; PKG_UPDATE="sudo apt update"
    elif command -v pacman &>/dev/null; then
        PKG_INSTALL="sudo pacman -S --noconfirm"; PKG_UPDATE="sudo pacman -Sy"
    elif command -v dnf &>/dev/null; then
        PKG_INSTALL="sudo dnf install -y"; PKG_UPDATE="sudo dnf check-update || true"
    elif command -v zypper &>/dev/null; then
        PKG_INSTALL="sudo zypper install -y"; PKG_UPDATE="sudo zypper refresh"
    else
        err "Unsupported package manager."
        echo "Install Node.js manually from https://nodejs.org, then re-run this script."
        exit 1
    fi
}

install_nodejs() {
    if command -v node &>/dev/null; then
        ok "Node.js $(node --version) already installed"; return
    fi
    step "Installing Node.js..."
    case "$PKG_INSTALL" in
        *apt*)
            if ! command -v curl &>/dev/null; then $PKG_UPDATE; $PKG_INSTALL curl gnupg; fi
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            $PKG_INSTALL nodejs
            ;;
        *pacman*) $PKG_UPDATE; $PKG_INSTALL nodejs npm ;;
        *dnf*)    $PKG_UPDATE; $PKG_INSTALL nodejs npm ;;
        *zypper*) $PKG_UPDATE; $PKG_INSTALL nodejs npm ;;
    esac
    if ! command -v node &>/dev/null; then err "Node.js install failed."; exit 1; fi
    ok "Node.js $(node --version) installed"
}

download_repo() {
    step "Downloading OrbitAPRS..."
    mkdir -p "$INSTALL_DIR"
    curl -L "$REPO/archive/main.tar.gz" | tar xz --strip-components=1 -C "$INSTALL_DIR"
    ok "Source code downloaded"
}

# ── Main ──
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}     OrbitAPRS Linux Installer${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

detect_pkg_manager
install_nodejs
download_repo

cd "$INSTALL_DIR"

step "Installing npm dependencies (this downloads Electron, may take a while)..."
npm install
ok "Dependencies installed"

step "Building application..."
npm run build
ok "Build complete"

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
echo -e "  To update:  ${CYAN}curl -L $REPO/raw/main/scripts/update-linux.sh | bash${NC}"
echo -e "${GREEN}========================================${NC}"
