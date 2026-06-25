#!/bin/bash
set -euo pipefail

REPO="https://github.com/xe2ldl95/OrbitAPRS"
INSTALL_DIR="${INSTALL_DIR:-$HOME/OrbitAPRS}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

step() { echo -e "\n${YELLOW}>>${NC} $1"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  OrbitAPRS Bridge Installer${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ ! -d "$INSTALL_DIR" ]; then
    step "Creating $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR/scripts"
fi

step "Downloading bridge.py..."
curl -L "$REPO/raw/main/scripts/bridge.py" -o "$INSTALL_DIR/scripts/bridge.py"
chmod +x "$INSTALL_DIR/scripts/bridge.py"
ok "bridge.py downloaded"

# Stop and disable any existing orbitaprs-bridge service
if systemctl is-active --quiet orbitaprs-bridge.service 2>/dev/null; then
    step "Stopping existing orbitaprs-bridge service..."
    sudo systemctl stop orbitaprs-bridge
    sudo systemctl disable orbitaprs-bridge
    ok "Stopped"
fi

# Stop and disable the old websockify service (same unit name or old name)
for old_unit in orbitaprs-bridge orbitaprs-websockify; do
    if systemctl list-units --full -all 2>/dev/null | grep -q "$old_unit"; then
        sudo systemctl stop "$old_unit" 2>/dev/null || true
        sudo systemctl disable "$old_unit" 2>/dev/null || true
    fi
    if [ -f "/etc/systemd/system/${old_unit}.service" ]; then
        sudo rm "/etc/systemd/system/${old_unit}.service"
    fi
done

step "Installing systemd service..."
sudo tee /etc/systemd/system/orbitaprs-bridge.service << EOF
[Unit]
Description=OrbitAPRS WebSocket ↔ TCP bridge
After=direwolf.service

[Service]
Type=simple
User=pi
ExecStart=/usr/bin/python3 $INSTALL_DIR/scripts/bridge.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF
ok "Service file created"

step "Enabling and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable orbitaprs-bridge
sudo systemctl start orbitaprs-bridge
ok "Service running"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Bridge installed successfully!${NC}"
echo -e "${CYAN}  TCP → Dire Wolf:  localhost:8001${NC}"
echo -e "${CYAN}  WebSocket →  0.0.0.0:8102${NC}"
echo ""
echo -e "  Logs:  ${CYAN}sudo journalctl -u orbitaprs-bridge -f${NC}"
echo -e "${GREEN}========================================${NC}"
