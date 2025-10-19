// src/renderer/js/renderer.js

import TabManager from './tab-manager.js';
import TooltipManager from './tooltip-manager.js';
import ModalManager from './modal-manager.js';

// --- INIT ---

// 1. Initialize
TooltipManager.init();
ModalManager.init();

// 2. Create Editor
const editorContainer = document.getElementById('editor-container');
const cursorIndicator = document.getElementById('cursor-indicator');

let editorView = CodeMirror.fromTextArea(editorContainer, {
    lineNumbers: true,
    mode: null,
    theme: 'one-dark',
    styleActiveLine: true,
});

// 3. Keep editor-specific logic
editorView.on('gutterClick', (instance, lineIndex) => {
    instance.setCursor({ line: lineIndex, ch: 0 });
    instance.setSelection(
        { line: lineIndex, ch: 0 },
        { line: lineIndex, ch: instance.getLine(lineIndex).length }
    );
});

editorView.on('cursorActivity', (instance) => {
    const cursor = instance.getCursor();
    const line = cursor.line + 1; // +1, da CodeMirror bei 0 anfängt
    const ch = cursor.ch + 1;   // +1, da CodeMirror bei 0 anfängt
    cursorIndicator.textContent = `Zeile ${line}, Spalte ${ch}`;
});


// 4. Keep Zoom logic
const zoomIndicator = document.getElementById('zoom-indicator');
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


// 5. Initialize TabManager and pass the editor to it
const tabManager = new TabManager(editorView);
tabManager.init(); // This will add its own listeners, including editor.on('change')


// 6. Keep app-level button listeners
document.getElementById('open-file-button').addEventListener('click', () => window.electronAPI.startFileOpen());
document.getElementById('save-file-button').addEventListener('click', () => window.electronAPI.startFileSave());
// 'new-tab-button' is in TabManager
document.getElementById('minimize-button').addEventListener('click', () => window.electronAPI.minimizeWindow());
document.getElementById('maximize-button').addEventListener('click', () => window.electronAPI.maximizeWindow());
document.getElementById('close-button').addEventListener('click', () => window.electronAPI.closeWindow());


// 7. Keep app-level API listeners
window.electronAPI.onWindowStateChange(state => {
    document.getElementById('maximize-button').classList.toggle('is-maximized', state.maximized);
});


// 8. Initial setup calls
applyZoom();