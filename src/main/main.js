// src/main/main.js

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let mainWindow;
let forceClose = false; // Verhindert eine Endlosschleife beim Schließen

/**
 * Erstellt das Hauptfenster der Anwendung.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Pfad ist jetzt korrekt
    },
  });

  // Pfad zur index.html angepasst
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.maximize();

  // Sendet den initialen Fensterzustand, nachdem das Fenster geladen ist.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('window-state-changed', { maximized: true });
  });

  // Listener für spätere Zustandsänderungen.
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-state-changed', { maximized: true }));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-state-changed', { maximized: false }));

  // Fängt den Schließvorgang ab, um auf ungespeicherte Änderungen zu prüfen.
  mainWindow.on('close', (event) => {
    if (!forceClose) {
      event.preventDefault();
      mainWindow.webContents.send('check-unsaved-changes');
    }
  });
}

/**
 * Startet den "Datei öffnen"-Dialog.
 */
async function handleFileOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog({});
  if (!canceled && filePaths.length > 0) {
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('file-opened', content, filePath);
  }
}

/**
 * Löst den "Datei speichern"-Prozess im Renderer aus.
 */
function handleFileSave() {
  mainWindow.webContents.send('request-editor-content-for-save');
}

// --- App Lifecycle ---
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Listener ---

// Dateihandhabung
ipcMain.on('start-file-open', handleFileOpen);
ipcMain.on('start-file-save', handleFileSave);

ipcMain.on('file-dropped', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('file-opened', content, filePath);
  } catch (error) {
    console.error("Fehler beim Lesen der gedroppten Datei:", error);
  }
});

ipcMain.on('editor-content-for-save', async (event, { content, filePath }) => {
  let finalFilePath = filePath;
  if (!finalFilePath) {
    const { canceled, filePath: newFilePath } = await dialog.showSaveDialog({
      title: 'Datei speichern unter', defaultPath: 'Unbenannt.txt',
    });
    if (canceled) return;
    finalFilePath = newFilePath;
  }
  fs.writeFileSync(finalFilePath, content);
  event.sender.send('file-saved', content, finalFilePath);
});

// Fenstersteuerung & Dialoge
ipcMain.on('set-title', (event, title) => BrowserWindow.fromWebContents(event.sender)?.setTitle(title));
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.on('unsaved-changes-response', (event, hasUnsavedChanges) => {
  if (!hasUnsavedChanges) {
    forceClose = true;
    mainWindow.close();
  }
});

ipcMain.on('force-close-app', () => {
    forceClose = true;
    mainWindow.close();
});

ipcMain.on('file-dropped', (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('file-opened', content, filePath);
  } catch (error) {
    console.error("Fehler beim Lesen der gedroppten Datei:", error);
    // Optional: Eine Fehlermeldung an den Renderer senden
  }
});