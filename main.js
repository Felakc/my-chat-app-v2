const { app, BrowserWindow } = require('electron');
require('./index.js'); // Запуск сервера

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);