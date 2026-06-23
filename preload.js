// Preload script for Electron
const { contextBridge, ipcRenderer } = require('electron');

// ── TCP KISS listeners (maintained for cleanup) ──
const tcpListeners = new Map();

// Expose protected methods in the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getAppVersion: () => ipcRenderer.invoke('app-version'),
    getBuildInfo: () => ipcRenderer.invoke('build-info'),
    
    // File operations
    openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
    
    // App control
    quit: () => ipcRenderer.send('app-quit'),
    
    // Platform info
    platform: process.platform,
    
    // Development mode
    isDev: process.argv.includes('--dev'),

    // ── Raw TCP API (via Node.js net) ──
    tcpConnect: (host, port) => ipcRenderer.invoke('tcp-connect', host, port),
    tcpWrite: (id, data) => ipcRenderer.send('tcp-write', id, data),
    tcpDisconnect: (id) => ipcRenderer.send('tcp-disconnect', id),

    onTcpData: (id, callback) => {
        const handler = (_event, connId, data) => {
            if (connId === id) callback(new Uint8Array(data));
        };
        ipcRenderer.on('tcp-data', handler);
        tcpListeners.set(id + '-data', () => ipcRenderer.removeListener('tcp-data', handler));
    },

    onTcpClose: (id, callback) => {
        const handler = (_event, connId, hadError) => {
            if (connId === id) callback(hadError);
        };
        ipcRenderer.on('tcp-close', handler);
        tcpListeners.set(id + '-close', () => ipcRenderer.removeListener('tcp-close', handler));
    },

    onTcpError: (id, callback) => {
        const handler = (_event, connId, error) => {
            if (connId === id) callback(error);
        };
        ipcRenderer.on('tcp-error', handler);
        tcpListeners.set(id + '-error', () => ipcRenderer.removeListener('tcp-error', handler));
    },

    removeTcpListeners: (id) => {
        for (const key of [id + '-data', id + '-close', id + '-error']) {
            const cleanup = tcpListeners.get(key);
            if (cleanup) { cleanup(); tcpListeners.delete(key); }
        }
    }
});

// Expose safe globals
contextBridge.exposeInMainWorld('safeGlobals', {
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON
});

// Handle messages from main process
ipcRenderer.on('app-quitting', () => {
    window.location.href = 'about:blank';
});