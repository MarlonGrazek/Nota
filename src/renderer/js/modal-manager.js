// src/renderer/js/modal-manager.js

const ModalManager = {
    // Referenzen zu den DOM-Elementen des Modals
    modalOverlay: null,
    modalContainer: null,
    modalTitle: null,
    modalMessage: null,
    modalActions: null,
    isVisible: false,

    /**
     * Initialisiert den Manager, sucht die Modal-Elemente im DOM.
     * Sollte einmal beim Start der Anwendung aufgerufen werden.
     */
    init() {
        this.modalOverlay = document.getElementById('modal-overlay');
        this.modalContainer = document.getElementById('modal-container');
        this.modalTitle = document.getElementById('modal-title');
        this.modalMessage = document.getElementById('modal-message');
        this.modalActions = document.getElementById('modal-actions');

        if (!this.modalOverlay) {
            console.error('ModalManager Error: Modal-Overlay-Element nicht im DOM gefunden.');
            return;
        }

        // Klick auf Overlay schließt das Modal (optional, aber oft gewünscht)
        this.modalOverlay.addEventListener('click', (event) => {
            if (event.target === this.modalOverlay) {
                this.close();
            }
        });
        console.log("ModalManager initialized.");
    },

    /**
     * Zeigt das Modal mit den übergebenen Optionen an.
     * @param {object} options - Konfiguration für das Modal.
     * @param {string} options.title - Der Titel des Modals.
     * @param {string} options.message - Der Textinhalt des Modals. HTML wird hier *nicht* interpretiert.
     * @param {Array<object>} [options.buttons] - Konfiguration für die Buttons im Footer.
     * Jedes Objekt sollte { label: 'Button Text', action: () => { ... }, primary: true/false } enthalten.
     */
    show(options = {}) {
        if (!this.modalOverlay || !this.modalContainer || !this.modalTitle || !this.modalMessage || !this.modalActions) {
            console.error('ModalManager Error: Modal-Elemente nicht korrekt initialisiert.');
            return;
        }

        // Titel setzen
        this.modalTitle.textContent = options.title || 'Information';

        // Nachricht setzen (als reinen Text, um HTML-Injection zu vermeiden)
        this.modalMessage.textContent = options.message || '';
        // Optional: Wenn du bewusst HTML erlauben willst, nutze:
        // this.modalMessage.innerHTML = options.message || '';

        // Buttons erstellen
        this.modalActions.innerHTML = ''; // Alte Buttons entfernen
        if (options.buttons && options.buttons.length > 0) {
            options.buttons.forEach(btnConfig => {
                const button = document.createElement('button');
                button.textContent = btnConfig.label || 'OK';
                button.className = 'modal-button';
                
                if (btnConfig.type === 'primary') {
                    button.classList.add('primary');
                } else if (btnConfig.type === 'danger') {
                    button.classList.add('danger');
                }

                button.addEventListener('click', () => {
                    if (typeof btnConfig.action === 'function') {
                        btnConfig.action();
                    }
                    this.close();
                });
                this.modalActions.appendChild(button);
            });
        } else {
            // Standard-OK-Button, wenn keine Buttons definiert sind
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'modal-button primary';
            okButton.addEventListener('click', () => this.close());
            this.modalActions.appendChild(okButton);
        }

        // Modal sichtbar machen
        this.modalOverlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            this.modalOverlay.classList.add('visible');
            this.modalContainer.classList.add('visible');
        });
        this.isVisible = true;
    },

    /**
     * Schließt das aktuell sichtbare Modal.
     */
    close() {
        if (!this.isVisible || !this.modalOverlay || !this.modalContainer) return;

        this.modalOverlay.classList.remove('visible');
        this.modalContainer.classList.remove('visible');
        this.isVisible = false;

        // Warte auf das Ende der CSS-Transition, bevor das 'hidden'-Attribut gesetzt wird
        // (Die Dauer sollte zur CSS-Transition passen)
        setTimeout(() => {
            if (!this.isVisible) { // Stelle sicher, dass es nicht in der Zwischenzeit wieder geöffnet wurde
                this.modalOverlay.classList.add('hidden');
            }
        }, 200); // 200ms passt zur CSS-Transition
    }
};

// Exportiere das Objekt für die Verwendung in anderen Modulen
export default ModalManager;