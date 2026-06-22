const KISS_FEND = 0xC0;
const KISS_FESC = 0xDB;
const KISS_TFEND = 0xDC;
const KISS_TFESC = 0xDD;

class TCPTransport {
    constructor() {
        this.socket = null;
        this._type = 'tcp';
        this.reconnectTimeout = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
    }

    async connect(host, port) {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            addTerminalLine('system', 'TCP KISS: Connecting to ' + host + ':' + port + '...');

            // Try raw TCP first via WebSocket (binary type), fallback to WebSocket
            try {
                this.socket = new WebSocket('ws://' + host + ':' + port);
            } catch (_) {
                try {
                    this.socket = new WebSocket('wss://' + host + ':' + port);
                } catch (__) {
                    throw new Error('Could not create WebSocket connection to ' + host + ':' + port);
                }
            }

            this.socket.binaryType = 'arraybuffer';

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('TCP connection timeout to ' + host + ':' + port));
                    if (this.socket) this.socket.close();
                }, 10000);

                this.socket.onopen = () => {
                    clearTimeout(timeout);
                    addTerminalLine('system', 'TCP KISS: Connected to ' + host + ':' + port);
                    this.reconnectAttempts = 0;
                    this.isConnecting = false;
                    resolve();
                };

                this.socket.onmessage = (event) => {
                    const data = new Uint8Array(event.data);
                    if (this.onData) this.onData(data);
                };

                this.socket.onclose = (event) => {
                    clearTimeout(timeout);
                    addTerminalLine('system', 'TCP KISS: Disconnected from ' + host + ':' + port + ' (code=' + event.code + ')');
                    this.isConnecting = false;
                    if (!event.wasClean) {
                        this.attemptReconnect(host, port);
                    }
                };

                this.socket.onerror = (error) => {
                    clearTimeout(timeout);
                    addTerminalLine('system', 'TCP KISS: Connection error: ' + (error.message || 'unknown'));
                    this.isConnecting = false;
                    if (this.socket) {
                        try { this.socket.close(); } catch (_) {}
                    }
                    reject(new Error('TCP connection error to ' + host + ':' + port));
                };
            });

        } catch (err) {
            this.isConnecting = false;
            throw new Error('TCP connection failed: ' + err.message);
        }
    }

    async attemptReconnect(host, port) {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            addTerminalLine('system', 'TCP KISS: Max reconnection attempts (' + this.maxReconnectAttempts + ') reached');
            return;
        }

        this.reconnectAttempts++;
        addTerminalLine('system', 'TCP KISS: Reconnecting in ' + (this.reconnectDelay * this.reconnectAttempts / 1000).toFixed(1) + 's... (attempt ' + this.reconnectAttempts + '/' + this.maxReconnectAttempts + ')');

        this.reconnectTimeout = setTimeout(async () => {
            try {
                await this.connect(host, port);
            } catch (err) {
                addTerminalLine('system', 'TCP KISS: Reconnection attempt ' + this.reconnectAttempts + ' failed: ' + err.message);
            }
        }, this.reconnectDelay * this.reconnectAttempts);
    }

    write(data) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('TCP socket not connected');
        }
        this.socket.send(data);
    }

    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.socket) {
            try {
                this.socket.close();
            } catch (_) {}
            this.socket = null;
        }

        this.reconnectAttempts = 0;
        this.isConnecting = false;
    }
}

function kissEncode(data) {
    const r = [KISS_FEND, 0x00];
    for (let i = 0; i < data.length; i++) {
        const b = data[i];
        if (b === KISS_FEND) { r.push(KISS_FESC, KISS_TFEND); }
        else if (b === KISS_FESC) { r.push(KISS_FESC, KISS_TFESC); }
        else { r.push(b); }
    }
    r.push(KISS_FEND);
    return new Uint8Array(r);
}

