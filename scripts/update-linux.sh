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
echo -e "${CYAN}     OrbitAPRS Updater (Linux)${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}Installation not found at $INSTALL_DIR${NC}"
    echo -e "${YELLOW}Run install-linux.sh first, or set INSTALL_DIR:${NC}"
    echo -e "  ${CYAN}INSTALL_DIR=/path/to/OrbitAPRS ./scripts/update-linux.sh${NC}"
    exit 1
fi

cd "$INSTALL_DIR"

echo -e "${YELLOW}[1/4]${NC} Pulling latest code..."
git pull

echo -e "${YELLOW}[2/4]${NC} Updating npm dependencies..."
npm install

echo -e "${YELLOW}[3/4]${NC} Rebuilding application..."
npm run build

echo -e "${YELLOW}[4/4]${NC} Update complete!"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  OrbitAPRS has been updated.${NC}"
echo -e "  Close and reopen the application."
echo -e "${GREEN}========================================${NC}"
