# Project rules

## Critical restrictions (permanent)
- **`main` branch is PWA-only** — must NOT include any Capacitor/Android code. Uses browser WebSerial/WebBluetooth.
- **`android-capacitor` branch** is the Android APK version with Capacitor plugins (USB Serial, BLE).
- **NEVER merge `android-capacitor` into `main`** or apply Capacitor-specific changes to `main`.
- **Always test locally before committing/pushing.** No blind commits.

## Branch roles
- `main` — Production PWA (web/Chrome). Source of truth for core logic.
- `android-capacitor` — Android APK via Capacitor. Rebase onto `main` for core fixes.

## Codebase facts
- `js/aprs.js` — AX.25, Mic-E, frame building/parsing.
- `js/ui.js` — UI logic, ACK system, chat, third-party packet expansion.
- `js/tnc.js` — TNC transport layer (differs between branches).
- Core logic files (`aprs.js`, `ui.js`, `logging.js`) should stay byte-identical between branches.
- Only `tnc.js`, `index.html`, `css/` may differ between branches.
- Dist files are built by `node build.cjs` — always rebuild before testing.
- ACK IDs are 2-digit (01-99, wrap at 99).
- Third-party packets show `[via GATEWAY]` in chat.
