#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/.local/share/orbitaprs"
mkdir -p "$APP_DIR"
mkdir -p "$HOME/.local/share/applications"
mkdir -p "$HOME/.local/share/icons/hicolor/512x512/apps"

# Copy launcher script
cp "$DIR/scripts/orbitaprs.sh" "$APP_DIR/orbitaprs.sh"
chmod +x "$APP_DIR/orbitaprs.sh"

# Copy icon
cp "$DIR/icons/icon-512.png" "$HOME/.local/share/icons/hicolor/512x512/apps/orbitaprs.png"

# Create desktop entry pointing directly to the script
cat > "$HOME/.local/share/applications/orbitaprs.desktop" << EOF
[Desktop Entry]
Type=Application
Name=OrbitAPRS
Comment=APRS satellite and terrestrial communication app
Exec=$APP_DIR/orbitaprs.sh
Icon=orbitaprs
Terminal=false
Categories=HamRadio;Network;
StartupWMClass=OrbitAPRS
EOF

echo ""
echo "OrbitAPRS installed in application menu."
echo "If it doesn't appear, run:"
echo "  update-desktop-database ~/.local/share/applications/"
echo "Or log out and back in."
