// src/renderer/js/tab-manager.js

import ModalManager from './modal-manager.js';

/**
 * Manages the tab interface, including opening, closing, activating,
 * rendering, and drag & drop functionality.
 */
export default class TabManager {
    constructor(editorView) {
        this.editorView = editorView;
        this.tabBar = document.querySelector('.tab-bar');
        this.tabAreaWrapper = document.querySelector('.tab-area-wrapper');

        this.openFiles = [];
        this.activeFileId = null;

        this.scrollState = {
            animationFrameId: null,
            currentScroll: 0,
            targetScroll: 0,
            manualScrollTimeout: null
        };

        this.dragState = {
            draggedTabElement: null,
            placeholderElement: null,
            draggedFileData: null,
            isDragging: false,
            startX: 0,
            mouseOffsetX: 0,
            lastClientX: 0,
            autoScrollIntervalId: null,
        };

        this.DRAG_THRESHOLD = 5;
        this.AUTO_SCROLL_SPEED = 8;
        this.AUTO_SCROLL_ZONE = 40;

        // NEU: Animations-Konstanten
        this.ANIM_DURATION_MS = 250;
        this.ANIM_EASING = 'cubic-bezier(0.25, 0.8, 0.25, 1)';
        this.ANIM_TRANSITION_PROPS = `transform ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING}`;
        this.ANIM_SIZE_PROPS = `
            clip-path ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            max-width ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            padding ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            margin-right ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            opacity ${this.ANIM_DURATION_MS * 0.7}ms ${this.ANIM_EASING}
        `;
    }

    // =========================================================================
    // Initialization & Listeners
    // =========================================================================

    init() {
        this.scrollState.currentScroll = this.tabBar.scrollLeft;
        this.scrollState.targetScroll = this.tabBar.scrollLeft;

        this._addEditorListeners();
        this._addDomListeners();
        this._addApiListeners();

        this._ensureInitialTab();
        this._updateTabFades();
    }

    _addEditorListeners() {
        this.editorView.on('change', () => {
            const activeFile = this.getActiveFile();
            if (activeFile) {
                activeFile.currentContent = this.editorView.getValue();
                this.renderTabs();
            }
        });
    }

    _addDomListeners() {
        document.getElementById('new-tab-button').addEventListener('click', () => this.addNewFile());

        this.tabBar.addEventListener('wheel', (event) => this._handleTabScrollWheel(event), { passive: false });
        this.tabBar.addEventListener('scroll', () => {
            this._updateTabFades();
            if (!this.scrollState.animationFrameId && !this.dragState.autoScrollIntervalId) {
                this.scrollState.currentScroll = this.tabBar.scrollLeft;
                this.scrollState.targetScroll = this.tabBar.scrollLeft;
            }
        }, { passive: true });
        window.addEventListener('resize', () => this._updateTabFades());

        this.tabBar.addEventListener('mousedown', (event) => this._handleDragStart(event));

        this.tabAreaWrapper.addEventListener('dragover', this._handleDragOver);
        this.tabAreaWrapper.addEventListener('dragleave', this._handleDragLeave.bind(this));
        this.tabAreaWrapper.addEventListener('drop', this._handleFileDrop.bind(this));
    }

    _addApiListeners() {
        window.electronAPI.onFileOpened((content, filePath) => {
            const existingFile = this.openFiles.find(f => f.filePath === filePath);
            if (existingFile) {
                this.setActiveFile(existingFile.id);
            } else {
                const firstFile = this.openFiles[0];
                if (this.openFiles.length === 1 && !firstFile.filePath && firstFile.currentContent === '') {
                    firstFile.filePath = filePath;
                    firstFile.originalContent = content;
                    firstFile.currentContent = content;
                    this.activeFileId = firstFile.id;
                    this._displayActiveFileContent(); // Wichtig
                    this.renderTabs();
                    this._scrollTabIntoView(firstFile.id, true);
                } else {
                    this.addNewFile(filePath, content);
                }
            }
        });

        window.electronAPI.onFileSaved((content, filePath) => {
            const fileData = this.openFiles.find(f => f.id === this.activeFileId || f.filePath === filePath);
            if (fileData) {
                fileData.filePath = filePath;
                fileData.originalContent = content;
                if (fileData.id === this.activeFileId) {
                    fileData.currentContent = content;
                    if (this.editorView.getValue() !== content) {
                        this.editorView.setValue(content);
                        this.editorView.clearHistory();
                    }
                }
                this.renderTabs();
            }
        });

        window.electronAPI.onRequestEditorContentForSave(() => {
            const activeFile = this.getActiveFile();
            if (activeFile) {
                window.electronAPI.sendEditorContentForSave({ content: activeFile.currentContent, filePath: activeFile.filePath, });
            }
        });

        window.electronAPI.onCheckUnsavedChanges(() => {
            const hasUnsavedChanges = this.openFiles.some(this.isFileDirty);
            if (hasUnsavedChanges) {
                ModalManager.show({
                    title: 'Ungespeicherte Änderungen', message: 'Sie haben ungespeicherte Änderungen. Möchten Sie wirklich beenden und alle Änderungen verwerfen?', buttons: [{ label: 'Abbrechen', action: () => { } }, { label: 'Beenden & Verwerfen', type: 'danger', action: () => window.electronAPI.forceCloseApp() }]
                });
            } else {
                window.electronAPI.sendUnsavedChangesResponse(false);
            }
        });
    }

