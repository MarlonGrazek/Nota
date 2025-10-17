// renderer.js

const editorContainer = document.getElementById('editor-container');
const tabBar = document.querySelector('.tab-bar');
const zoomIndicator = document.getElementById('zoom-indicator');
const cursorIndicator = document.getElementById('cursor-indicator');
const tabBarContainer = document.querySelector('.tab-bar');

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

function updateTabFades() {
    const el = tabBar;
    const isOverflowing = el.scrollWidth > el.clientWidth;
    const scrollEnd = el.scrollWidth - el.clientWidth;
    const tolerance = 1; // Puffer für exakte Pixelwerte

    // Zeige linken Fade, wenn von links weggescrollt wurde
    const showLeftFade = el.scrollLeft > tolerance;

    // Zeige rechten Fade, wenn noch nicht bis ganz zum Ende gescrollt wurde
    const showRightFade = el.scrollLeft < scrollEnd - tolerance;

    // Schalte die Klassen nur an, wenn die Leiste tatsächlich überfüllt ist
    el.classList.toggle('is-scrolled-start', isOverflowing && showLeftFade);
    el.classList.toggle('is-scrolled-end', isOverflowing && showRightFade);
}

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
        //tabItem.draggable = true;

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
    updateTabFades();
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

// --- NEU: LOGIK FÜR PERFORMANTE, ANIMIERTE TAB-SCROLLING ---

let animationFrameId = null;
let currentScroll = tabBar.scrollLeft;
let targetScroll = tabBar.scrollLeft;

// Diese Funktion wird bei jedem Frame aufgerufen, um die Scroll-Position sanft anzupassen
function smoothScrollStep() {
    // Berechne die Distanz zum Ziel
    const distance = targetScroll - currentScroll;

    // Wenn wir nah genug am Ziel sind, stoppen wir die Animation
    if (Math.abs(distance) < 1) {
        currentScroll = targetScroll;
        tabBar.scrollLeft = Math.round(currentScroll);
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        return;
    }

    // Bewege dich einen Bruchteil der verbleibenden Distanz (das erzeugt den "ease-out" Effekt)
    currentScroll += distance * 0.1; // Der Wert 0.2 steuert die "Geschmeidigkeit"
    tabBar.scrollLeft = Math.round(currentScroll);

    // Fordere den nächsten Frame an
    animationFrameId = requestAnimationFrame(smoothScrollStep);
}

tabBar.addEventListener('wheel', (event) => {
    event.preventDefault();

    // Setze das neue Scroll-Ziel basierend auf der Mausrad-Bewegung
    targetScroll += event.deltaY;

    // Scroll-Grenzen respektieren
    const maxScrollLeft = tabBar.scrollWidth - tabBar.clientWidth;
    targetScroll = Math.max(0, Math.min(targetScroll, maxScrollLeft));

    // Starte die Animation, falls sie nicht bereits läuft
    if (!animationFrameId) {
        currentScroll = tabBar.scrollLeft; // Wichtig: Aktuelle Position als Startpunkt nehmen
        animationFrameId = requestAnimationFrame(smoothScrollStep);
    }
}, { passive: false });

tabBar.addEventListener('scroll', updateTabFades, { passive: true });
window.addEventListener('resize', updateTabFades);

// --- FINALE, MANUELLE DRAG & DROP LOGIK (MIT KLICK-TOLERANZ) ---

const tabAreaWrapper = document.querySelector('.tab-area-wrapper');

let draggedTab = null;
let placeholder = null;
let draggedFile = null;
let isDragging = false;
let startX;

const DRAG_THRESHOLD = 5; // 5 Pixel Bewegungsschwelle

tabBar.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.target.closest('.tab-close-button')) {
        return;
    }
    const target = event.target.closest('.tab-item');
    if (!target) return;

    draggedTab = target;
    startX = event.clientX;
    isDragging = false;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
});

