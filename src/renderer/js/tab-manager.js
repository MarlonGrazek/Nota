// src/renderer/js/tab-manager.js

export default class TabManager {
    constructor(editorView) {
        this.editorView = editorView;
        this.tabBar = document.querySelector('.tab-bar');
        this.tabAreaWrapper = document.querySelector('.tab-area-wrapper');
        
        this.openFiles = [];
        this.activeFileId = null;

        // Status für Smooth-Scrolling
        this.animationFrameId = null;
        this.currentScroll = 0;
        this.targetScroll = 0;

        // Status für Drag & Drop
        this.draggedTab = null;
        this.placeholder = null;
        this.draggedFile = null;
        this.isDragging = false;
        this.startX = 0;
        this.DRAG_THRESHOLD = 5;
    }

    init() {
        this.currentScroll = this.tabBar.scrollLeft;
        this.targetScroll = this.tabBar.scrollLeft;

        this.addEditorListeners();
        this.addDomListeners();
        this.addApiListeners();
        
        this.initializeEditor();
        this.updateTabFades();
    }

    addEditorListeners() {
        // Listener für Inhaltsänderungen
        this.editorView.on('change', () => {
            const activeFile = this.openFiles.find(f => f.id === this.activeFileId);
            if (activeFile) {
                activeFile.currentContent = this.editorView.getValue();
                this.renderTabs();
            }
        });
    }

