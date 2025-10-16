// main.js

const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let mainWindow;
let forceClose = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.maximize();

  // HIER IST DER FIX: Sende den initialen Zustand, nachdem das Fenster geladen ist.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: true });
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: true });
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: false });
  });

  mainWindow.on('close', (event) => {
    if (!forceClose) {
      event.preventDefault();
      mainWindow.webContents.send('check-unsaved-changes');
    }
  });
}

async function handleFileOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog({});
  if (!canceled && filePaths.length > 0) {
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('file-opened', content, filePath);
  }
}

function handleFileSave() {
  mainWindow.webContents.send('request-editor-content-for-save');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('start-file-open', handleFileOpen);
ipcMain.on('start-file-save', handleFileSave);

ipcMain.on('editor-content-for-save', async (event, { content, filePath }) => {
  let finalFilePath = filePath;
  if (!finalFilePath) {
    const { canceled, filePath: newFilePath } = await dialog.showSaveDialog({
      title: 'Datei speichern unter',
      buttonLabel: 'Speichern',
      defaultPath: 'Unbenannt.txt',
    });
    if (canceled) return;
    finalFilePath = newFilePath;
  }
  fs.writeFileSync(finalFilePath, content);
  event.sender.send('file-saved', content, finalFilePath);
});

ipcMain.on('set-title', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.setTitle(title);
});

ipcMain.handle('show-confirm-dialog', async (event, options) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(window, options);
  return result;
});

ipcMain.on('unsaved-changes-response', async (event, hasUnsavedChanges) => {
  if (hasUnsavedChanges) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Änderungen verwerfen', 'Abbrechen'],
      defaultId: 1,
      title: 'Ungespeicherte Änderungen',
      message: 'Sie haben ungespeicherte Änderungen. Möchten Sie wirklich beenden?'
    });
    if (choice.response === 0) {
      forceClose = true;
      mainWindow.close();
    }
  } else {
    forceClose = true;
    mainWindow.close();
  }
});

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow.close());