const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        titleBarStyle: 'hiddenInset',
        frame: true,
    });

    // Development: Load from Vite dev server
    // Production: Load from build
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC Handlers
ipcMain.handle('save-session', async (event, content) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: '保存会话',
            defaultPath: 'session.json',
            filters: [{ name: 'Well Agent Session', extensions: ['json'] }]
        });

        if (canceled || !filePath) return { success: false };

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
        return { success: true, filePath };
    } catch (error) {
        console.error('Save session error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-session', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: '加载会话',
            properties: ['openFile'],
            filters: [{ name: 'Well Agent Session', extensions: ['json'] }]
        });

        if (canceled || filePaths.length === 0) return { success: false };

        const content = fs.readFileSync(filePaths[0], 'utf-8');
        return { success: true, data: JSON.parse(content), filePath: filePaths[0] };
    } catch (error) {
        console.error('Load session error:', error);
        return { success: false, error: error.message };
    }
});
