// TCP KISS Test Suite
// Tests KISS encoding/decoding and TCP transport logic
// Run with: node tests/test-tcp-kiss.js

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Setup DOM environment for testing
const dom = new JSDOM('<!DOCTYPE html><div id="terminal"></div><div id="tncStatusDot"></div><div id="tncStatusText"></div>');
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;

// Mock addTerminalLine for testing
global.addTerminalLine = (type, msg) => {
    console.log('  [TERMINAL] ' + type + ': ' + msg);
};

// Load tnc.js
const tncCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'tnc.js'), 'utf8');
eval(tncCode);

// Test helper
let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log('  ✓ ' + name);
        passed++;
    } catch (err) {
        console.log('  ✗ ' + name);
        console.log('    Error: ' + err.message);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || 'Expected ' + expected + ' but got ' + actual);
    }
}

function assertDeepEqual(actual, expected, message) {
    const a = Array.from(actual);
    const e = Array.from(expected);
    if (a.length !== e.length) {
        throw new Error(message || 'Length mismatch: expected ' + e.length + ' but got ' + a.length);
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== e[i]) {
            throw new Error(message || 'Mismatch at index ' + i + ': expected ' + e[i] + ' but got ' + a[i]);
        }
    }
}

// ─── Run Tests ───

(async () => {
console.log('=== TCP KISS Test Suite ===');
console.log('');

// KISS Encoding Tests
console.log('--- KISS Encoding ---');

test('kissEncode adds FEND markers', () => {
    const input = new Uint8Array([0x01, 0x02, 0x03]);
    const result = kissEncode(input);
    assertEqual(result[0], 0xC0, 'First byte should be FEND');
    assertEqual(result[1], 0x00, 'Second byte should be port 0');
    assertEqual(result[result.length - 1], 0xC0, 'Last byte should be FEND');
});

test('kissEncode escapes FEND in data', () => {
    const input = new Uint8Array([0xC0]);
    const result = kissEncode(input);
    assertEqual(result[2], 0xDB, 'Should be FESC');
    assertEqual(result[3], 0xDC, 'Should be TFEND');
});

test('kissEncode escapes FESC in data', () => {
    const input = new Uint8Array([0xDB]);
    const result = kissEncode(input);
    assertEqual(result[2], 0xDB, 'Should be FESC');
    assertEqual(result[3], 0xDD, 'Should be TFESC');
});

test('kissEncode handles empty data', () => {
    const input = new Uint8Array([]);
    const result = kissEncode(input);
    assertEqual(result.length, 3, 'FEND + port + FEND');
    assertEqual(result[0], 0xC0);
    assertEqual(result[1], 0x00);
    assertEqual(result[2], 0xC0);
});

// KISS Decoding Tests
console.log('--- KISS Decoding ---');

test('kissDecode returns valid data frame', () => {
    const encoded = kissEncode(new Uint8Array([0x01, 0x02, 0x03]));
    const decoded = kissDecode(encoded);
    assert(decoded !== null, 'Should decode successfully');
    assertEqual(decoded[0], 0x01);
    assertEqual(decoded[1], 0x02);
    assertEqual(decoded[2], 0x03);
});

test('kissDecode returns null for short frame', () => {
    const result = kissDecode(new Uint8Array([0xC0, 0x00]));
    assertEqual(result, null, 'Frame too short');
});

test('kissDecode returns null for invalid frame start', () => {
    const result = kissDecode(new Uint8Array([0x00, 0x00, 0x00, 0x00]));
    assertEqual(result, null, 'No FEND at start');
});

test('kissDecode handles escaped bytes', () => {
    const encoded = kissEncode(new Uint8Array([0xC0, 0xDB]));
    const decoded = kissDecode(encoded);
    assert(decoded !== null);
    assertEqual(decoded[0], 0xC0);
    assertEqual(decoded[1], 0xDB);
});

// KISS Command Encoding Tests
console.log('--- KISS Command Encoding ---');

test('kissCommandEncode sets correct command byte', () => {
    const result = kissCommandEncode(0x01, new Uint8Array([0x10]));
    assertEqual(result[0], 0xC0);
    assertEqual(result[1], 0x01);
    assertEqual(result[result.length - 1], 0xC0);
});

// KISS Raw Decoding Tests
console.log('--- KISS Raw Decoding ---');

test('kissDecodeRaw returns cmd and data', () => {
    const encoded = kissCommandEncode(0x06, new Uint8Array([0x01, 0x02]));
    const result = kissDecodeRaw(encoded);
    assert(result !== null);
    assertEqual(result.cmd, 0x06);
    assertEqual(result.data[0], 0x01);
    assertEqual(result.data[1], 0x02);
});

// TCPTransport Tests
console.log('--- TCPTransport ---');

test('TCPTransport constructor sets defaults', () => {
    const t = new TCPTransport();
    assertEqual(t._type, 'tcp');
    assertEqual(t.maxReconnectAttempts, 5);
    assertEqual(t.reconnectDelay, 1000);
    assertEqual(t.isConnecting, false);
    assertEqual(t.reconnectAttempts, 0);
});

test('TCPTransport disconnect handles null socket', () => {
    const t = new TCPTransport();
    t.disconnect(); // Should not throw
    assertEqual(t.reconnectAttempts, 0);
    assertEqual(t.isConnecting, false);
});

test('TCPTransport write throws when not connected', () => {
    const t = new TCPTransport();
    try {
        t.write(new Uint8Array([0x01]));
        assert(false, 'Should have thrown');
    } catch (err) {
        assert(err.message.includes('not connected'), 'Expected not connected error');
    }
});

test('TCPTransport disconnect clears reconnect timeout', () => {
    const t = new TCPTransport();
    t.reconnectTimeout = setTimeout(() => {}, 10000);
    t.disconnect();
    assertEqual(t.reconnectTimeout, null, 'Timeout should be cleared');
});

// TNC Class Tests
console.log('--- TNC Class ---');

test('TNC constructor initializes correctly', () => {
    const tnc = new TNC();
    assertEqual(tnc.connected, false);
    assertEqual(tnc.transport, null);
    assertEqual(tnc._tcpDisconnectHandler, null);
});

test('TNC.connect rejects unknown type', async () => {
    const tnc = new TNC();
    let statusMsg = '';
    tnc.onStatus = (msg, isError) => {
        if (isError) statusMsg = msg;
    };
    await tnc.connect('unknown', '', '');
    assert(statusMsg.includes('Unknown TNC type'), 'Should report unknown type error');
});

test('TNC.disconnect handles null transport', () => {
    const tnc = new TNC();
    tnc.disconnect(); // Should not throw
    assertEqual(tnc.connected, false);
});

// Summary
console.log('');
console.log('=== Results ===');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
console.log('');

if (failed > 0) {
    process.exit(1);
}
})();