    _ensureInitialTab() {
        if (this.openFiles.length === 0) {
            this.addNewFile();
        }
    }


    // =========================================================================
    // Core Tab Management
    // =========================================================================

    _createId = () => `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    getActiveFile() {
        return this.openFiles.find(f => f.id === this.activeFileId);
    }

    isFileDirty(fileData) {
        return typeof fileData?.currentContent === 'string' &&
            typeof fileData?.originalContent === 'string' &&
            fileData.currentContent !== fileData.originalContent;
    }

    renderTabs() {
        const fragment = document.createDocumentFragment();
        this.openFiles.forEach(fileData => {
            if (this.dragState.isDragging && this.dragState.draggedFileData?.id === fileData.id) {
                return;
            }

            const tabElement = document.createElement('div');
            tabElement.className = 'tab-item';
            tabElement.dataset.fileId = fileData.id;

            if (fileData.id === this.activeFileId) tabElement.classList.add('active');

            const isDirty = this.isFileDirty(fileData);
            const fileName = fileData.filePath ? fileData.filePath.split(/[\\/]/).pop() : 'Neue Datei';

            const fileNameSpan = document.createElement('span');
            fileNameSpan.className = 'tab-filename';
            fileNameSpan.textContent = fileName;

            const closeButtonDiv = document.createElement('div');
            closeButtonDiv.className = 'tab-close-button';
            closeButtonDiv.title = 'Schließen';
            closeButtonDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

            if (isDirty) {
                const markerSpan = document.createElement('span'); markerSpan.className = 'tab-dirty-marker'; markerSpan.innerHTML = '•'; tabElement.appendChild(markerSpan);
            }
            tabElement.appendChild(fileNameSpan);
            tabElement.appendChild(closeButtonDiv);

            tabElement.addEventListener('click', () => { if (!this.dragState.isDragging) this.setActiveFile(fileData.id); });
            closeButtonDiv.addEventListener('click', (event) => { event.stopPropagation(); this.closeFile(fileData.id); });

            fragment.appendChild(tabElement);
        });
        this.tabBar.innerHTML = '';
        this.tabBar.appendChild(fragment);

        if (this.dragState.isDragging && this.dragState.placeholderElement) {
            this._updatePlaceholderPosition(this.dragState.lastClientX);
        }

        this._updateWindowTitle();
        this._updateTabFades();
    }


    _displayActiveFileContent() {
        const activeFile = this.getActiveFile();
        const content = activeFile ? activeFile.currentContent : '';
        if (this.editorView.getValue() !== content) { this.editorView.setValue(content); this.editorView.clearHistory(); }
        this.editorView.focus();
    }

    setActiveFile(fileId) {
        if (fileId === this.activeFileId && this.openFiles.length > 0) return;
        this.activeFileId = fileId;
        this._displayActiveFileContent();
        this.renderTabs(); // Kein _animateTabTransition, einfacher Klick soll sofort sein
        this._scrollTabIntoView(fileId);
    }

    addNewFile(filePath = null, content = '') {
        const newFile = { id: this._createId(), filePath, originalContent: content, currentContent: content };

        const updateDom = () => {
            this.openFiles.push(newFile);
            this.activeFileId = newFile.id;
            this._displayActiveFileContent();
            this.renderTabs();
        };

        this._animateTabTransition(updateDom, { openingTabId: newFile.id });

        setTimeout(() => this._scrollToEnd(), 50);
        return newFile;
    }

    closeFile(fileIdToClose) {
        const fileToClose = this.openFiles.find(f => f.id === fileIdToClose);
        if (!fileToClose) return;
        const isDirty = this.isFileDirty(fileToClose);

        const performClose = () => {
            const fileIndex = this.openFiles.findIndex(f => f.id === fileIdToClose);
            if (fileIndex === -1) return;

            let newActiveId = null;
            let activatingTabId = null; // Für Wisch-Animation
            const isClosingActiveTab = (this.activeFileId === fileIdToClose);

            if (isClosingActiveTab && this.openFiles.length > 1) {
                const newActiveIndex = Math.max(0, fileIndex - 1);
                newActiveId = this.openFiles[newActiveIndex].id;
                activatingTabId = newActiveId; // Dieser Tab bekommt den Wisch
            } else if (this.openFiles.length === 1) {
                newActiveId = null;
            } else {
                newActiveId = this.activeFileId;
            }

            const updateDom = () => {
                this.openFiles.splice(fileIndex, 1);

                if (this.openFiles.length === 0) {
                    this.activeFileId = null;
                    this._displayActiveFileContent();
                    this._ensureInitialTab();
                } else {
                    this.activeFileId = newActiveId;
                    this._displayActiveFileContent();
                    this.renderTabs();
                }
            };

            this._animateTabTransition(updateDom, {
                closingTabId: fileIdToClose,
                activatingTabId: activatingTabId
            });
        };

        if (isDirty) { const fileName = fileToClose.filePath?.split(/[\\/]/).pop() || 'Neue Datei'; ModalManager.show({ title: 'Ungespeicherte Änderungen', message: `Möchten Sie die Änderungen an "${fileName}" wirklich verwerfen?`, buttons: [{ label: 'Abbrechen', action: () => { } }, { label: 'Änderungen verwerfen', type: 'danger', action: performClose }] }); }
        else { performClose(); }
    }

    // =========================================================================
    // KORRIGIERTE Open/Close Animation (FLIP)
    // =========================================================================

    _animateTabTransition(domUpdateCallback, { openingTabId = null, closingTabId = null, activatingTabId = null } = {}) {

        // 1. (F)IRST: Positionen *vor* der DOM-Änderung messen
        // Wir verwenden eine Map mit stabilen IDs (fileId oder 'new-tab-button')
        const oldPositions = new Map();
        const elementsToTrack = [...this.tabBar.children, document.getElementById('new-tab-button')];
        let closingTabClone = null;
        let closingTabRect = null;

        elementsToTrack.forEach(el => {
            if (!el) return;
            const id = el.dataset.fileId || el.id;
            const rect = el.getBoundingClientRect();
            oldPositions.set(id, rect);

            if (id === closingTabId) {
                closingTabClone = el.cloneNode(true); // Klon für Geist-Animation
                closingTabRect = rect;
            }
        });

        // 2. (L)AST: DOM-Änderung durchführen (State ändern & neu rendern via callback)
        domUpdateCallback();

        // 3. (I)NVERT: Neue Positionen messen und Invertierung vorbereiten
        let openingTabEl = null;
        let activatingTabEl = null;
        const elementsToAnimate = []; // Tabs, die sich verschieben (FLIP)
        const newElements = [...this.tabBar.children, document.getElementById('new-tab-button')];

        newElements.forEach(el => {
            if (!el) return;
            const id = el.dataset.fileId || el.id;
            const oldRect = oldPositions.get(id);

            if (id === openingTabId) {
                openingTabEl = el; // Referenz auf den neuen Tab
                return;
            }
            if (id === activatingTabId) {
                activatingTabEl = el; // Referenz auf den Wisch-Tab
            }

            if (oldRect) {
                // Dieses Element existierte schon vorher
                const newRect = el.getBoundingClientRect();
                const deltaX = oldRect.left - newRect.left;

                if (Math.abs(deltaX) > 0.5) {
                    el.style.transform = `translateX(${deltaX}px)`;
                    el.style.transition = 'none';
                    elementsToAnimate.push(el);
                }
            }
        });

        // Animations-Setup (vor dem nächsten Frame)

        // Setup 1: Öffnenden Tab vorbereiten (Anforderung 1)
        if (openingTabEl) {
            openingTabEl.style.transition = 'none';
            openingTabEl.style.clipPath = 'inset(0 100% 0 0)';
            openingTabEl.style.maxWidth = '0px';
            openingTabEl.style.paddingLeft = '0';
            openingTabEl.style.paddingRight = '0';
            openingTabEl.style.marginRight = '0';
            openingTabEl.style.opacity = '0';
        }

        // Setup 2: Schließenden "Geist"-Tab vorbereiten (Anforderung 2)
        if (closingTabClone && closingTabRect) {
            closingTabClone.classList.remove('active');
            closingTabClone.classList.add('tab-ghost-exiting');
            closingTabClone.style.position = 'absolute';
            closingTabClone.style.left = `${closingTabRect.left}px`;
            closingTabClone.style.top = `${closingTabRect.top}px`;
            closingTabClone.style.width = `${closingTabRect.width}px`;
            closingTabClone.style.height = `${closingTabRect.height}px`;
            closingTabClone.style.margin = '0';
            closingTabClone.style.pointerEvents = 'none';
            closingTabClone.style.transition = 'none';
            document.body.appendChild(closingTabClone);
        }

        // Setup 3: Aktivierenden Tab für Wisch-Effekt vorbereiten (Anforderung 4)
        if (activatingTabEl) {
            // Setzt den Startzustand der Wisch-Animation (eingerollt)
            activatingTabEl.classList.add('tab-wipe-init');
            // Nötig, um den "transition: none" Zustand zu erzwingen
            getComputedStyle(activatingTabEl).clipPath;
        }

        // 4. (P)LAY: Animationen im nächsten Frame starten
        requestAnimationFrame(() => {
            const allTransitions = []; // Zum Aufräumen

            // Play 1: Nachrutschende Tabs (Anforderung 3)
            elementsToAnimate.forEach(el => {
                el.style.transition = this.ANIM_TRANSITION_PROPS;
                el.style.transform = 'translateX(0)';
                allTransitions.push(this._waitForTransition(el));
            });

            // Play 2: Öffnender Tab (Anforderung 1)
            if (openingTabEl) {
                openingTabEl.style.transition = this.ANIM_SIZE_PROPS;
                openingTabEl.style.clipPath = 'inset(0 0 0 0)';
                openingTabEl.style.maxWidth = '250px';
                openingTabEl.style.paddingLeft = '';
                openingTabEl.style.paddingRight = '';
                openingTabEl.style.marginRight = '';
                openingTabEl.style.opacity = '1';
                allTransitions.push(this._waitForTransition(openingTabEl));
            }

            // Play 3: Schließender Geist-Tab (Anforderung 2)
            if (closingTabClone) {
                closingTabClone.style.transition = this.ANIM_SIZE_PROPS;
                closingTabClone.style.clipPath = 'inset(0 0 0 100%)'; // "Einrollen" nach links
                closingTabClone.style.maxWidth = '0px';
                closingTabClone.style.paddingLeft = '0';
                closingTabClone.style.paddingRight = '0';
                closingTabClone.style.marginRight = '0';
                closingTabClone.style.opacity = '0';
                allTransitions.push(this._waitForTransition(closingTabClone).then(() => {
                    closingTabClone.remove();
                }));
            }

            // Play 4: Wisch-Animation (Anforderung 4)
            if (activatingTabEl) {
                // Löst die Wisch-Animation aus (ausrollen)
                activatingTabEl.classList.add('tab-wipe-play');
                allTransitions.push(this._waitForTransition(activatingTabEl, 'clip-path'));
            }

            // Aufräumen, wenn alle Animationen fertig sind
            Promise.all(allTransitions).then(() => {
                elementsToAnimate.forEach(el => {
                    el.style.transform = '';
                    el.style.transition = '';
                });
                if (openingTabEl) {
                    openingTabEl.style.transition = '';
                    openingTabEl.style.clipPath = '';
                    openingTabEl.style.maxWidth = '';
                }
                if (activatingTabEl) {
                    activatingTabEl.classList.remove('tab-wipe-init');
                    activatingTabEl.classList.remove('tab-wipe-play');
                }
            });
        });
    }

    _waitForTransition(element, propertyName = null) {
        return new Promise(resolve => {
            const onEnd = (event) => {
                // Wenn wir auf eine bestimmte Eigenschaft warten (z.B. 'clip-path'),
                // ignorieren wir andere 'transitionend'-Events.
                if (propertyName && event.propertyName !== propertyName) {
                    return;
                }
                element.removeEventListener('transitionend', onEnd);
                resolve();
            };
            element.addEventListener('transitionend', onEnd);
        });
    }

    _updateWindowTitle() {
        const activeFile = this.getActiveFile();
        let title = "Nota"; if (activeFile) { const fileName = activeFile.filePath ? activeFile.filePath.split(/[\\/]/).pop() : 'Neue Datei'; const dirtyPrefix = this.isFileDirty(activeFile) ? '• ' : ''; title = `${dirtyPrefix}${fileName} - Nota`; } window.electronAPI.sendTitle(title);
    }

    _scrollTabIntoView(fileId, instant = false) {
        const tabElement = this.tabBar.querySelector(`.tab-item[data-file-id="${fileId}"]`);
        if (tabElement) {
            const targetScroll = this._calculateScrollForElement(tabElement);
            if (instant) {
                this._cancelSmoothScroll(); this.tabBar.scrollLeft = targetScroll; this.scrollState.currentScroll = targetScroll; this.scrollState.targetScroll = targetScroll;
            } else { this._startSmoothScroll(targetScroll); }
        }
    }

    _calculateScrollForElement(element) {
        const tabBarRect = this.tabBar.getBoundingClientRect(); const elementRect = element.getBoundingClientRect(); const currentScroll = this.tabBar.scrollLeft; const elementLeftRelativeToTabBar = elementRect.left - tabBarRect.left; const elementRightRelativeToTabBar = elementRect.right - tabBarRect.left; if (elementLeftRelativeToTabBar < 0) { return currentScroll + elementLeftRelativeToTabBar - 10; } /* Add buffer */ else if (elementRightRelativeToTabBar > tabBarRect.width) { return currentScroll + (elementRightRelativeToTabBar - tabBarRect.width) + 10; } /* Add buffer */ return currentScroll;
    }

    _scrollToEnd() {
        const maxScrollLeft = this.tabBar.scrollWidth - this.tabBar.clientWidth;
        if (maxScrollLeft > this.tabBar.scrollLeft) { this._startSmoothScroll(maxScrollLeft); }
    }

    // =========================================================================
    // Tab Bar Scrolling & Fades
    // =========================================================================

    _updateTabFades() {
        const el = this.tabBar; if (!el) return; const isOverflowing = el.scrollWidth > el.clientWidth; const scrollEnd = el.scrollWidth - el.clientWidth; const tolerance = 1; const showLeftFade = el.scrollLeft > tolerance; const showRightFade = el.scrollLeft < scrollEnd - tolerance; el.classList.toggle('is-scrolled-start', isOverflowing && showLeftFade); el.classList.toggle('is-scrolled-end', isOverflowing && showRightFade);
    }

    _startSmoothScroll(targetScrollLeft) {
        const state = this.scrollState;
        const maxScrollLeft = this.tabBar.scrollWidth - this.tabBar.clientWidth;
        state.targetScroll = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft));
        if (!state.animationFrameId || state.targetScroll !== state.currentScroll) {
            state.currentScroll = this.tabBar.scrollLeft; this._cancelSmoothScroll(); state.animationFrameId = requestAnimationFrame(() => this._smoothScrollStep());
        }
    }

    _smoothScrollStep() {
        const state = this.scrollState;
        const distance = state.targetScroll - state.currentScroll;
        if (Math.abs(distance) < 1) { state.currentScroll = state.targetScroll; this.tabBar.scrollLeft = Math.round(state.currentScroll); this._cancelSmoothScroll(); return; }
        state.currentScroll += distance * 0.15; this.tabBar.scrollLeft = Math.round(state.currentScroll); state.animationFrameId = requestAnimationFrame(() => this._smoothScrollStep());
    }

    _cancelSmoothScroll() {
        if (this.scrollState.animationFrameId) { cancelAnimationFrame(this.scrollState.animationFrameId); this.scrollState.animationFrameId = null; }
    }

    _handleTabScrollWheel(event) {
        event.preventDefault();
        const currentEffectiveScroll = this.scrollState.animationFrameId ? this.scrollState.currentScroll : this.tabBar.scrollLeft;
        const newTargetScroll = currentEffectiveScroll + event.deltaY;
        this._startSmoothScroll(newTargetScroll);
        clearTimeout(this.scrollState.manualScrollTimeout);
        this.scrollState.manualScrollTimeout = setTimeout(() => { if (!this.scrollState.animationFrameId) { this.scrollState.currentScroll = this.tabBar.scrollLeft; this.scrollState.targetScroll = this.tabBar.scrollLeft; } }, 150);
    }

    // =========================================================================
    // Drag & Drop Auto Scroll
    // =========================================================================

    _startAutoScroll(direction) {
        const state = this.dragState; if (state.autoScrollIntervalId) return; state.autoScrollIntervalId = setInterval(() => { if (!state.isDragging || !state.draggedTabElement) { this._stopAutoScroll(); return; } const currentScroll = this.tabBar.scrollLeft; const maxScrollLeft = this.tabBar.scrollWidth - this.tabBar.clientWidth; let newScroll = currentScroll; newScroll += (direction === 'left' ? -1 : 1) * this.AUTO_SCROLL_SPEED; newScroll = Math.max(0, Math.min(newScroll, maxScrollLeft)); if (newScroll !== currentScroll) { this.tabBar.scrollLeft = newScroll; this.scrollState.currentScroll = newScroll; this.scrollState.targetScroll = newScroll; const tabBarRect = this.tabBar.getBoundingClientRect(); const draggedTabWidth = state.draggedTabElement.offsetWidth; const minLeft = tabBarRect.left; const maxLeft = tabBarRect.right - draggedTabWidth; const potentialLeft = state.lastClientX - state.mouseOffsetX; const clampedLeft = Math.max(minLeft, Math.min(potentialLeft, maxLeft)); state.draggedTabElement.style.left = `${clampedLeft}px`; this._updatePlaceholderPosition(state.lastClientX); } else { this._stopAutoScroll(); } }, 16);
    }

    _stopAutoScroll() {
        clearInterval(this.dragState.autoScrollIntervalId); this.dragState.autoScrollIntervalId = null;
    }

    // =========================================================================
    // Tab Drag & Drop Handlers
    // =========================================================================

    _handleDragStart(event) {
        if (event.button !== 0 || event.target.closest('.tab-close-button')) return;
        const targetTab = event.target.closest('.tab-item');
        if (!targetTab) return;

        const state = this.dragState;
        state.draggedTabElement = targetTab;
        state.startX = event.clientX;
        state.lastClientX = event.clientX;
        state.isDragging = false;

        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    _onMouseMove(event) {
        const state = this.dragState;
        if (!state.draggedTabElement) return;

        state.lastClientX = event.clientX;

        if (!state.isDragging) {
            const deltaX = Math.abs(event.clientX - state.startX);
            if (deltaX < this.DRAG_THRESHOLD) return;

            state.isDragging = true;
            const tabRect = state.draggedTabElement.getBoundingClientRect();
            state.mouseOffsetX = event.clientX - tabRect.left;
            this._initializeDragVisuals(event);
            if (!state.isDragging || !state.draggedTabElement) return;
        }

        event.preventDefault();

        const tabBarRect = this.tabBar.getBoundingClientRect();
        const draggedTabWidth = state.draggedTabElement.offsetWidth;
        const minLeft = tabBarRect.left;
        const maxLeft = tabBarRect.right - draggedTabWidth;
        let newLeft = state.lastClientX - state.mouseOffsetX;
        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
        state.draggedTabElement.style.left = `${newLeft}px`;

        const isNearLeftEdge = state.lastClientX < tabBarRect.left + this.AUTO_SCROLL_ZONE;
        const isNearRightEdge = state.lastClientX > tabBarRect.right + this.AUTO_SCROLL_ZONE;
        const canScrollLeft = this.tabBar.scrollLeft > 0;
        const canScrollRight = this.tabBar.scrollLeft < (this.tabBar.scrollWidth - this.tabBar.clientWidth);

        if (isNearLeftEdge && canScrollLeft) this._startAutoScroll('left');
        else if (isNearRightEdge && canScrollRight) this._startAutoScroll('right');
        else this._stopAutoScroll();

        this._updatePlaceholderPosition(state.lastClientX);
    }

    _onMouseUp(event) {
        this._stopAutoScroll();
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);

        const state = this.dragState;

        if (!state.isDragging) {
            this._cleanupDragState();
            // this.renderTabs(); // Nicht nötig, Klick-Event wird in renderTabs angehängt
            return;
        }

        document.body.classList.remove('is-dragging');

        const draggedTabElement = state.draggedTabElement;
        const placeholderElement = state.placeholderElement;
        const draggedFileId = state.draggedFileData ? state.draggedFileData.id : null;

        if (!draggedTabElement || !placeholderElement || !draggedFileId) {
            console.error("Drag state inconsistent on mouseup.");
            state.isDragging = true;
            this._cleanupDragState(true);
            return;
        }

        const placeholderIndex = Array.from(this.tabBar.children).indexOf(placeholderElement);
        const tabBarRect = this.tabBar.getBoundingClientRect();
        const firstRect = draggedTabElement.getBoundingClientRect();
        const firstRelativeLeft = firstRect.left - tabBarRect.left + this.tabBar.scrollLeft;
        const firstRelativeTop = firstRect.top - tabBarRect.top;

        const originalDataIndex = this.openFiles.findIndex(f => f.id === draggedFileId);
        if (originalDataIndex !== -1) {
            const [movedFile] = this.openFiles.splice(originalDataIndex, 1);
            if (movedFile && placeholderIndex !== -1 && placeholderIndex < this.openFiles.length + 1) { this.openFiles.splice(placeholderIndex, 0, movedFile); }
            else if (movedFile) { this.openFiles.push(movedFile); }
        }

        placeholderElement.remove();
        state.placeholderElement = null;
        state.isDragging = false;
        this.renderTabs();

        const finalTabElement = this.tabBar.querySelector(`.tab-item[data-file-id="${draggedFileId}"]`);
        if (!finalTabElement) {
            state.isDragging = true;
            this._cleanupDragState(true);
            console.error("Could not find final tab element after render.");
            return;
        }

        const lastRect = finalTabElement.getBoundingClientRect();
        const lastRelativeLeft = lastRect.left - tabBarRect.left + this.tabBar.scrollLeft;
        const lastRelativeTop = lastRect.top - tabBarRect.top;

        const deltaX = firstRelativeLeft - lastRelativeLeft;
        const deltaY = firstRelativeTop - lastRelativeTop;

        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
            finalTabElement.style.opacity = '1';
            if (draggedTabElement && draggedTabElement.parentElement) {
                draggedTabElement.remove();
            }

            this._cleanupDragState(false);
            return;
        }

        draggedTabElement.style.left = `${lastRect.left}px`;
        draggedTabElement.style.top = `${lastRect.top}px`;
        draggedTabElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        draggedTabElement.style.transition = 'none';
        finalTabElement.style.opacity = '0';

        requestAnimationFrame(() => {
            if (!draggedTabElement || !draggedTabElement.parentElement) {
                if (finalTabElement) finalTabElement.style.opacity = '1';
                if (draggedTabElement && draggedTabElement.parentElement) draggedTabElement.remove();
                this._cleanupDragState(false);
                return;
            }
            draggedTabElement.style.transition = `transform 0.18s ${this.ANIM_EASING}`;
            draggedTabElement.style.transform = 'translate(0, 0)';
            draggedTabElement.addEventListener('transitionend', () => {
                const finalTab = this.tabBar.querySelector(`.tab-item[data-file-id="${draggedFileId}"]`);
                if (finalTab) finalTab.style.opacity = '1';
                if (draggedTabElement && draggedTabElement.parentElement) draggedTabElement.remove();
                this._cleanupDragState(false);
            }, { once: true });
        });
    }

    _initializeDragVisuals(initialEvent) {
        const state = this.dragState;
        const originalElement = state.draggedTabElement;
        if (!originalElement) { state.isDragging = false; return; };

        state.draggedFileData = this.openFiles.find(f => f.id === originalElement.dataset.fileId);
        if (!state.draggedFileData) { console.error("Could not find file data for dragged tab."); state.isDragging = false; state.draggedTabElement = null; return; }

        const wasActive = originalElement.classList.contains('active');

        state.placeholderElement = document.createElement('div');
        state.placeholderElement.className = 'tab-placeholder';
        const rect = originalElement.getBoundingClientRect();
        state.placeholderElement.style.width = `${rect.width}px`;
        state.placeholderElement.style.height = `${rect.height}px`;
        // WICHTIG: margin (statt gap) für Placeholder
        state.placeholderElement.style.marginRight = getComputedStyle(originalElement).marginRight;

        originalElement.style.position = 'absolute';
        originalElement.style.left = `${initialEvent.clientX - state.mouseOffsetX}px`;
        originalElement.style.top = `${rect.top}px`;
        originalElement.style.width = `${rect.width}px`;
        originalElement.classList.add('dragging');
        originalElement.style.pointerEvents = 'none';
        // originalElement.style.opacity = '0.9'; // Aus deinem Original-Code entfernt
        originalElement.style.zIndex = '999';

        if (wasActive) {
            originalElement.classList.add('was-active');
        } else {
            originalElement.classList.add('was-inactive');
        }

        this.tabBar.insertBefore(state.placeholderElement, originalElement);
        document.body.appendChild(originalElement);
        document.body.classList.add('is-dragging');
    }

    _cleanupDragState(forceVisualCleanup = false) {
        const state = this.dragState;
        const elementToCleanup = state.draggedTabElement;

        if (forceVisualCleanup) {
            if (state.placeholderElement && state.placeholderElement.parentElement) {
                state.placeholderElement.remove();
            }
            if (elementToCleanup && elementToCleanup.parentElement === document.body) {
                elementToCleanup.remove();
            }
        }
        else if (elementToCleanup && elementToCleanup.parentElement !== document.body) {
            elementToCleanup.style.position = '';
            elementToCleanup.style.left = '';
            elementToCleanup.style.top = '';
            elementToCleanup.style.width = '';
            elementToCleanup.classList.remove('dragging');
            elementToCleanup.style.pointerEvents = '';
            elementToCleanup.style.opacity = '';
            elementToCleanup.style.zIndex = '';
            elementToCleanup.style.transform = '';
            elementToCleanup.style.transition = '';
            elementToCleanup.classList.remove('was-active');
            elementToCleanup.classList.remove('was-inactive');
        }

        state.draggedTabElement = null;
        state.placeholderElement = null;
        state.draggedFileData = null;
        state.isDragging = false;
        state.startX = 0;
        state.mouseOffsetX = 0;
        state.lastClientX = 0;
        this._stopAutoScroll();

        document.body.classList.remove('is-dragging');
    }


    _updatePlaceholderPosition(currentClientX) {
        const state = this.dragState; if (!state.isDragging || !state.placeholderElement || !this.tabBar) return; const tabBarRect = this.tabBar.getBoundingClientRect();
        const staticTabs = [...this.tabBar.children].filter(el => el !== state.placeholderElement);
        const firstPositions = new Map(); staticTabs.forEach(tab => { if (tab.parentElement) { firstPositions.set(tab, tab.getBoundingClientRect()); } }); const clampedClientX = Math.max(tabBarRect.left, Math.min(currentClientX, tabBarRect.right)); let targetElement = null; let insertAtEnd = true; for (const child of staticTabs) { const box = firstPositions.get(child); if (!box) continue; const midpoint = box.left + box.width / 2; if (clampedClientX < midpoint) { targetElement = child; insertAtEnd = false; break; } } let movedPlaceholder = false; if (!insertAtEnd && targetElement) { if (state.placeholderElement.nextElementSibling !== targetElement) { this.tabBar.insertBefore(state.placeholderElement, targetElement); movedPlaceholder = true; } } else if (insertAtEnd) { if (state.placeholderElement !== this.tabBar.lastElementChild) { this.tabBar.appendChild(state.placeholderElement); movedPlaceholder = true; } }

        // Drag-FLIP-Logik (unverändert)
        if (movedPlaceholder) {
            const animDuration = '0.18s';
            const animEasing = 'ease-out';

            staticTabs.forEach(tab => {
                if (!tab.parentElement) return;
                const firstRect = firstPositions.get(tab);
                if (!firstRect) return;
                const lastRect = tab.getBoundingClientRect();
                const deltaX = firstRect.left - lastRect.left;

                if (Math.abs(deltaX) > 0.5) {
                    if (tab.style.transform === '' || tab.style.transition === '') {
                        tab.style.transform = `translateX(${deltaX}px)`;
                        tab.style.transition = 'transform 0s';
                        requestAnimationFrame(() => {
                            if (tab.parentElement) {
                                tab.style.transition = `transform ${animDuration} ${animEasing}`;
                                tab.style.transform = '';
                            }
                        });
                    }
                } else if (tab.style.transform !== '') {
                    requestAnimationFrame(() => {
                        if (tab.parentElement) {
                            tab.style.transition = `transform ${animDuration} ${animEasing}`;
                            tab.style.transform = '';
                        }
                    });
                }
            });
        }
    }

    // =========================================================================
    // OS File Drop Handling
    // =========================================================================
    _handleDragOver(event) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; event.currentTarget.classList.add('drag-over'); }
    _handleDragLeave(event) { if (!event.currentTarget.contains(event.relatedTarget)) { event.currentTarget.classList.remove('drag-over'); } }
    _handleFileDrop(event) { event.preventDefault(); event.currentTarget.classList.remove('drag-over'); if (event.dataTransfer.files.length > 0) { for (const file of event.dataTransfer.files) { window.electronAPI.fileDropped(file.path); } } }
}