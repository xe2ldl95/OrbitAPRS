#!/bin/bash
# macOS Installer Script for OrbitAPRS
# Uses electron-builder to create DMG and PKG installers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== OrbitAPRS macOS Installer Builder ==="
echo ""

# Step 1: Build the application
echo "[1/4] Building application..."
cd "$PROJECT_DIR"
node build.js

# Step 2: Check for icon conversion (png -> icns)
echo "[2/4] Checking icons..."
ICON_SRC="$PROJECT_DIR/icons/icon-512.png"
ICON_DST="$PROJECT_DIR/build-resources/icon.icns"

if [ ! -f "$ICON_DST" ] && [ -f "$ICON_SRC" ]; then
    echo "  Converting PNG to ICNS..."
    if command -v sips &> /dev/null; then
        mkdir -p "$PROJECT_DIR/build-resources/icon.iconset"
        sips -z 16 16 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_16x16.png" 2>/dev/null || true
        sips -z 32 32 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_16x16@2x.png" 2>/dev/null || true
        sips -z 32 32 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_32x32.png" 2>/dev/null || true
        sips -z 64 64 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_32x32@2x.png" 2>/dev/null || true
        sips -z 128 128 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_128x128.png" 2>/dev/null || true
        sips -z 256 256 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_128x128@2x.png" 2>/dev/null || true
        sips -z 256 256 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_256x256.png" 2>/dev/null || true
        sips -z 512 512 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_256x256@2x.png" 2>/dev/null || true
        sips -z 512 512 "$ICON_SRC" --out "$PROJECT_DIR/build-resources/icon.iconset/icon_512x512.png" 2>/dev/null || true
        iconutil -c icns "$PROJECT_DIR/build-resources/icon.iconset" -o "$ICON_DST" 2>/dev/null || true
        rm -rf "$PROJECT_DIR/build-resources/icon.iconset"
        echo "  ICNS created: $ICON_DST"
    else
        echo "  WARNING: sips not available. Install Xcode Command Line Tools."
        echo "  Copy icon manually: cp \"$ICON_SRC\" \"$ICON_DST\""
        cp "$ICON_SRC" "$ICON_DST" 2>/dev/null || true
    fi
fi

# Step 3: Build DMG installer
echo "[3/4] Building DMG installer..."
cd "$PROJECT_DIR"
npx electron-builder --mac=dmg --config

# Step 4: Show output
echo "[4/4] Build complete!"
echo ""
if [ -d "$PROJECT_DIR/dist" ]; then
    ls -la "$PROJECT_DIR/dist/"*.dmg 2>/dev/null || echo "  No DMG files found"
    ls -la "$PROJECT_DIR/dist/"*.pkg 2>/dev/null || echo "  No PKG files found"
fi
echo ""
echo "Done!"