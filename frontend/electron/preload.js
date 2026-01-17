const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Session Management
    saveSession: (data) => ipcRenderer.invoke('save-session', data),
    loadSession: () => ipcRenderer.invoke('load-session'),

    // Legacy / Other
    loadLasFile: (filePath) => ipcRenderer.invoke('load-las-file', filePath),
    runAnalysis: (data) => ipcRenderer.invoke('run-analysis', data),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Events from main process
    onAgentMessage: (callback) => {
        ipcRenderer.on('agent-message', (event, message) => callback(message));
    },
    onAnalysisComplete: (callback) => {
        ipcRenderer.on('analysis-complete', (event, result) => callback(result));
    },
});
