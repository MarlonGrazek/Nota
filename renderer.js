// renderer.js

const editorContainer = document.getElementById('editor-container');
const tabBar = document.querySelector('.tab-bar');
const zoomIndicator = document.getElementById('zoom-indicator');
const cursorIndicator = document.getElementById('cursor-indicator'); // NEU

let openFiles = [];
let activeFileId = null;

let editorView = CodeMirror.fromTextArea(editorContainer, {
    lineNumbers: true,
    mode: null,
    theme: 'one-dark',
    styleActiveLine: true,
});

editorView.on('change', () => {
    const activeFile = openFiles.find(f => f.id === activeFileId);
    if (activeFile) {
        activeFile.currentContent = editorView.getValue();
        renderTabs();
    }
});

editorView.on('gutterClick', (instance, lineIndex) => {
    instance.setCursor({ line: lineIndex, ch: 0 });
    instance.setSelection(
        { line: lineIndex, ch: 0 },
        { line: lineIndex, ch: instance.getLine(lineIndex).length }
    );
});

// NEU: Listener für Cursor-Aktivität
editorView.on('cursorActivity', (instance) => {
    const cursor = instance.getCursor();
    const line = cursor.line + 1; // +1, da CodeMirror bei 0 anfängt
    const ch = cursor.ch + 1;   // +1, da CodeMirror bei 0 anfängt
    cursorIndicator.textContent = `Zeile ${line}, Spalte ${ch}`;
});


// --- Zoom-Logik ---
let zoomLevel = 100;
const ZOOM_STEP = 10;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;

function applyZoom() {
    const editorWrapper = editorView.getWrapperElement();
    editorWrapper.style.fontSize = `${zoomLevel}%`;
    zoomIndicator.textContent = `${zoomLevel}%`;
    editorView.refresh();
}

window.addEventListener('wheel', (event) => {
    if (event.ctrlKey) {
        event.preventDefault();
        if (event.deltaY > 0) {
            zoomLevel -= ZOOM_STEP;
        } else {
            zoomLevel += ZOOM_STEP;
        }
        zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel));
        applyZoom();
    }
});

zoomIndicator.addEventListener('click', () => {
    zoomLevel = 100;
    applyZoom();
});

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

        tabItem.innerHTML = `
      ${dirtyMarker}
      <span class="tab-filename">${fileName}</span>
      <div class="tab-close-button">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>
    `;

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
    const content = activeFile ? activeFile.currentContent : '';
    editorView.setValue(content);
    editorView.clearHistory();
    editorView.focus();

    // Stellt sicher, dass die Cursor-Anzeige beim Tab-Wechsel sofort aktualisiert wird
    editorView.getDoc().setCursor(editorView.getDoc().getCursor());
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
        const result = await window.electronAPI.showConfirmDialog({ type: 'question', buttons: ['Schließen', 'Abbrechen'], defaultId: 1, title: 'Ungespeicherte Änderungen', message: `Möchten Sie die Änderungen an "${fileToClose.filePath?.split(/[\\/]/).pop() || 'Neue Datei'}" wirklich verwerfen?` });
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
    if (activeFile) {
        const fileName = activeFile.filePath ? activeFile.filePath.split(/[\\/]/).pop() : 'Neue Datei';
        const isDirty = activeFile.currentContent !== activeFile.originalContent;
        title = `${isDirty ? '• ' : ''}${fileName} - Nota`;
    }
    window.electronAPI.sendTitle(title);
}

function initializeEditor() { if (openFiles.length === 0) { addNewFile(); } }

// --- Event Listener für Buttons ---

document.getElementById('open-file-button').addEventListener('click', () => window.electronAPI.startFileOpen());
document.getElementById('save-file-button').addEventListener('click', () => window.electronAPI.startFileSave());
document.getElementById('new-tab-button').addEventListener('click', () => addNewFile());
document.getElementById('minimize-button').addEventListener('click', () => window.electronAPI.minimizeWindow());
document.getElementById('maximize-button').addEventListener('click', () => window.electronAPI.maximizeWindow());
document.getElementById('close-button').addEventListener('click', () => window.electronAPI.closeWindow());

// --- API Listener ---

window.electronAPI.onFileOpened((content, filePath) => {
    const existingFile = openFiles.find(f => f.filePath === filePath);
    if (existingFile) { setActiveFile(existingFile.id); }
    else {
        const firstFile = openFiles[0];
        if (openFiles.length === 1 && firstFile.filePath === null && firstFile.currentContent === '') {
            firstFile.filePath = filePath;
            firstFile.originalContent = content;
            firstFile.currentContent = content;
            setActiveFile(firstFile.id);
        } else { addNewFile(filePath, content); }
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
    if (activeFile) { window.electronAPI.sendEditorContentForSave({ content: activeFile.currentContent, filePath: activeFile.filePath, }); }
});

window.electronAPI.onCheckUnsavedChanges(() => {
    const hasUnsavedChanges = openFiles.some(file => file.currentContent !== file.originalContent);
    window.electronAPI.sendUnsavedChangesResponse(hasUnsavedChanges);
});

window.electronAPI.onWindowStateChange(state => {
    document.getElementById('maximize-button').classList.toggle('is-maximized', state.maximized);
});

// --- Start ---
initializeEditor();
applyZoom();