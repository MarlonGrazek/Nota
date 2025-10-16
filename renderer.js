// renderer.js

// --- DOM-Elemente holen ---
const textarea = document.querySelector('.editor-textarea');
const tabBar = document.querySelector('.tab-bar');

// --- Globale Zustandsverwaltung ---
let openFiles = [];
let activeFileId = null;

// --- Kernfunktionen ---

const createId = () => `file_${Date.now()}_${Math.random()}`;

function renderTabs() {
  tabBar.innerHTML = '';
  openFiles.forEach(file => {
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    tabItem.dataset.fileId = file.id;
    if (file.id === activeFileId) tabItem.classList.add('active');
    
    const isDirty = file.currentContent !== file.originalContent;
    const dirtyMarker = isDirty ? '<span class="tab-dirty-marker">•</span>' : '';
    const fileName = file.filePath ? file.filePath.split(/[\\/]/).pop() : 'Neue Datei';
    
    tabItem.innerHTML = `${dirtyMarker}<span class="tab-filename">${fileName}</span><div class="tab-close-button">✕</div>`;
    
    tabItem.addEventListener('click', () => setActiveFile(file.id));
    tabItem.querySelector('.tab-close-button').addEventListener('click', (event) => {
        event.stopPropagation(); 
        closeFile(file.id);
    });
    
    tabBar.appendChild(tabItem);
  });
  updateWindowTitle();
}

function displayActiveFileContent() {
  const activeFile = openFiles.find(f => f.id === activeFileId);
  if (activeFile) {
    textarea.value = activeFile.currentContent;
    textarea.focus();
  } else {
    textarea.value = '';
  }
}

function setActiveFile(fileId) {
  activeFileId = fileId;
  displayActiveFileContent();
  renderTabs();
}

function addNewFile(filePath = null, content = '') {
  const newFile = { id: createId(), filePath, originalContent: content, currentContent: content };
  openFiles.push(newFile);
  setActiveFile(newFile.id);
  return newFile;
}

async function closeFile(fileIdToClose) {
  const fileToClose = openFiles.find(f => f.id === fileIdToClose);
  if (!fileToClose) return;

  const isDirty = fileToClose.currentContent !== fileToClose.originalContent;
  if (isDirty) {
    const result = await window.electronAPI.showConfirmDialog({
      type: 'question',
      buttons: ['Schließen', 'Abbrechen'],
      defaultId: 1,
      title: 'Ungespeicherte Änderungen',
      message: `Möchten Sie die Änderungen an "${fileToClose.filePath?.split(/[\\/]/).pop() || 'Neue Datei'}" wirklich verwerfen?`
    });
    if (result.response === 1) return;
  }

  const fileIndex = openFiles.findIndex(f => f.id === fileIdToClose);
  openFiles.splice(fileIndex, 1);

  if (openFiles.length === 0) {
    activeFileId = null;
    displayActiveFileContent();
    renderTabs();
    return;
  }

  if (activeFileId === fileIdToClose) {
    const newActiveIndex = Math.max(0, fileIndex - 1);
    setActiveFile(openFiles[newActiveIndex].id);
  } else {
    renderTabs();
  }
}

function updateWindowTitle() {
    const activeFile = openFiles.find(f => f.id === activeFileId);
    let title = "Nota";
    if(activeFile) {
        const fileName = activeFile.filePath ? activeFile.filePath.split(/[\\/]/).pop() : 'Neue Datei';
        const isDirty = activeFile.currentContent !== activeFile.originalContent;
        title = `${isDirty ? '• ' : ''}${fileName} - Nota`;
    }
    window.electronAPI.sendTitle(title);
}

function initializeEditor() {
    if (openFiles.length === 0) {
        addNewFile();
    }
}

// --- Event Listener für Nutzerinteraktionen ---

textarea.addEventListener('input', () => {
  const activeFile = openFiles.find(f => f.id === activeFileId);
  if (activeFile) {
    activeFile.currentContent = textarea.value;
    renderTabs();
  }
});

document.getElementById('open-file-button').addEventListener('click', () => window.electronAPI.startFileOpen());
document.getElementById('save-file-button').addEventListener('click', () => window.electronAPI.startFileSave());
document.getElementById('minimize-button').addEventListener('click', () => window.electronAPI.minimizeWindow());
document.getElementById('maximize-button').addEventListener('click', () => window.electronAPI.maximizeWindow());
document.getElementById('close-button').addEventListener('click', () => window.electronAPI.closeWindow());
document.getElementById('new-tab-button').addEventListener('click', () => addNewFile());

// --- API Listener für Anfragen/Daten vom Main-Prozess ---

window.electronAPI.onFileOpened((content, filePath) => {
    const existingFile = openFiles.find(f => f.filePath === filePath);
    if(existingFile) {
        setActiveFile(existingFile.id);
    } else {
        const firstFile = openFiles[0];
        if (openFiles.length === 1 && firstFile.filePath === null && firstFile.currentContent === '') {
            firstFile.filePath = filePath;
            firstFile.originalContent = content;
            firstFile.currentContent = content;
            setActiveFile(firstFile.id);
        } else {
            addNewFile(filePath, content);
        }
    }
});
window.electronAPI.onFileSaved((content, filePath) => {
    const activeFile = openFiles.find(f => f.id === activeFileId);
    if (activeFile) {
        activeFile.filePath = filePath;
        activeFile.originalContent = content;
        activeFile.currentContent = content;
        renderTabs();
    }
});

window.electronAPI.onRequestEditorContentForSave(() => {
    const activeFile = openFiles.find(f => f.id === activeFileId);
    if (activeFile) {
        window.electronAPI.sendEditorContentForSave({
            content: activeFile.currentContent,
            filePath: activeFile.filePath,
        });
    }
});

window.electronAPI.onCheckUnsavedChanges(() => {
  // Prüft, ob mindestens eine Datei ungespeicherte Änderungen hat
  const hasUnsavedChanges = openFiles.some(file => file.currentContent !== file.originalContent);
  window.electronAPI.sendUnsavedChangesResponse(hasUnsavedChanges);
});

// --- Start ---
// DIESE ZEILE STELLT SICHER, DASS BEIM START EIN TAB GEÖFFNET WIRD.
initializeEditor();