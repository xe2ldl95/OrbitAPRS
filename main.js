const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

// ── Raw TCP connections (Dire Wolf KISS) ──
const tcpConnections = new Map();
let tcpConnIdCounter = 0;

function createTcpConnection(host, port, sender) {
    return new Promise((resolve, reject) => {
        const id = 'tcp_' + (++tcpConnIdCounter);
        const socket = new net.Socket();
        tcpConnections.set(id, { socket, sender });

        const timeout = setTimeout(() => {
            if (tcpConnections.has(id)) {
                socket.destroy();
                tcpConnections.delete(id);
                reject(new Error('TCP connection timeout'));
            }
        }, 10000);

        socket.connect(port, host, () => {
            clearTimeout(timeout);
            resolve(id);
        });

        socket.on('data', (data) => {
            if (tcpConnections.has(id)) {
                sender.send('tcp-data', id, data);
            }
        });

        socket.on('close', (hadError) => {
            if (tcpConnections.has(id)) {
                tcpConnections.delete(id);
                try { sender.send('tcp-close', id, hadError); } catch (_) {}
            }
        });

        socket.on('error', (err) => {
            clearTimeout(timeout);
            if (tcpConnections.has(id)) {
                tcpConnections.delete(id);
                try { sender.send('tcp-error', id, err.message); } catch (_) {}
                if (!socket.destroyed) socket.destroy();
                reject(err);
            }
        });
    });
}

ipcMain.handle('tcp-connect', async (event, host, port) => {
    return createTcpConnection(host, port, event.sender);
});

ipcMain.on('tcp-write', (event, id, data) => {
    const conn = tcpConnections.get(id);
    if (conn) {
        conn.socket.write(Buffer.from(data));
    }
});

ipcMain.on('tcp-disconnect', (event, id) => {
    const conn = tcpConnections.get(id);
    if (conn) {
        conn.socket.destroy();
        tcpConnections.delete(id);
    }
});

let mainWindow;
let distPath;

function buildMenu() {
    Menu.setApplicationMenu(null);
}

function createWindow() {
    distPath = path.join(__dirname, 'dist');
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false
        },
        icon: path.join(__dirname, 'icons/icon-512.png'),
        titleBarStyle: 'default',
        show: false
    });

    mainWindow.loadURL('file://' + distPath + '/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

// Handle IPC messages
ipcMain.on('app-version', (event) => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    event.reply('app-version', packageJson.version);
});

ipcMain.on('build-info', (event) => {
    const buildInfoPath = path.join(distPath, 'build-info.json');
    if (fs.existsSync(buildInfoPath)) {
        const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
        event.reply('build-info', buildInfo);
    }
});

// Create window when Electron is ready
app.whenReady().then(() => {
    buildMenu();
    createWindow();
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle app quit
app.on('before-quit', () => {
    if (mainWindow) {
        mainWindow.webContents.send('app-quitting');
    }
});