#!/bin/bash
# Installer script for Linux (DEB package)

set -e

# Configuration
PACKAGE_NAME="orbitaprs"
VERSION="1.7.15"
MAINTAINER="XE2LDL - Luis <xe2ldl95@example.com>"
DESCRIPTION="APRS satellite and terrestrial communication app"
ARCH="amd64"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Create package structure
mkdir -p "$TEMP_DIR/usr/local/bin"
mkdir -p "$TEMP_DIR/usr/share/applications"
mkdir -p "$TEMP_DIR/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$TEMP_DIR/DEBIAN"

# Copy application files
cp -r "dist/" "$TEMP_DIR/usr/local/bin/$PACKAGE_NAME/"
cp "build-resources/icon.png" "$TEMP_DIR/usr/share/icons/hicolor/256x256/apps/$PACKAGE_NAME.png"

# Create desktop entry
cat > "$TEMP_DIR/usr/share/applications/$PACKAGE_NAME.desktop" << EOF
[Desktop Entry]
Version=$VERSION
Type=Application
Name=OrbitAPRS
Comment=$DESCRIPTION
Exec=/usr/local/bin/$PACKAGE_NAME/run.sh
Icon=$PACKAGE_NAME
Terminal=false
Categories=Utility;Science;Communication;
EOF

# Create run script
cat > "$TEMP_DIR/usr/local/bin/$PACKAGE_NAME/run.sh" << EOF
#!/bin/bash
cd "\$(dirname "\$0")/../$PACKAGE_NAME"
exec electron . "\$@"
EOF
chmod +x "$TEMP_DIR/usr/local/bin/$PACKAGE_NAME/run.sh"

# Create control file
cat > "$TEMP_DIR/DEBIAN/control" << EOF
Package: $PACKAGE_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Maintainer: $MAINTAINER
Description: $DESCRIPTION
EOF

# Build the package
cd "$TEMP_DIR"
dpkg-deb --build $PACKAGE_NAME ../$PACKAGE_NAME-$VERSION-$ARCH.deb

# Clean up
rm -rf "$TEMP_DIR"

echo "DEB package created: $PACKAGE_NAME-$VERSION-$ARCH.deb"