# TCP KISS Compatibility

OrbitAPRS now supports KISS TNC connections over TCP in addition to Serial/Bluetooth/WebUSB.

## Configuration

1. **Open Settings** → **Modem** tab
2. **TNC Type**: Select **TCP (KISS)**
3. **TCP Host**: Enter the hostname or IP address of the KISS TNC (default: `localhost`)
4. **TCP Port**: Enter the TCP port (default: `8001` for Dire Wolf, `8100` for aprx)

## Supported TNCs

- **Dire Wolf** — Software TNC with AGWPE and KISS TCP support
- **aprx** — APRS digipeater/iGate with TCP KISS support
- **QtSoundModem** — Sound card modem with TCP KISS
- **Any KISS TNC** that exposes a TCP/WebSocket port

## Connection Flow

1. Select "TCP (KISS)" in TNC Type dropdown
2. Enter Host and Port
3. Click **Connect**
4. The terminal shows connection status

## Architecture

```
TCP (KISS) → TCPTransport.connect(host, port) → WebSocket connection
  → _feedBytes() → KISS frame reassembly → _processFrame()
  → onPacket() callback → UI display
```

## Reconnection

The TCP transport includes automatic reconnection:
- Up to 5 retry attempts with exponential backoff
- Reconnection delay starts at 1s and increases per attempt
- Terminal displays reconnection status

## KISS Protocol

The TCP transport uses standard KISS framing:
- **FEND** (0xC0) — Frame boundary markers
- **FESC** (0xDB) — Escape byte
- **Port 0** — Data frames (AX.25)
- **Commands** — TNC parameter configuration

## Backward Compatibility

- All existing transport types (Serial, Bluetooth, WebUSB) continue to work unchanged
- TCP KISS is an additional, optional transport
- No changes to existing KISS protocol handling