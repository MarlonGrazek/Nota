// preload.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- Renderer an Main ---
  sendTitle: (title) => ipcRenderer.send('set-title', title),
  sendEditorStateForOpen: (payload) => ipcRenderer.send('editor-state-for-open', payload),
  sendEditorContentForSave: (payload) => ipcRenderer.send('editor-content-for-save', payload),

  // --- Main an Renderer ---
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (_event, content, filePath) => callback(content, filePath)),
  onFileSaved: (callback) => ipcRenderer.on('file-saved', (_event, content, filePath) => callback(content, filePath)),
  onRequestEditorStateForOpen: (callback) => ipcRenderer.on('request-editor-state-for-open', callback),
  onRequestEditorContentForSave: (callback) => ipcRenderer.on('request-editor-content-for-save', callback),
});