function onMouseMove(event) {
    if (!draggedTab) return;

    if (!isDragging) {
        const deltaX = Math.abs(event.clientX - startX);
        if (deltaX < DRAG_THRESHOLD) {
            return;
        }
        isDragging = true;
        initializeDrag();
    }

    event.preventDefault();

    draggedTab.style.left = `${event.clientX - draggedTab.offsetWidth / 2}px`;

    const staticTabs = [...tabBar.querySelectorAll('.tab-item:not(.dragging)')];

    // 1. FIRST: Positionen für FLIP-Animation merken
    const firstPositions = new Map();
    staticTabs.forEach(tab => {
        firstPositions.set(tab, tab.getBoundingClientRect());
    });

    // --- START: FINALE, KORREKTE LOGIK ---

    // Finde den Tab, dessen MITTE dem Cursor am nächsten ist.
    const closest = staticTabs.reduce((best, child) => {
        const box = child.getBoundingClientRect();
        // Wir berechnen den Abstand zur Mitte des Tabs.
        const offset = event.clientX - (box.left + box.width / 2);

        // Wenn der Abstand dieses Tabs kleiner ist als der bisher beste,
        // wird er zum neuen Favoriten.
        if (Math.abs(offset) < Math.abs(best.offset)) {
            return { offset: offset, element: child };
        } else {
            return best;
        }
    }, { offset: Number.POSITIVE_INFINITY });

    const targetTab = closest.element;

    // 2. LAST: Platziere den Platzhalter basierend auf der Position des Cursors
    // relativ zur Mitte des nächsten Tabs.
    if (targetTab) {
        // Wenn der Offset negativ ist, ist der Cursor in der LINKEN Hälfte des Tabs.
        // Also setzen wir den Platzhalter DAVOR.
        if (closest.offset < 0) {
            tabBar.insertBefore(placeholder, targetTab);
        }
        // Wenn der Offset positiv ist, ist der Cursor in der RECHTEN Hälfte.
        // Also setzen wir den Platzhalter DANACH.
        else {
            tabBar.insertBefore(placeholder, targetTab.nextElementSibling);
        }
    }

    // --- ENDE: FINALE, KORREKTE LOGIK ---

    // 3. INVERT & 4. PLAY (FLIP-Animation, bleibt unverändert)
    staticTabs.forEach(tab => {
        const firstRect = firstPositions.get(tab);
        const lastRect = tab.getBoundingClientRect();
        const deltaX = firstRect.left - lastRect.left;

        if (deltaX !== 0) {
            tab.style.transform = `translateX(${deltaX}px)`;
            tab.style.transition = 'transform 0s';

            requestAnimationFrame(() => {
                tab.style.transition = 'transform 0.2s ease-out';
                tab.style.transform = '';
            });
        }
    });
}

function initializeDrag() {
    draggedFile = openFiles.find(f => f.id === draggedTab.dataset.fileId);

    placeholder = document.createElement('div');
    placeholder.className = 'tab-placeholder';
    placeholder.style.width = `${draggedTab.offsetWidth}px`;
    placeholder.style.height = `${draggedTab.offsetHeight}px`;

    // Das gezogene Tab-Element aus dem Layout nehmen und an seine Maus-Startposition setzen
    const rect = draggedTab.getBoundingClientRect();
    draggedTab.classList.add('dragging');
    draggedTab.style.position = 'absolute'; // Wichtig, damit es schwebt
    draggedTab.style.left = `${rect.left}px`;
    draggedTab.style.top = `${rect.top}px`;
    
    // Platzhalter an der originalen Stelle einfügen
    tabBar.insertBefore(placeholder, draggedTab);

    // Das gezogene Tab an das body-Element hängen, damit es über allem schwebt
    document.body.appendChild(draggedTab); 
    document.body.classList.add('is-dragging');
}


function onMouseUp(event) {
    // IMMER die Listener entfernen, egal ob geklickt oder gezogen wurde
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    if (!isDragging) {
        // Wenn nicht gezogen wurde, war es ein Klick. Nichts weiter tun.
        // Der 'click'-Event-Handler auf dem Tab wird automatisch ausgelöst.
        draggedTab = null;
        return;
    }

    // Wenn gezogen wurde, Logik zum Neusortieren ausführen
    const newFileOrder = Array.from(tabBar.children)
        .map(child => {
            if (child === placeholder) return draggedFile;
            // Wichtig: Filtere den Placeholder aus der Logik, er hat keine fileId
            if (child.dataset.fileId) {
                return openFiles.find(f => f.id === child.dataset.fileId);
            }
            return null;
        }).filter(f => f); // Entferne alle 'null'-Einträge

    openFiles = newFileOrder;

    // Aufräumen
    placeholder.remove();
    draggedTab.remove(); // Das schwebende Element entfernen
    document.body.classList.remove('is-dragging');

    // Zustand zurücksetzen
    draggedTab = null;
    placeholder = null;
    draggedFile = null;
    isDragging = false;

    // Tab-Leiste neu rendern, um den sauberen Endzustand herzustellen
    renderTabs();
}


// --- DATEI-DROP AUS DEM BETRIEBSSYSTEM ---
// Diese Logik bleibt vom nativen Drag&Drop abhängig

tabAreaWrapper.addEventListener('dragover', (event) => {
    event.preventDefault();
    // Zeigt an, dass hier gedroppt werden kann
    event.dataTransfer.dropEffect = 'copy'; 
    tabAreaWrapper.classList.add('drag-over');
});

tabAreaWrapper.addEventListener('dragleave', () => {
    tabAreaWrapper.classList.remove('drag-over');
});

tabAreaWrapper.addEventListener('drop', (event) => {
    event.preventDefault();
    tabAreaWrapper.classList.remove('drag-over');
    
    // Nur ausführen, wenn Dateien vom OS kommen (nicht beim Tab-Sortieren)
    if (event.dataTransfer.files.length > 0) {
        for (const file of event.dataTransfer.files) {
            window.electronAPI.fileDropped(file.path);
        }
    }
});

// --- Start ---
initializeEditor();
applyZoom();
updateTabFades();