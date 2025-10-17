// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // === Befehle vom Renderer an Main ===
  startFileOpen: () => ipcRenderer.send('start-file-open'),
  startFileSave: () => ipcRenderer.send('start-file-save'),
  sendTitle: (title) => ipcRenderer.send('set-title', title),
  sendEditorContentForSave: (payload) => ipcRenderer.send('editor-content-for-save', payload),
  sendUnsavedChangesResponse: (isDirty) => ipcRenderer.send('unsaved-changes-response', isDirty),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // === Request/Response (Renderer fragt, Main antwortet) ===
  showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options),

  // === Events von Main an Renderer ===
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (_event, content, filePath) => callback(content, filePath)),
  onFileSaved: (callback) => ipcRenderer.on('file-saved', (_event, content, filePath) => callback(content, filePath)),
  onRequestEditorContentForSave: (callback) => ipcRenderer.on('request-editor-content-for-save', callback),
  onCheckUnsavedChanges: (callback) => ipcRenderer.on('check-unsaved-changes', callback),
  onWindowStateChange: (callback) => ipcRenderer.on('window-state-changed', (_event, state) => callback(state)),

  startFileOpen: () => ipcRenderer.send('start-file-open'),
  fileDropped: (filePath) => ipcRenderer.send('file-dropped', filePath),
});