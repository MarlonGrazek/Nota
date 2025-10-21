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
        this.ANIM_TRANSITION_PROPS_FLIP = `transform ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING}`;

        // Für das Öffnen UND Schließen (Ein-/Ausrollen, Größe, Opacity)
        this.ANIM_TRANSITION_PROPS_SIZE_OPACITY = `
            clip-path ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            max-width ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            padding-left ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            padding-right ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            margin-right ${this.ANIM_DURATION_MS}ms ${this.ANIM_EASING},
            opacity ${this.ANIM_DURATION_MS * 0.8}ms ease-out 
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
        const newFile = {
            id: this._createId(), // Eindeutige ID generieren
            filePath,
            originalContent: content,
            currentContent: content
        };
        // *** WICHTIG: Merke dir die ID des Tabs, der VORHER aktiv war ***
        const previouslyActiveId = this.activeFileId;

        // Funktion, die den DOM tatsächlich aktualisiert (wird an _animateTabTransition übergeben)
        const updateDom = () => {
            this.openFiles.push(newFile); // Füge die neue Datei zur Liste hinzu
            this.activeFileId = newFile.id; // Setze den neuen Tab als aktiv
            this._displayActiveFileContent(); // Zeige den Inhalt im Editor an
            this.renderTabs(); // Rendere die Tab-Leiste neu
        };

        // Rufe die Animationsfunktion auf und übergebe die IDs der beteiligten Tabs
        this._animateTabTransition(updateDom, {
            openingTabId: newFile.id,          // Der Tab, der gerade geöffnet wird
            deactivatingTabId: previouslyActiveId // Der Tab, der gerade deaktiviert wird
        });

        // Scrolle leicht verzögert ans Ende, damit der neue Tab sichtbar wird
        setTimeout(() => this._scrollToEnd(), 50);

        return newFile; // Gib das neue Datei-Objekt zurück
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

    /**
     * Führt eine DOM-Aktualisierung durch und animiert die Übergänge der Tabs (Öffnen, Schließen, Aktivieren, Deaktivieren).
     * Verwendet die FLIP-Technik für Positionsänderungen und CSS-Klassen für Ein-/Ausblend- und Wisch-Effekte.
     * @param {function} domUpdateCallback - Die Funktion, die den State (this.openFiles, this.activeFileId) ändert und this.renderTabs() aufruft.
     * @param {object} [options={}] - Optionen zur Steuerung der Animationen.
     * @param {string|null} [options.openingTabId=null] - Die ID des Tabs, der gerade hinzugefügt wird.
     * @param {string|null} [options.closingTabId=null] - Die ID des Tabs, der gerade entfernt wird.
     * @param {string|null} [options.activatingTabId=null] - Die ID des Tabs, der durch das Schließen eines anderen aktiviert wird (bekommt Wisch-Rein-Animation).
     * @param {string|null} [options.deactivatingTabId=null] - Die ID des Tabs, der durch das Öffnen eines neuen deaktiviert wird (bekommt Wisch-Raus-Animation).
     */
    _animateTabTransition(domUpdateCallback, { openingTabId = null, closingTabId = null, activatingTabId = null, deactivatingTabId = null } = {}) {

        // 1. (F)IRST: Positionen aller relevanten Elemente *vor* der DOM-Änderung messen.
        const oldPositions = new Map();
        // Schließt den "+"-Button mit ein, da er sich auch verschieben kann.
        const elementsToTrack = [...this.tabBar.children, document.getElementById('new-tab-button')];
        let closingTabClone = null; // Klon des zu schließenden Tabs für die Geist-Animation.
        let closingTabRect = null;  // Position und Größe des zu schließenden Tabs.

        elementsToTrack.forEach(el => {
            if (!el) return; // Überspringe, falls ein Element nicht gefunden wird.
            const id = el.dataset.fileId || el.id; // Nutze data-file-id oder die Element-ID.
            const rect = el.getBoundingClientRect(); // Messe Position und Größe.
            oldPositions.set(id, rect); // Speichere in der Map.

            // Wenn dieser Tab geschlossen wird, erstelle einen Klon für die Animation.
            if (id === closingTabId) {
                closingTabClone = el.cloneNode(true); // Tiefe Kopie des Elements.
                closingTabRect = rect; // Speichere seine letzte Position.
            }
        });

        // 2. (L)AST: Führe die DOM-Änderung durch (State ändern & neu rendern via Callback).
        domUpdateCallback();

        // 3. (I)NVERT: Messe die *neuen* Positionen und bereite die Invertierungs-Transformationen vor.
        let openingTabEl = null;    // Referenz auf das DOM-Element des neuen Tabs.
        let activatingTabEl = null; // Referenz auf das Element, das die Wisch-Rein-Animation bekommt.
        let deactivatingTabEl = null; // Referenz auf das Element, das die Wisch-Raus-Animation bekommt.
        const elementsToAnimate = []; // Array für Elemente, die nur verschoben werden (FLIP).
        // Schließt wieder den "+"-Button mit ein.
        const newElements = [...this.tabBar.children, document.getElementById('new-tab-button')];

        newElements.forEach(el => {
            if (!el) return;
            const id = el.dataset.fileId || el.id;
            const oldRect = oldPositions.get(id); // Hole die alte Position aus der Map.

            // Identifiziere die speziell zu animierenden Tabs.
            if (id === openingTabId) {
                openingTabEl = el; return; // Neuer Tab wird nicht verschoben, nur eingeblendet.
            }
            if (id === activatingTabId) {
                activatingTabEl = el;
            }
            if (id === deactivatingTabId) {
                deactivatingTabEl = el;
            }

            // Wenn das Element schon vorher da war, berechne die Positionsänderung.
            if (oldRect) {
                const newRect = el.getBoundingClientRect();
                const deltaX = oldRect.left - newRect.left; // Differenz in der X-Position.

                // Wenn sich die Position signifikant geändert hat, bereite FLIP vor.
                if (Math.abs(deltaX) > 0.5) {
                    // Setze die Invertierungs-Transformation (bewege Element zur alten Position).
                    el.style.transform = `translateX(${deltaX}px)`;
                    el.style.transition = 'none'; // Wichtig: Keine Transition während des Setups!
                    elementsToAnimate.push(el); // Füge zum Array der zu animierenden Elemente hinzu.
                }
            }
        });

        // --- Animations-Setup (vor dem nächsten Frame) ---

        // Setup 1: Öffnenden Tab vorbereiten (Start: rechts eingeklappt, unsichtbar).
        if (openingTabEl) {
            openingTabEl.style.transition = 'none';
            openingTabEl.style.clipPath = 'inset(0 100% 0 0)';
            openingTabEl.style.maxWidth = '0px';
            openingTabEl.style.paddingLeft = '0';
            openingTabEl.style.paddingRight = '0';
            openingTabEl.style.marginRight = '0';
            openingTabEl.style.opacity = '0';
        }

        // Setup 2: Schließenden "Geist"-Tab vorbereiten (Start: voll sichtbar an alter Position).
        if (closingTabClone && closingTabRect) {
            closingTabClone.classList.remove('active'); // Style anpassen (nicht mehr aktiv).
            closingTabClone.classList.add('tab-ghost-exiting'); // Basis-Styling für den Geist.
            closingTabClone.style.position = 'absolute'; // Für Positionierung außerhalb des Flows.
            closingTabClone.style.left = `${closingTabRect.left}px`;
            closingTabClone.style.top = `${closingTabRect.top}px`;
            closingTabClone.style.width = `${closingTabRect.width}px`;
            closingTabClone.style.height = `${closingTabRect.height}px`;
            closingTabClone.style.margin = '0'; // Keine Margins bei absoluter Positionierung.
            closingTabClone.style.pointerEvents = 'none'; // Keine Mausinteraktion.
            // Explizite Startwerte für die Transition:
            closingTabClone.style.clipPath = 'inset(0 0 0 0)'; // Vollständig sichtbar.
            closingTabClone.style.maxWidth = `${closingTabRect.width}px`; // Originalbreite.
            closingTabClone.style.opacity = '1'; // Vollständig sichtbar.
            closingTabClone.style.transition = 'none'; // Keine Transition im Setup!
            document.body.appendChild(closingTabClone); // Füge Klon zum Body hinzu.
        }

        // Setup 3: Wisch-Rein-Animation für aktivierten Tab vorbereiten.
        if (activatingTabEl) {
            activatingTabEl.classList.add('tab-wipe-init'); // Setzt Startzustand (rechts eingeklappt).
            getComputedStyle(activatingTabEl).clipPath; // Erzwingt Reflow, damit Transition greift.
        }

        // Setup 4: Wisch-Raus-Animation für deaktivierten Tab vorbereiten.
        if (deactivatingTabEl) {
            deactivatingTabEl.classList.add('tab-wipe-out-init'); // Setzt Startzustand (voll aktiv sichtbar).
            getComputedStyle(deactivatingTabEl).clipPath; // Erzwingt Reflow.
        }

        // 4. (P)LAY: Animationen im nächsten Frame starten.
        requestAnimationFrame(() => {
            const allTransitions = []; // Sammelt Promises für alle laufenden Animationen.

            // Play 1: Nachrutschende Tabs zurück an ihre neue Position animieren (FLIP).
            elementsToAnimate.forEach(el => {
                el.style.transition = this.ANIM_TRANSITION_PROPS_FLIP; // Nur Transform animieren.
                el.style.transform = 'translateX(0)'; // Ziel: Keine Transformation.
                allTransitions.push(this._waitForTransition(el, 'transform')); // Warten bis fertig.
            });

            // Play 2: Öffnender Tab (Einrollen von rechts).
            if (openingTabEl) {
                openingTabEl.style.transition = this.ANIM_TRANSITION_PROPS_SIZE_OPACITY; // Clip, Größe, Opacity animieren.
                openingTabEl.style.clipPath = 'inset(0 0 0 0)'; // Ziel: Voll sichtbar.
                openingTabEl.style.maxWidth = ''; // Ziel: Standard-Breite.
                openingTabEl.style.paddingLeft = ''; // Ziel: Standard-Padding.
                openingTabEl.style.paddingRight = '';// Ziel: Standard-Padding.
                openingTabEl.style.marginRight = ''; // Ziel: Standard-Margin.
                openingTabEl.style.opacity = '1'; // Ziel: Voll sichtbar.
                // Warte auf das Ende der clip-path Animation als Indikator.
                allTransitions.push(this._waitForTransition(openingTabEl, 'clip-path'));
            }

            // Play 3: Schließender Geist-Tab (Einrollen nach rechts & Ausblenden).
            if (closingTabClone) {
                // WICHTIG: Erst die Transition definieren.
                closingTabClone.style.transition = this.ANIM_TRANSITION_PROPS_SIZE_OPACITY; // Clip, Größe, Opacity animieren.

                // DANN die Zielwerte setzen.
                closingTabClone.style.clipPath = 'inset(0 100% 0 0)'; // Ziel: Rechts eingeklappt.
                closingTabClone.style.maxWidth = '0px';          // Ziel: Breite 0.
                closingTabClone.style.paddingLeft = '0';        // Ziel: Padding 0.
                closingTabClone.style.paddingRight = '0';       // Ziel: Padding 0.
                closingTabClone.style.marginRight = '0';        // Ziel: Margin 0.
                closingTabClone.style.opacity = '0';          // Ziel: Unsichtbar.

                // Warte auf das Ende der clip-path Transition, DANN entfernen.
                allTransitions.push(this._waitForTransition(closingTabClone, 'clip-path').then(() => {
                    // Sicherstellen, dass das Element noch da ist, bevor es entfernt wird.
                    if (closingTabClone.parentElement) {
                        closingTabClone.remove();
                    }
                }));
            }

            // Play 4: Wisch-Rein-Animation für aktivierten Tab starten.
            if (activatingTabEl) {
                activatingTabEl.classList.add('tab-wipe-play'); // Startet die Animation.
                allTransitions.push(this._waitForTransition(activatingTabEl, 'clip-path')); // Warten bis fertig.
            }

            // Play 5: Wisch-Raus-Animation für deaktivierten Tab starten.
            if (deactivatingTabEl) {
                deactivatingTabEl.classList.add('tab-wipe-out-play'); // Startet die Animation.
                allTransitions.push(this._waitForTransition(deactivatingTabEl, 'clip-path')); // Warten bis fertig.
            }

            // --- Aufräumen nach Abschluss ALLER Animationen ---
            Promise.all(allTransitions).then(() => {
                // Entferne Inline-Styles und Klassen von den verschobenen Elementen.
                elementsToAnimate.forEach(el => {
                    el.style.transform = '';
                    el.style.transition = '';
                });

                // Entferne Inline-Styles vom geöffneten Element.
                if (openingTabEl) {
                    openingTabEl.style.transition = ''; openingTabEl.style.clipPath = ''; openingTabEl.style.maxWidth = ''; openingTabEl.style.paddingLeft = ''; openingTabEl.style.paddingRight = ''; openingTabEl.style.marginRight = ''; openingTabEl.style.opacity = '';
                }

                // Entferne Klassen vom aktivierten Wisch-Element + Workaround.
                if (activatingTabEl) {
                    activatingTabEl.classList.remove('tab-wipe-init', 'tab-wipe-play');
                    // Workaround, falls Hover-Effekt nach Animation nicht geht:
                    const beforeStyle = getComputedStyle(activatingTabEl, '::before');
                    if (beforeStyle.transition.includes('clip-path')) { // Prüfe ob die Transition noch aktiv ist
                        activatingTabEl.style.setProperty('--temp-transition-override', 'none', 'important');
                        activatingTabEl.offsetHeight; // force reflow
                        activatingTabEl.style.removeProperty('--temp-transition-override');
                    }
                }

                // Entferne Klassen vom deaktivierten Wisch-Element + Workaround.
                if (deactivatingTabEl) {
                    deactivatingTabEl.classList.remove('tab-wipe-out-init', 'tab-wipe-out-play');
                    // Gleicher Workaround wie oben, falls nötig
                    const beforeStyle = getComputedStyle(deactivatingTabEl, '::before');
                    if (beforeStyle.transition.includes('clip-path')) {
                        deactivatingTabEl.style.setProperty('--temp-transition-override', 'none', 'important');
                        deactivatingTabEl.offsetHeight; // force reflow
                        deactivatingTabEl.style.removeProperty('--temp-transition-override');
                    }
                }
                // Der Ghost-Tab wird bereits in seinem eigenen Promise nach der Animation entfernt.
            }).catch(error => {
                console.error("Fehler nach den Tab-Animationen:", error);
                // Notfall-Aufräumen, falls ein Promise rejected wurde
                elementsToTrack.forEach(el => {
                    if (el && el.style) {
                        el.style.transform = ''; el.style.transition = ''; el.style.clipPath = ''; el.style.maxWidth = ''; el.style.paddingLeft = ''; el.style.paddingRight = ''; el.style.marginRight = ''; el.style.opacity = '';
                    }
                    if (el && el.classList) {
                        el.classList.remove('tab-wipe-init', 'tab-wipe-play', 'tab-wipe-out-init', 'tab-wipe-out-play');
                    }
                });
                if (closingTabClone && closingTabClone.parentElement) closingTabClone.remove();
            });
        });
    }

    // _waitForTransition bleibt unverändert (mit Fallback-Timeout)
    _waitForTransition(element, propertyName = null) {
        return new Promise(resolve => {
            const onEnd = (event) => {
                if (event.target === element && (!propertyName || event.propertyName === propertyName)) {
                    element.removeEventListener('transitionend', onEnd);
                    resolve();
                }
            };
            element.addEventListener('transitionend', onEnd);
            // Fallback Timeout
            setTimeout(() => {
                element.removeEventListener('transitionend', onEnd);
                resolve();
            }, this.ANIM_DURATION_MS + 100);
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