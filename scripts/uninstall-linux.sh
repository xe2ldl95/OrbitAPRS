#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/OrbitAPRS}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}   OrbitAPRS Uninstaller (Linux)${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

confirm() {
    read -r -p "$1 [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

# Remove cloned repo
if [ -d "$INSTALL_DIR" ]; then
    if confirm "Remove installation directory '$INSTALL_DIR'?"; then
        rm -rf "$INSTALL_DIR"
        echo -e "  ${GREEN}✓${NC} Removed $INSTALL_DIR"
    fi
else
    echo -e "  ${YELLOW}Not found:${NC} $INSTALL_DIR"
fi

# Remove desktop launcher
LAUNCHER_DIR="$HOME/.local/share/orbitaprs"
if [ -d "$LAUNCHER_DIR" ]; then
    if confirm "Remove launcher files '$LAUNCHER_DIR'?"; then
        rm -rf "$LAUNCHER_DIR"
        echo -e "  ${GREEN}✓${NC} Removed $LAUNCHER_DIR"
    fi
fi

# Remove desktop entry
DESKTOP_ENTRY="$HOME/.local/share/applications/orbitaprs.desktop"
if [ -f "$DESKTOP_ENTRY" ]; then
    if confirm "Remove desktop menu entry?"; then
        rm -f "$DESKTOP_ENTRY"
        echo -e "  ${GREEN}✓${NC} Removed desktop entry"
    fi
fi

# Remove icon
ICON="$HOME/.local/share/icons/hicolor/512x512/apps/orbitaprs.png"
if [ -f "$ICON" ]; then
    rm -f "$ICON"
    echo -e "  ${GREEN}✓${NC} Removed icon"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  OrbitAPRS uninstalled.${NC}"
echo ""
echo -e "${YELLOW}Node.js and system packages were NOT removed.${NC}"
echo -e "If you want to remove Node.js:"
echo -e "  nvm uninstall --lts     (if installed via nvm)"
echo -e "  or use your package manager (apt, pacman, etc.)"
echo -e "${GREEN}========================================${NC}"