function kissDecode(frame) {
    if (frame.length < 4) return null;
    if (frame[0] !== KISS_FEND || frame[frame.length - 1] !== KISS_FEND) return null;
    const body = frame.slice(1, -1);
    if (body.length < 1) return null;
    const cmd = (body[0] >> 4) & 0x0F;
    if (cmd !== 0) return null;
    const r = [];
    for (let i = 1; i < body.length; i++) {
        if (body[i] === KISS_FESC) {
            i++;
            if (i >= body.length) return null;
            r.push(body[i] === KISS_TFEND ? KISS_FEND : KISS_FESC);
        } else {
            r.push(body[i]);
        }
    }
    return new Uint8Array(r);
}

function kissCommandEncode(command, payload) {
    const r = [KISS_FEND, command];
    for (let i = 0; i < payload.length; i++) {
        const b = payload[i];
        if (b === KISS_FEND) { r.push(KISS_FESC, KISS_TFEND); }
        else if (b === KISS_FESC) { r.push(KISS_FESC, KISS_TFESC); }
        else { r.push(b); }
    }
    r.push(KISS_FEND);
    return new Uint8Array(r);
}

function kissDecodeRaw(frame) {
    if (frame.length < 4) return null;
    if (frame[0] !== KISS_FEND || frame[frame.length - 1] !== KISS_FEND) return null;
    const body = frame.slice(1, -1);
    if (body.length < 1) return null;
    const cmd = body[0];
    const r = [];
    for (let i = 1; i < body.length; i++) {
        if (body[i] === KISS_FESC) {
            i++;
            if (i >= body.length) return null;
            r.push(body[i] === KISS_TFEND ? KISS_FEND : KISS_FESC);
        } else {
            r.push(body[i]);
        }
    }
    return { cmd, data: new Uint8Array(r) };
}

class TNC {
    constructor() {
        this.connected = false;
        this.transport = null;
        this._writer = null;
        this._reader = null;
        this._onClose = null;
        this._btDisconnectHandler = null;
        this._usbDisconnectHandler = null;
        this._tcpDisconnectHandler = null;
        this._readBuf = new Uint8Array(0);
        this._prevFend = -1;
        this.onPacket = null;
        this.onStatus = null;
        this.onHardwareResponse = null;
        this._disconnecting = false;
    }

    _isBluetoothPort(port) {
        try {
            if (!port || typeof port.getInfo !== 'function') return false;
            const info = port.getInfo();
            return !!(info && info.bluetoothServiceName);
        } catch (_) { return false; }
    }

    async connect(type, port, baud) {
        try {
            if (type === 'serial') await this._connectSerial(port, baud);
            else if (type === 'bluetooth') await this._connectBluetooth();
            else if (type === 'webusb') await this._connectWebUSB(port, baud);
            else if (type === 'tcp') await this._connectTCP(port, baud);
            else throw new Error('Unknown TNC type: ' + type);
            this.connected = true;
            const btLabel = (type === 'serial' && this.transport && this._isBluetoothPort(this.transport))
                ? ' \u2014 Bluetooth SPP' : '';
            if (this.onStatus) this.onStatus('Connected (' + type + btLabel + ')');
            addTerminalLine('system', 'TNC connected (' + type + btLabel + ')');
            if (typeof state !== 'undefined' && state.tncApplyOnConnect) {
                setTimeout(() => {
                    try {
                        this.applyKISSParams({
                            txDelay: state.tncTxDelay,
                            persistence: state.tncPersistence,
                            slotTime: state.tncSlotTime,
                            txTail: state.tncTxTail,
                        });
                        addTerminalLine('system', 'KISS parameters applied');
                    } catch (e) {
                        addTerminalLine('system', 'KISS apply error: ' + e.message);
                    }
                }, 500);
            }
        } catch (err) {
            const msg = err.message || String(err);
            if (this.onStatus) this.onStatus('Error: ' + msg, true);
            addTerminalLine('system', 'TNC error: ' + msg);
        }
    }

