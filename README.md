# OrbitAPRS

**APRS satellite and terrestrial communication app** — works in the browser with Web Serial, Web Bluetooth, and WebUSB to connect to KISS TNCs and CH340 devices.

---

## Features

### 🛰️ Satellite Mode
- Real-time satellite tracking via SGP4 propagation (built-in satellite.js library)
- Automatic TLE updates from Celestrak/AMSAT
- Satellite selection with pass prediction (in-range elevation, time to next pass)
- Doppler frequency display with automatic shift calculation
- Navigation compass view with satellite azimuth/elevation, phone tilt alignment indicator
- Map view with satellite position, ground track, coverage footprint
- APRS messaging through satellite digipeaters (ISS, PCSAT, IO-86, SONATE-2)
- Frequency overrides per satellite

### 📡 Terrestrial Mode
- APRS messaging over terrestrial digipeaters
- Path presets: WIDE1-1, WIDE1-1,WIDE2-1, WIDE2-2, DIRECT
- Heard stations shown on map with callsign labels

### 📨 Messaging
- **Macro system** with editable templates and configurable buttons
  - Tokens: `%C` (target with SSID), `%c` (target w/o SSID), `%M` (my callsign), `%G` (my grid), `%R` (remote grid), `%S` (satellite name), `%N` (sequence number)
  - 5 default macros: CQ, Rpt, 73, Msg, Pos
  - Custom macros can be added, edited, and reordered
- **Direct messages** — free-text APRS messages to any target callsign
- **Macro editor** in settings with token reference

### 🗺️ Map View (Leaflet)
- Dark CartoDB base tiles
- Satellite position, ground track, and coverage circle
- Heard stations with mode-specific colors
- QSO visualization with geodesic lines and distance labels
- Satellite follow mode (dynamic/fixed)
- QSO map mode to review past contacts
- Custom colors for heard stations, QSOs, and satellite markers

### 🧭 Navigation View
- Compass rose with cardinal directions, rotated by phone heading
- Satellite position marker relative to phone orientation
- Crosshair with alignment indicator (turns green when pointed at satellite)
- Phone tilt display with elevation offset calibration
- Text info: heading, satellite azimuth/elevation, phone tilt

### 📋 QSO Logging
- Automatic QSO confirmation when receiving packets from stations in pending QSO list
- Manual QSO logging with RST exchange
- ADIF export for logging software (ARRL, HRD, etc.)
- Pending QSO tracking awaiting confirmation
- Satellite-specific QSO filtering

### 📊 Terminal
- Color-coded terminal display
  - TX: orange (`#f0a030`)
  - RX: green (`#00e676`)
  - Echo: dim green (`#008844`)
  - Own repeat: blue (`#3b9fd4`)
- Raw serial monitor mode
- Customizable colors in settings
- Configurable history (100/300/500 lines)

### 🎛️ TNC Connectivity
- **Serial (KISS)** — Web Serial API, standard KISS framing over USB/serial
- **Bluetooth LE (BLE KISS)** — Web Bluetooth API, Nordic UART Service
- **WebUSB (CH340)** — Direct CH340 chip access (vendor 0x1A86), configurable baud rates
- KISS protocol encoding/decoding (FEND/FESC framing)
- Auto-detection of disconnected devices

### 📱 PWA Support
- Installable as standalone app via Web App Manifest
- Service worker for offline caching
- Works in Chrome, Edge, and Chromium-based browsers on desktop and Android

---

## Getting Started

### Requirements
- A modern browser (Chrome, Edge, or Chromium — Web Serial/Bluetooth/USB required)
- A KISS TNC or CH340-based device for radio connectivity
- Internet connection for initial load and TLE updates (works offline after first load)

### Setup

1. Open the app in a supported browser
2. Configure your **Station** settings:
   - Callsign (with optional SSID, e.g., `N0CALL-7`)
   - Grid square (auto-calculated from lat/lon)
   - Default RST (59/55/52/33)
   - Tocall (APRS software ID, e.g., `APZ100`)
   - Latitude / Longitude (or use "Use My Location")
3. Go to the **Modem** tab and connect your TNC:
   - Select TNC type (Serial / Bluetooth / WebUSB)
   - Select baud rate
   - Click Connect, then select your device in the browser dialog
4. Select a satellite in the header bar or via the satellite modal
5. Start transmitting macros or direct messages

### Packet Builder
| Control | Description |
|---------|-------------|
| Macro buttons | CQ, Rpt, 73, Msg, Pos — click to send |
| Target field | Enter target callsign |
| TX button | Sends the first macro (CQ by default) |
| Message field | Type a direct chat message (always requires target) |
| Send button | Sends the typed message formatted as APRS |

---

## Settings Reference

