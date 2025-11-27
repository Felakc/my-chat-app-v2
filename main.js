// main.js - Управляет окном приложения Electron

const { app, BrowserWindow } = require('electron');

// 🚨 ВАШ РАБОЧИЙ АДРЕС НА RENDER:
const URL_CHAT_APP = 'https://moi-chat-oik9.onrender.com'; 

function createWindow () {
  // Создаем стандартное окно для ПК
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // Это стандартные настройки безопасности
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Загружаем ваш чат с Render
  mainWindow.loadURL(URL_CHAT_APP);
}

// Запуск приложения, когда Electron готов
app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', function () {
    // Для macOS: если нет окон, создаем новое
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Закрытие приложения, когда все окна закрыты
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});