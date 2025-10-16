// main.js

const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Globale Referenz auf das Hauptfenster, um es nicht zu verlieren.
let mainWindow;

/**
 * Erstellt das Hauptfenster der Anwendung.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('index.html');
}

/**
 * Behandelt den "Datei öffnen"-Vorgang.
 * Fordert zuerst den Zustand vom Renderer an, um auf ungespeicherte Änderungen zu prüfen.
 */
function handleFileOpen() {
  mainWindow.webContents.send('request-editor-state-for-open');
}

/**
 * Behandelt den "Datei speichern"-Vorgang.
 * Fordert den Inhalt vom Renderer an, um ihn zu speichern.
 */
function handleFileSave() {
  mainWindow.webContents.send('request-editor-content-for-save');
}

/**
 * Erstellt und setzt das Anwendungsmenü.
 */
function createMainMenu() {
  const menuTemplate = [
    {
      label: 'Datei',
      submenu: [
        { label: 'Öffnen', accelerator: 'CmdOrCtrl+O', click: handleFileOpen },
        { label: 'Speichern', accelerator: 'CmdOrCtrl+S', click: handleFileSave },
        { type: 'separator' },
        { label: 'Beenden', role: 'quit' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// --- App Lifecycle ---

app.whenReady().then(() => {
  createWindow();
  createMainMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


// --- IPC-Kommunikation ---

// Empfängt den Zustand vom Renderer und entscheidet, ob eine Datei geöffnet werden darf.
ipcMain.on('editor-state-for-open', async (event, { isDirty }) => {
  if (isDirty) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Änderungen verwerfen', 'Abbrechen'],
      defaultId: 1,
      title: 'Ungespeicherte Änderungen',
      message: 'Sie haben ungespeicherte Änderungen. Möchten Sie diese wirklich verwerfen?',
    });

    if (choice.response === 1) return; // 1 = Abbrechen
  }

  // Dialog zum Öffnen der Datei anzeigen
  const { canceled, filePaths } = await dialog.showOpenDialog({});
  if (!canceled && filePaths.length > 0) {
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('file-opened', content, filePath);
  }
});

// Empfängt den Inhalt zum Speichern vom Renderer.
ipcMain.on('editor-content-for-save', async (event, { content, filePath }) => {
  let finalFilePath = filePath;

  // Wenn kein Pfad existiert, "Speichern unter"-Dialog anzeigen
  if (!finalFilePath) {
    const { canceled, filePath: newFilePath } = await dialog.showSaveDialog({
      title: 'Datei speichern unter',
      buttonLabel: 'Speichern',
      defaultPath: 'Unbenannt.txt',
    });

    if (canceled) return;
    finalFilePath = newFilePath;
  }
  
  // Datei schreiben und dem Renderer den finalen Zustand zurückmelden
  fs.writeFileSync(finalFilePath, content);
  event.sender.send('file-saved', content, finalFilePath);
});

// Setzt den Fenstertitel basierend auf der Anfrage des Renderers.
ipcMain.on('set-title', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.setTitle(title);
});