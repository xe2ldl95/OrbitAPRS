# Native Installation

OrbitAPRS can be installed as a native desktop application on Windows, macOS, and Linux.

## Prerequisites

- **Node.js** 18+ (for building)
- **npm** 9+ (for dependencies)

## Quick Start

```bash
# Install dependencies
npm install

# Build for current platform
npm run build

# Run as Electron app
npm run electron
```

## Platform-Specific Installers

### Windows

```powershell
# Build NSIS installer
.\scripts\build-windows.ps1

# Build portable (.exe)
.\scripts\build-windows.ps1 -Portable
```

Output: `dist/OrbitAPRS Setup x.x.x.exe` or `dist/OrbitAPRS x.x.x.exe`

### macOS

```bash
# Build DMG installer
./scripts/build-macos.sh
```

Output: `dist/OrbitAPRS-x.x.x.dmg`

### Linux

```bash
# Build DEB package
./scripts/build-linux.sh
```

Output: `orbitaprs-x.x.x-amd64.deb`

## Build System

The build system copies all application files into `dist/`:

```
dist/
├── index.html
├── manifest.json
├── sw.js
├── css/
├── js/
├── icons/
├── version.txt
└── build-info.json
```

## Electron Wrapper

The Electron wrapper (`main.js`, `preload.js`) provides:
- Native window management
- System tray integration
- File protocol handling
- IPC communication between main and renderer processes

## Development Mode

```bash
# Build with dev flags
npm run build:dev

# Watch mode (auto-rebuild on changes)
npm run start

# Electron with dev tools
npm run electron:dev
```

## Updating

### Version Bumping

```powershell
.\ver-upgd.ps1 -NewVersion "1.8.0"
```

### Auto-Update

Electron apps built with electron-builder support auto-update when hosted on a suitable backend (GitHub Releases, S3, etc.).

## Troubleshooting

### Windows Build Issues

If electron-builder fails, try:
```powershell
npm rebuild
npm install --legacy-peer-deps
```

### macOS Code Signing

For distribution, you need an Apple Developer account:
```bash
npx electron-builder --mac --sign
```

### Linux Dependencies

Linux builds may require additional system packages:
```bash
sudo apt-get install dpkg-dev fakeroot rpm
```