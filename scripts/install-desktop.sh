#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.local/share/applications"
mkdir -p "$HOME/.local/share/icons/hicolor/512x512/apps"

# Copy icon
cp "$DIR/icons/icon-512.png" "$HOME/.local/share/icons/hicolor/512x512/apps/orbitaprs.png"

# Create desktop entry pointing to launcher script in the repo
cat > "$HOME/.local/share/applications/orbitaprs.desktop" << EOF
[Desktop Entry]
Type=Application
Name=OrbitAPRS
Comment=APRS satellite and terrestrial communication app
Exec=$DIR/scripts/orbitaprs.sh
Icon=orbitaprs
Terminal=false
Categories=HamRadio;Network;
StartupWMClass=OrbitAPRS
EOF

chmod +x "$DIR/scripts/orbitaprs.sh"

echo ""
echo "OrbitAPRS installed in application menu."
echo "If it doesn't appear, run:"
echo "  update-desktop-database ~/.local/share/applications/"
echo "Or log out and back in."