    addDomListeners() {
        // "Neuer Tab" Button
        document.getElementById('new-tab-button').addEventListener('click', () => this.addNewFile());

        // Tab-Scrolling
        this.tabBar.addEventListener('wheel', (event) => this.handleTabScrollWheel(event), { passive: false });
        this.tabBar.addEventListener('scroll', () => this.updateTabFades(), { passive: true });
        window.addEventListener('resize', () => this.updateTabFades());

        // Tab Drag & Drop
        this.tabBar.addEventListener('mousedown', (event) => this.handleDragStart(event));

        // Datei-Drop vom Betriebssystem
        this.tabAreaWrapper.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy'; 
            this.tabAreaWrapper.classList.add('drag-over');
        });
        this.tabAreaWrapper.addEventListener('dragleave', () => {
            this.tabAreaWrapper.classList.remove('drag-over');
        });
        this.tabAreaWrapper.addEventListener('drop', (event) => {
            event.preventDefault();
            this.tabAreaWrapper.classList.remove('drag-over');
            if (event.dataTransfer.files.length > 0) {
                for (const file of event.dataTransfer.files) {
                    window.electronAPI.fileDropped(file.path);
                }
            }
        });
    }

    addApiListeners() {
        window.electronAPI.onFileOpened((content, filePath) => {
            const existingFile = this.openFiles.find(f => f.filePath === filePath);
            if (existingFile) { this.setActiveFile(existingFile.id); }
            else {
                const firstFile = this.openFiles[0];
                if (this.openFiles.length === 1 && firstFile.filePath === null && firstFile.currentContent === '') {
                    firstFile.filePath = filePath;
                    firstFile.originalContent = content;
                    firstFile.currentContent = content;
                    this.setActiveFile(firstFile.id);
                } else { this.addNewFile(filePath, content); }
            }
        });

        window.electronAPI.onFileSaved((content, filePath) => {
            const activeFile = this.openFiles.find(f => f.id === this.activeFileId);
            if (activeFile) {
                activeFile.filePath = filePath;
                activeFile.originalContent = content;
                activeFile.currentContent = content;
                this.renderTabs();
            }
        });

        window.electronAPI.onRequestEditorContentForSave(() => {
            const activeFile = this.openFiles.find(f => f.id === this.activeFileId);
            if (activeFile) { window.electronAPI.sendEditorContentForSave({ content: activeFile.currentContent, filePath: activeFile.filePath, }); }
        });

        window.electronAPI.onCheckUnsavedChanges(() => {
            const hasUnsavedChanges = this.openFiles.some(file => file.currentContent !== file.originalContent);
            window.electronAPI.sendUnsavedChangesResponse(hasUnsavedChanges);
        });
    }

    // --- Kernfunktionen ---

    createId = () => `file_${Date.now()}_${Math.random()}`;

    renderTabs() {
        this.tabBar.innerHTML = '';
        this.openFiles.forEach(file => {
            const tabItem = document.createElement('div');
            tabItem.className = 'tab-item';
            tabItem.dataset.fileId = file.id;

            if (file.id === this.activeFileId) tabItem.classList.add('active');

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

            tabItem.addEventListener('click', () => this.setActiveFile(file.id));
            tabItem.querySelector('.tab-close-button').addEventListener('click', (event) => {
                event.stopPropagation();
                this.closeFile(file.id);
            });

            this.tabBar.appendChild(tabItem);
        });

        this.updateWindowTitle();
        this.updateTabFades();
    }

    displayActiveFileContent() {
        const activeFile = this.openFiles.find(f => f.id === this.activeFileId);
        const content = activeFile ? activeFile.currentContent : '';
        this.editorView.setValue(content);
        this.editorView.clearHistory();
        this.editorView.focus();
        this.editorView.getDoc().setCursor(this.editorView.getDoc().getCursor());
    }

    setActiveFile(fileId) {
        this.activeFileId = fileId;
        this.displayActiveFileContent();
        this.renderTabs();
    }

    addNewFile(filePath = null, content = '') {
        const newFile = { id: this.createId(), filePath, originalContent: content, currentContent: content };
        this.openFiles.push(newFile);
        this.setActiveFile(newFile.id);
        return newFile;
    }

    async closeFile(fileIdToClose) {
        const fileToClose = this.openFiles.find(f => f.id === fileIdToClose);
        if (!fileToClose) return;
        const isDirty = fileToClose.currentContent !== fileToClose.originalContent;
        if (isDirty) {
            const result = await window.electronAPI.showConfirmDialog({ type: 'question', buttons: ['Schließen', 'Abbrechen'], defaultId: 1, title: 'Ungespeicherte Änderungen', message: `Möchten Sie die Änderungen an "${fileToClose.filePath?.split(/[\\/]/).pop() || 'Neue Datei'}" wirklich verwerfen?` });
            if (result.response === 1) return;
        }
        const fileIndex = this.openFiles.findIndex(f => f.id === fileIdToClose);
        this.openFiles.splice(fileIndex, 1);
        if (this.openFiles.length === 0) {
            this.activeFileId = null;
            this.displayActiveFileContent();
            this.renderTabs();
            return;
        }
        if (this.activeFileId === fileIdToClose) {
            const newActiveIndex = Math.max(0, fileIndex - 1);
            this.setActiveFile(this.openFiles[newActiveIndex].id);
        } else {
            this.renderTabs();
        }
    }

    updateWindowTitle() {
        const activeFile = this.openFiles.find(f => f.id === this.activeFileId);
        let title = "Nota";
        if (activeFile) {
            const fileName = activeFile.filePath ? activeFile.filePath.split(/[\\/]/).pop() : 'Neue Datei';
            const isDirty = activeFile.currentContent !== activeFile.originalContent;
            title = `${isDirty ? '• ' : ''}${fileName} - Nota`;
        }
        window.electronAPI.sendTitle(title);
    }

    initializeEditor() { 
        if (this.openFiles.length === 0) { this.addNewFile(); } 
    }

    // --- Tab-Fades & Scrolling ---

    updateTabFades() {
        const el = this.tabBar;
        const isOverflowing = el.scrollWidth > el.clientWidth;
        const scrollEnd = el.scrollWidth - el.clientWidth;
        const tolerance = 1; 

        const showLeftFade = el.scrollLeft > tolerance;
        const showRightFade = el.scrollLeft < scrollEnd - tolerance;

        el.classList.toggle('is-scrolled-start', isOverflowing && showLeftFade);
        el.classList.toggle('is-scrolled-end', isOverflowing && showRightFade);
    }

    smoothScrollStep() {
        const distance = this.targetScroll - this.currentScroll;
        if (Math.abs(distance) < 1) {
            this.currentScroll = this.targetScroll;
            this.tabBar.scrollLeft = Math.round(this.currentScroll);
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            return;
        }
        this.currentScroll += distance * 0.1;
        this.tabBar.scrollLeft = Math.round(this.currentScroll);
        this.animationFrameId = requestAnimationFrame(() => this.smoothScrollStep());
    }

    handleTabScrollWheel(event) {
        event.preventDefault();
        this.targetScroll += event.deltaY;
        const maxScrollLeft = this.tabBar.scrollWidth - this.tabBar.clientWidth;
        this.targetScroll = Math.max(0, Math.min(this.targetScroll, maxScrollLeft));

        if (!this.animationFrameId) {
            this.currentScroll = this.tabBar.scrollLeft;
            this.animationFrameId = requestAnimationFrame(() => this.smoothScrollStep());
        }
    }

    // --- Tab Drag & Drop ---

    handleDragStart(event) {
        if (event.button !== 0 || event.target.closest('.tab-close-button')) {
            return;
        }
        const target = event.target.closest('.tab-item');
        if (!target) return;

        this.draggedTab = target;
        this.startX = event.clientX;
        this.isDragging = false;

        // Binde die Methoden an 'this', damit sie im Event-Listener korrekt funktionieren
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    onMouseMove(event) {
        if (!this.draggedTab) return;

        if (!this.isDragging) {
            const deltaX = Math.abs(event.clientX - this.startX);
            if (deltaX < this.DRAG_THRESHOLD) {
                return;
            }
            this.isDragging = true;
            this.initializeDrag();
        }

        event.preventDefault();
        this.draggedTab.style.left = `${event.clientX - this.draggedTab.offsetWidth / 2}px`;
        const staticTabs = [...this.tabBar.querySelectorAll('.tab-item:not(.dragging)')];
        const firstPositions = new Map();
        staticTabs.forEach(tab => {
            firstPositions.set(tab, tab.getBoundingClientRect());
        });

        const closest = staticTabs.reduce((best, child) => {
            const box = child.getBoundingClientRect();
            const offset = event.clientX - (box.left + box.width / 2);
            if (Math.abs(offset) < Math.abs(best.offset)) {
                return { offset: offset, element: child };
            } else {
                return best;
            }
        }, { offset: Number.POSITIVE_INFINITY });

        const targetTab = closest.element;

        if (targetTab) {
            if (closest.offset < 0) {
                this.tabBar.insertBefore(this.placeholder, targetTab);
            } else {
                this.tabBar.insertBefore(this.placeholder, targetTab.nextElementSibling);
            }
        }

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

    initializeDrag() {
        this.draggedFile = this.openFiles.find(f => f.id === this.draggedTab.dataset.fileId);
        this.placeholder = document.createElement('div');
        this.placeholder.className = 'tab-placeholder';
        this.placeholder.style.width = `${this.draggedTab.offsetWidth}px`;
        this.placeholder.style.height = `${this.draggedTab.offsetHeight}px`;

        const rect = this.draggedTab.getBoundingClientRect();
        this.draggedTab.classList.add('dragging');
        this.draggedTab.style.position = 'absolute';
        this.draggedTab.style.left = `${rect.left}px`;
        this.draggedTab.style.top = `${rect.top}px`;
        
        this.tabBar.insertBefore(this.placeholder, this.draggedTab);
        document.body.appendChild(this.draggedTab); 
        document.body.classList.add('is-dragging');
    }

    onMouseUp(event) {
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);

        if (!this.isDragging) {
            this.draggedTab = null;
            return;
        }

        const newFileOrder = Array.from(this.tabBar.children)
            .map(child => {
                if (child === this.placeholder) return this.draggedFile;
                if (child.dataset.fileId) {
                    return this.openFiles.find(f => f.id === child.dataset.fileId);
                }
                return null;
            }).filter(f => f);

        this.openFiles = newFileOrder;

        this.placeholder.remove();
        this.draggedTab.remove();
        document.body.classList.remove('is-dragging');

        this.draggedTab = null;
        this.placeholder = null;
        this.draggedFile = null;
        this.isDragging = false;

        this.renderTabs();
    }
}