    // ── Serial (Web Serial API — USB or Bluetooth SPP) ──
    async _connectSerial(requestedPort, baud) {
        if (!navigator.serial) throw new Error('Web Serial not supported. Use Chrome/Edge via HTTPS or localhost.');
        if (!window.isSecureContext) throw new Error('Secure context required. Open via https:// or http://localhost (not file://).');
        const isAndroid = /android/i.test(navigator.userAgent);

        let port;
        try {
            port = await navigator.serial.requestPort();
        } catch (err) {
            if (err.name === 'NotFoundError') {
                throw new Error(isAndroid
                    ? 'No serial ports found.\n\u2022 Bluetooth: pair the TNC in Android Bluetooth settings first, then try again.\n\u2022 USB: connect via OTG cable. If CH340 is not detected, try a different adapter (FTDI).'
                    : 'No serial port selected.');
            }
            if (err.name === 'SecurityError') {
                throw new Error('Serial access denied. Grant permission in Chrome settings or restart browser.');
            }
            throw new Error(isAndroid
                ? 'Serial error: ' + err.message + '. For Bluetooth: ensure device is paired in Android settings. For USB: try restarting Chrome.'
                : 'Port selection cancelled: ' + err.message);
        }

        const isBluetooth = this._isBluetoothPort(port);

        if (isBluetooth) {
            // Bluetooth SPP: open directly — no DTR/RTS cycling or CH340 workarounds.
            // Baud rate is virtual for BT SPP but required by port.open().
            addTerminalLine('system', 'Bluetooth SPP port detected. Opening...');
            try {
                await port.open({ baudRate: baud || 9600 });
            } catch (err) {
                throw new Error('Bluetooth serial open failed: ' + err.message +
                    '\nEnsure the device is paired in Android Bluetooth settings and not connected by another app (e.g. APRSDroid).');
            }
            this.transport = port;
            this._writer = port.writable.getWriter();
            this._onClose = () => this._onTransportClose();
            port.addEventListener('disconnect', this._onClose);
            addTerminalLine('system', 'Bluetooth SPP connected. Baud rate is virtual for BT.');
            this._readLoopSerial(port);
            return;
        }

        // USB serial: DTR cycling + CH340 retry logic
        addTerminalLine('system', 'USB serial port detected. Opening...');
        const dtrCycle = async () => {
            try {
                await port.setSignals({ dataTerminalReady: true, requestToSend: true });
                await new Promise(r => setTimeout(r, 100));
                await port.setSignals({ dataTerminalReady: false, requestToSend: false });
                await new Promise(r => setTimeout(r, 500));
            } catch (_) {}
        };
        // Some CH340 on Windows fail at 38400 SetCommState on first open,
        // but work after "priming" at 9600 first.
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await port.open({ baudRate: baud });
                await dtrCycle();
                this.transport = port;
                this._writer = port.writable.getWriter();
                this._onClose = () => this._onTransportClose();
                port.addEventListener('disconnect', this._onClose);
                this._readLoopSerial(port);
                return;
            } catch (err) {
                const isSetCommState = err.message && (
                    err.message.includes('Failed to open serial port') ||
                    err.message.includes('error code 31')
                );
                if (!isSetCommState) throw err;
                // Prime CH340 driver: open at 9600, then close and retry
                try {
                    await port.open({ baudRate: 9600 });
                    await port.close();
                } catch (_) {}
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        throw new Error(isAndroid
            ? 'Cannot open USB TNC. Try: power cycle the TNC, change baud rate, or check OTG connection.'
            : 'Cannot open TNC. Close Arduino IDE, unplug/replug the TNC, and try again.');
    }