### Station
| Setting | Description | Default |
|---------|-------------|---------|
| Callsign | Your amateur radio callsign (+ optional SSID) | `N0CALL` |
| Grid Square | Maidenhead grid locator | `FN42` |
| Default RST | Signal report to send in QSO macros | `59` |
| Tocall | APRS destination callsign (software ID) | `APZ100` |
| Latitude | Station latitude (-90 to 90) | `42.0` |
| Longitude | Station longitude (-180 to 180) | `-71.0` |

### Modem
| Setting | Description |
|---------|-------------|
| TNC Type | Serial (KISS), Bluetooth LE, or WebUSB (CH340) |
| Baud Rate | 9600 / 19200 / 38400 / 57600 / 115200 |

### Sat
| Setting | Description |
|---------|-------------|
| TX Frequency | Transmit frequency (144-148 MHz) |
| Digipath | ARISS (satellite) or WIDE paths (terrestrial) |
| Freq Overrides | Per-satellite frequency offset |
| NORAD ID | Add user satellites by NORAD catalog number |
| Satellite List | Manage added satellites (cannot remove defaults) |

### Macros
Edit macro name, template, and log-QSO flag. Token reference:
| Token | Expands to |
|-------|-----------|
| `%C` | Target callsign with SSID |
| `%c` | Target callsign without SSID |
| `%M` | Your callsign |
| `%G` | Your grid square |
| `%R` | Remote station grid square |
| `%S` | Satellite name |
| `%N` | Auto-incrementing sequence number |

### Logging
| Setting | Description | Default |
|---------|-------------|---------|
| Terminal History | Number of lines to keep in terminal | `300` |
| Auto-log QSOs | Automatically confirm QSOs when receiving matching packets | Enabled |

### Calibration
- Elevation offset: adjust for phone tilt when flat (beta value displayed)
- Live beta raw value shown

### Map
| Setting | Description | Default |
|---------|-------------|---------|
| Show heard (SAT) | Show heard stations in satellite mode | On, `#3498db` |
| Show heard (Ter) | Show heard stations in terrestrial mode | On, `#f0a030` |
| Show QSO stations | Show logged QSO stations on map | On, `#2ecc71` |
| Show satellites | Show satellite position and track | On, `#aaaaaa` |

### Terminal
| Setting | Description | Default |
|---------|-------------|---------|
| Raw monitor | Show raw hex serial data | Off |
| TX color | Color for transmitted packets | `#f0a030` |
| RX color | Color for received packets | `#00e676` |
| Echo color | Color for echoed packets | `#008844` |
| Own repeat color | Color for own repeated packets | `#3b9fd4` |

### Licenses
Version 2.4.7 — MIT License — XE2LDL / Luis 2026
- Leaflet 1.9.4 (BSD-2-Clause)
- satellite.js (MIT)
- CartoDB dark tiles (CC-BY-4.0)
- Celestrak / AMSAT TLE data (Public Domain)
- PWA icons generated by Google Gemini AI

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+,` | Open settings modal |
| `Escape` | Close settings or satellite modal |

---

## Architecture

```
index.html          → Main UI (panels, terminal, settings, modals)
js/
  app.js            → State management, settings, compass, init, macros
  ui.js             → Terminal rendering, macro system, modals, TNC connect
  satellite.js      → SGP4 propagation, satellite DB, TLE updates, pass prediction
  satellite-lib.js  → Bundled satellite.js library (NORAD SGP4/SDP4)
  aprs.js           → APRS format encoding/decoding, AX.25 frames, Maidenhead grids
  tnc.js            → KISS TNC class (serial, BLE, WebUSB transports)
  logging.js        → Incoming packet processing, QSO confirmation
  map.js            → Leaflet map (satellite, heard, QSO layers)
  nav.js            → Compass/navigation canvas view
css/
  style.css         → Full stylesheet (dark theme, panels, modals, responsive)
sw.js               → Service worker for PWA offline support
manifest.json       → Web App Manifest for PWA install
```

### Data Flow

```
User Input → Macro/Message → resolveMacroTemplate() → buildAX25Frame()
  → TNC.send() → KISS encode → Transport (Serial/BLE/USB) → Radio

Radio → Transport (Serial/BLE/USB) → KISS decode → parseAX25Frame()
  → logPacketFromTNC() → Terminal display + QSO confirmation + Heard list
```

---

## License

MIT License — see license text in the Licenses tab.

---

## Version History

| Tag | Date | Changes |
|-----|------|---------|
| v1.7.6 | 2026-06-08 | APRS 1.01 formatter (`padTarget`, `formatAPRS*`). Fix AX.25 SSID byte (0x40→0x60), source extension bit with digis. Fix CQ/Msg macro targets. Fix padding bug in sendQuickAction (extra space at 9 chars). |
| v1.7.7 | 2026-06-08 | Fix Pos macro symbol: satellite/airplane (`/^`) → portable station (`\[`). |
