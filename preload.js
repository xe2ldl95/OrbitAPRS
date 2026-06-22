// Preload script for Electron
const { contextBridge, ipcRenderer } = require('electron');

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
    isDev: process.argv.includes('--dev')
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