    async _readLoopSerial(port) {
        try {
            while (port.readable && !this._disconnecting) {
                const reader = port.readable.getReader();
                this._reader = reader;
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done || !this.connected) break;
                        if (state.rawMonitor) {
                            const hex = Array.from(value).map(b => b.toString(16).padStart(2, '0')).join(' ');
                            addTerminalLine('system', 'RAW ' + hex + (value.length > 0 && value[0] !== 0xC0 ? ' "' + new TextDecoder().decode(value).replace(/[^\x20-\x7E]/g, '.') + '"' : ''));
                        }
                        this._feedBytes(value);
                    }
                } finally {
                    this._reader = null;
                    reader.releaseLock();
                }
            }
        } catch (err) {
            if (this.connected) {
                addTerminalLine('system', 'Serial read: ' + err.message);
                this.disconnect();
            }
        }
    }

    // ── Bluetooth (Web Bluetooth API) ──
    async _connectBluetooth() {
        if (!navigator.bluetooth) throw new Error('Web Bluetooth not supported. Use Chrome/Edge on Android or desktop.');
        const isAndroid = /android/i.test(navigator.userAgent);
        const NUS_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
        let device;
        try {
            device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [NUS_UUID] }],
                optionalServices: [NUS_UUID],
            });
        } catch (err) {
            if (err.name === 'NotFoundError') {
                throw new Error(isAndroid
                    ? 'No BLE TNC found. This mode only supports Bluetooth LE (BLE) devices with Nordic UART Service.\n\nFor Bluetooth Classic SPP (Mobilinkd, LanchonHL, etc.):\n  1. Pair the device in Android Bluetooth settings\n  2. Use "Serial (KISS)" mode instead of "Bluetooth LE"'
                    : 'No Bluetooth device selected.');
            }
            if (err.name === 'SecurityError') {
                throw new Error('Bluetooth access denied. Grant Location/BT permission in system settings.');
            }
            throw new Error(isAndroid
                ? 'Bluetooth error: ' + err.message + '. Try restarting Bluetooth on your device.'
                : 'Device selection cancelled: ' + err.message);
        }
        const server = await device.gatt.connect();
        this._btDisconnectHandler = () => {
            if (this.connected) { addTerminalLine('system', 'Bluetooth disconnected'); this.disconnect(); }
        };
        device.addEventListener('gattserverdisconnected', this._btDisconnectHandler);

        const service = await server.getPrimaryService(NUS_UUID);

        const chars = await service.getCharacteristics();
        let writeChar = null;
        let notifyChar = null;
        for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) writeChar = c;
            if (c.properties.notify || c.properties.indicate) notifyChar = c;
        }
        if (!writeChar) throw new Error('No writable characteristic found');
        if (!notifyChar) throw new Error('No notifiable characteristic found');

        this.transport = { device, server, service, writeChar, notifyChar, _type: 'bluetooth' };
        this._writer = { write: async (data) => { await writeChar.writeValue(data); } };

        notifyChar.addEventListener('characteristicvaluechanged', (ev) => {
            this._feedBytes(new Uint8Array(ev.target.value.buffer));
        });
        await notifyChar.startNotifications();
    }

    // ── WebUSB (CH340/CH341 direct USB transport) ──
    async _connectWebUSB(requestedPort, baud) {
        if (!navigator.usb) throw new Error('WebUSB not supported. Use Chrome/Edge on Android or desktop.');
        if (!window.isSecureContext) throw new Error('Secure context required.');

        let device;
        try {
            device = await navigator.usb.requestDevice({
                filters: [
                    { vendorId: 0x1A86, productId: 0x7523 },
                    { vendorId: 0x1A86, productId: 0x5523 },
                ],
            });
        } catch (err) {
            if (err.name === 'NotFoundError') {
                throw new Error('No USB TNC found. Connect your device via OTG and try again.');
            }
            throw new Error('USB selection cancelled: ' + err.message);
        }

        await device.open();
        await device.selectConfiguration(1);
        await device.claimInterface(0);

        // Find endpoints - prefer bulk IN for data, fall back to interrupt for status
        const iface = device.configuration.interfaces[0];
        const alt = iface.alternates[0] || iface;
        let outEp, inEp, inEpInt;
        const epInfo = [];
        for (const ep of alt.endpoints) {
            epInfo.push('EP0x' + ep.endpointNumber.toString(16) + ' ' + ep.type + ' ' + ep.direction + ' pkt=' + ep.packetSize);
            if (ep.type === 'bulk' && ep.direction === 'out') outEp = ep.endpointNumber;
            if (ep.type === 'bulk' && ep.direction === 'in') inEp = ep.endpointNumber;
            if (ep.type === 'interrupt' && ep.direction === 'in') inEpInt = ep.endpointNumber;
        }
        addTerminalLine('system', 'USB endpoints: ' + epInfo.join(', '));
        if (!outEp || !inEp) throw new Error('Could not find USB endpoints');

        addTerminalLine('system', 'USB TNC opened. Configuring at ' + baud + ' baud...');

        // Read chip version
        let chipVer = 'unknown';
        try {
            const ver = await device.controlTransferIn({requestType:'vendor',recipient:'device',request:0x5F,value:0x0000,index:0x0000},2);
            if (ver.data) chipVer = Array.from(new Uint8Array(ver.data.buffer)).map(b => b.toString(16)).join('.');
        } catch (_) {}
        addTerminalLine('system', 'CH340 chip version: ' + chipVer + ', EP out=0x' + outEp.toString(16) + ' in=0x' + inEp.toString(16));

        const fTable = {2400:0x0D,4800:0x1A,9600:0x33,19200:0x66,38400:0xCC,57600:0x33,115200:0x66};
        const dTable = {2400:0x9C,4800:0x9C,9600:0x9C,19200:0x9C,38400:0x9C,57600:0xD9,115200:0xD9};
        addTerminalLine('system', 'Baud table: factor=0x' + fTable[baud].toString(16) + ' divisor=0x' + dTable[baud].toString(16));
        const factor = fTable[baud] || fTable[38400];
        const divisor = dTable[baud] || dTable[38400];

        // Step 1: init at 9600 baud (TNC needs this for bootloader handshake)
        const initFactor = 0x33, initDivisor = 0x9C;
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x9A,value:(initFactor << 8) | initDivisor,index:0x009C});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x9A,value:initFactor,index:0x000A});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x9A,value:initDivisor,index:0x000B});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x9A,value:(initFactor << 8) | initDivisor,index:0x0000});
        // Line control + handshake
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x95,value:0x0003,index:0x0000});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0xA4,value:0xDF,index:0x0000});
        addTerminalLine('system', 'Init at 9600 baud (pre-DTR)');

        this.transport = { device, inEp, outEp, _type: 'webusb' };
        this._writer = { write: async (data) => { await device.transferOut(outEp, data); } };

        // DTR pulse via handshake control (soft: only toggle bit 5, avoids endpoint stall)
        addTerminalLine('system', 'DTR pulse...');
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0xA4,value:0xBF,index:0x0000});
        await new Promise(r => setTimeout(r, 150));
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0xA4,value:0xDF,index:0x0000});
        await new Promise(r => setTimeout(r, 2000));

        // Switch to target baud after TNC boot
        addTerminalLine('system', 'Switching to ' + baud + ' baud...');
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x9A,value:(factor << 8) | divisor,index:0x009C});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x9A,value:factor,index:0x000A});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x9A,value:divisor,index:0x000B});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x9A,value:(factor << 8) | divisor,index:0x0000});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0x95,value:0x0003,index:0x0000});
        await device.controlTransferOut({requestType:'vendor',recipient:'device',request:0xA4,value:0xDF,index:0x0000});

        this._usbDisconnectHandler = (e) => {
            if (e.device === device && this.connected) {
                addTerminalLine('system', 'USB device disconnected');
                this.disconnect();
            }
        };
        navigator.usb.addEventListener('disconnect', this._usbDisconnectHandler);

        // Small delay to let the CH340 settle, then start reading
        await new Promise(r => setTimeout(r, 200));
        this._readLoopWebUSB(device, inEp);
    }

    // ── TCP (KISS over TCP) ──
    async _connectTCP(host, port) {
        if (!host) throw new Error('TCP host required for TCP KISS');
        if (!port) throw new Error('TCP port required for TCP KISS');

        this.transport = new TCPTransport();
        this.transport.onData = (data) => {
            this._feedBytes(data);
        };

        await this.transport.connect(host, port);
        this._writer = { write: async (data) => { this.transport.write(data); } };
        this._onClose = () => this._onTransportClose();
        this._tcpDisconnectHandler = () => {
            if (this.connected) { addTerminalLine('system', 'TCP disconnected'); this.disconnect(); }
        };
        if (this.transport.socket) {
            this.transport.socket.addEventListener('close', this._tcpDisconnectHandler);
        }
        addTerminalLine('system', 'TCP KISS connected to ' + host + ':' + port);
    }

    async _readLoopWebUSB(device, inEp) {
        let readCount = 0;
        try {
            while (device.opened && !this._disconnecting) {
                const result = await device.transferIn(inEp, 32);
                readCount++;
                if (readCount <= 3) {
                    addTerminalLine('system', 'USB transferIn #' + readCount + ' status=' + result.status + ' len=' + (result.data ? result.data.byteLength : 0));
                }
                if (result.status === 'stall') {
                    try { await device.clearHalt(inEp); } catch (_) {}
                    continue;
                }
                if (!result.data || result.data.byteLength === 0) continue;
                const raw = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
                // CH340 v3.0: NO LSR byte — all bytes are raw UART data
                if (state.rawMonitor) {
                    const hex = Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join(' ');
                    let ascii = '';
                    for (const b of raw) ascii += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
                    addTerminalLine('system', 'RAW len=' + raw.length + ' ' + hex + (ascii ? ' "' + ascii + '"' : ''));
                }
                this._feedBytes(raw);
            }
        } catch (err) {
            if (this.connected) {
                addTerminalLine('system', 'USB read: ' + err.message);
                this.disconnect();
            }
        }
    }

    // ── Disconnect ──
    disconnect() {
        this._disconnecting = true;
        this.connected = false;
        if (this.transport && this.transport._type === 'webusb') {
            try {
                if (this._usbDisconnectHandler) {
                    navigator.usb.removeEventListener('disconnect', this._usbDisconnectHandler);
                }
                this.transport.device.close();
            } catch (_) {}
        } else if (this.transport && this.transport._type === 'bluetooth') {
            try {
                if (this._btDisconnectHandler) {
                    this.transport.device.removeEventListener('gattserverdisconnected', this._btDisconnectHandler);
                }
                this.transport.server.disconnect();
            } catch (_) {}
        } else if (this.transport && this.transport._type === 'tcp') {
            try {
                if (this._tcpDisconnectHandler && this.transport.socket) {
                    this.transport.socket.removeEventListener('close', this._tcpDisconnectHandler);
                }
                this.transport.disconnect();
            } catch (_) {}
        } else {
            // Cancel reader first to release the lock
            if (this._reader) {
                try { this._reader.cancel(); } catch (_) {}
                this._reader = null;
            }
            if (this._writer && this._writer.releaseLock) {
                try { this._writer.releaseLock(); } catch (_) {}
            }
            if (this.transport) {
                try {
                    if (this.transport.close) this.transport.close();
                } catch (_) {}
            }
            if (this._onClose && this.transport) {
                try {
                    if (this.transport.removeEventListener) this.transport.removeEventListener('disconnect', this._onClose);
                } catch (_) {}
            }
        }
        this._writer = null;
        this.transport = null;
        this._btDisconnectHandler = null;
        this._usbDisconnectHandler = null;
        this._tcpDisconnectHandler = null;
        this._readBuf = new Uint8Array(0);
        this._prevFend = -1;
        document.getElementById('tncStatusDot').className = 'status-dot idle';
        document.getElementById('tncStatusText').textContent = 'TNC: Disconnected';
        addTerminalLine('system', 'TNC disconnected');
    }

    _onTransportClose() {
        if (this.connected) { addTerminalLine('system', 'TNC transport closed'); this.disconnect(); }
    }

    // ── Send ──
    send(ax25Bytes) {
        if (!this.connected || !this._writer) throw new Error('TNC not connected');
        this._writer.write(kissEncode(ax25Bytes));
    }

    sendCommand(command, payload) {
        if (!this.connected || !this._writer) throw new Error('TNC not connected');
        this._writer.write(kissCommandEncode(command, payload));
    }

    applyKISSParams(params) {
        var txDelayUnits = Math.max(0, Math.min(255, Math.round((params.txDelay || 300) / 10)));
        this.sendCommand(0x01, new Uint8Array([txDelayUnits]));
        this.sendCommand(0x02, new Uint8Array([Math.max(0, Math.min(255, params.persistence || 63))]));
        var slotUnits = Math.max(0, Math.min(255, Math.round((params.slotTime || 100) / 10)));
        this.sendCommand(0x03, new Uint8Array([slotUnits]));
        var tailUnits = Math.max(0, Math.min(255, Math.round((params.txTail || 20) / 10)));
        this.sendCommand(0x04, new Uint8Array([tailUnits]));
    }

    // ── KISS frame reassembly ──
    _feedBytes(chunk) {
        const combined = new Uint8Array(this._readBuf.length + chunk.length);
        combined.set(this._readBuf, 0);
        combined.set(chunk, this._readBuf.length);

        let prev = this._prevFend;
        let frameCount = 0;
        for (let i = 0; i < combined.length; i++) {
            if (combined[i] === KISS_FEND) {
                if (prev >= 0 && i - prev > 1) {
                    const frame = combined.slice(prev, i + 1);
                    this._processFrame(frame);
                    frameCount++;
                }
                prev = i;
            }
        }
        if (state.rawMonitor && frameCount > 0) {
            addTerminalLine('system', 'FEED: ' + frameCount + ' frames extracted, buf=' + this._readBuf.length + '→' + combined.length + ', prevFend=' + this._prevFend + '→' + (prev >= 0 ? 'Y' : 'N') + ', remain=' + (combined.length - (prev >= 0 ? prev : combined.length)));
        }
        this._prevFend = (prev >= 0 && combined[combined.length - 1] === KISS_FEND) ? 0 : -1;
        this._readBuf = (prev >= 0) ? combined.slice(prev) : new Uint8Array(0);
    }

    _processFrame(kissFrame) {
        const decoded = kissDecodeRaw(kissFrame);
        if (!decoded) {
            if (state.rawMonitor) addTerminalLine('system', 'KISS decode FAILED — frame len=' + kissFrame.length + ' start=' + kissFrame[0].toString(16) + ' end=' + kissFrame[kissFrame.length-1].toString(16));
            return;
        }
        const { cmd, data } = decoded;
        if (cmd === 0x00) {
            if (data.length < 14) {
                if (state.rawMonitor) addTerminalLine('system', 'KISS frame too short: ' + data.length + ' bytes');
                return;
            }
            const parsed = parseAX25Frame(data);
            if (!parsed) {
                if (state.rawMonitor) addTerminalLine('system', 'parseAX25Frame FAILED — ax25 len=' + data.length);
                return;
            }
            if (state.rawMonitor) addTerminalLine('system', 'DECODED: ' + parsed.source + ' > ' + parsed.dest + ' infoLen=' + parsed.info.length);
            if (this.onPacket) this.onPacket(parsed);
        } else if (cmd === 0x06 && this.onHardwareResponse) {
            var subcmd = data.length > 0 ? data[0] : 0;
            this.onHardwareResponse({ subcmd: subcmd, data: data.slice(1) });
        } else {
            if (state.rawMonitor) addTerminalLine('system', 'KISS cmd=0x' + cmd.toString(16) + ' len=' + data.length);
        }
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.TCPTransport = TCPTransport;
    globalThis.TNC = TNC;
    globalThis.kissEncode = kissEncode;
    globalThis.kissDecode = kissDecode;
    globalThis.kissCommandEncode = kissCommandEncode;
    globalThis.kissDecodeRaw = kissDecodeRaw;
}
