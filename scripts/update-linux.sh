#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/xe2ldl95/OrbitAPRS"
INSTALL_DIR="${INSTALL_DIR:-$HOME/OrbitAPRS}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}     OrbitAPRS Updater (Linux)${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Installation not found at $INSTALL_DIR${NC}"
    echo -e "${YELLOW}Run install-linux.sh first:${NC}"
    echo -e "  ${CYAN}curl -L $REPO/raw/main/scripts/install-linux.sh | bash${NC}"
    exit 1
fi

cd "$INSTALL_DIR"

echo -e "${YELLOW}[1/3]${NC} Downloading latest version..."
curl -L "$REPO/archive/main.tar.gz" | tar xz --strip-components=1 -C "$INSTALL_DIR"

echo -e "${YELLOW}[2/3]${NC} Updating npm dependencies..."
npm install

echo -e "${YELLOW}[3/3]${NC} Rebuilding application..."
npm run build

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  OrbitAPRS updated successfully!${NC}"
echo -e "  Close and reopen the application."
echo -e "${GREEN}========================================${NC}"
