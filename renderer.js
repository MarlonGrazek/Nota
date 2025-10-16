// renderer.js

const textarea = document.querySelector('.editor-textarea');

// Der Zustand der aktuell bearbeiteten Datei
const editorState = {
  filePath: null,
  originalContent: '',
};

/**
 * Aktualisiert den gesamten Zustand des Editors.
 * Wird nach dem Öffnen oder Speichern einer Datei aufgerufen.
 * @param {string} newContent Der neue Textinhalt.
 * @param {string} newFilePath Der neue Dateipfad.
 */
function updateEditorState(newContent, newFilePath) {
  textarea.value = newContent;
  editorState.originalContent = textarea.value; // Normalisierten Wert als "sauber" speichern
  editorState.filePath = newFilePath;
  updateTitle();
}

/**
 * Aktualisiert den Fenstertitel basierend auf dem aktuellen Zustand.
 */
function updateTitle() {
  const isDirty = textarea.value !== editorState.originalContent;
  const dirtyMarker = isDirty ? '• ' : ''; // Ein Punkt ist moderner als ein Stern
  const fileName = editorState.filePath ? editorState.filePath.split(/[\\/]/).pop() : 'Unbenannt';
  
  window.electronAPI.sendTitle(`${dirtyMarker}${fileName} - Nota`);
}


// --- Event Listener für Nutzerinteraktionen ---

// Bei jeder Texteingabe den Titel aktualisieren.
textarea.addEventListener('input', updateTitle);


// --- API Listener für Anfragen vom Main-Prozess ---

// Der Main-Prozess fordert den Zustand an, bevor eine neue Datei geöffnet wird.
window.electronAPI.onRequestEditorStateForOpen(() => {
  window.electronAPI.sendEditorStateForOpen({
    isDirty: textarea.value !== editorState.originalContent,
  });
});

// Der Main-Prozess fordert den Inhalt zum Speichern an.
window.electronAPI.onRequestEditorContentForSave(() => {
  window.electronAPI.sendEditorContentForSave({
    content: textarea.value,
    filePath: editorState.filePath,
  });
});

// Main hat eine Datei erfolgreich geöffnet.
window.electronAPI.onFileOpened((content, filePath) => {
  updateEditorState(content, filePath);
});

// Main hat eine Datei erfolgreich gespeichert.
window.electronAPI.onFileSaved((content, filePath) => {
  updateEditorState(content, filePath);
});


// Initialen Titel beim Start setzen.
updateTitle();