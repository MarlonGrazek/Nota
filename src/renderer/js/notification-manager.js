// src/renderer/js/notification-manager.js

const NotificationManager = {
    container: null,
    activeNotifications: new Map(), // Speichert aktive Notifications mit ihrer ID

    /**
     * Initialisiert den Notification Manager.
     */
    init() {
        this.container = document.getElementById('notification-container');
        if (!this.container) {
            console.error('NotificationManager Error: Container nicht gefunden.');
            return;
        }
        console.log("NotificationManager initialized.");
    },

    /**
     * Zeigt eine neue Notification an.
     * @param {object} options - Konfiguration.
     * @param {string} [options.id] - Eindeutige ID (optional, wird generiert wenn nicht vorhanden).
     * @param {string} options.title - Titel der Notification.
     * @param {string} options.message - Nachrichtentext.
     * @param {Array<object>} [options.buttons] - Buttons [{ label, action, type ('primary'|'danger') }].
     * @param {number} [options.duration] - Dauer in Millisekunden, nach der die Notification verschwindet.
     * @returns {string} Die ID der erstellten Notification.
     */
    show(options = {}) {
        if (!this.container) return null;

        const notificationId = options.id || `notif_${Date.now()}_${Math.random()}`;
        if (this.activeNotifications.has(notificationId)) {
            // Optional: Bestehende Notification aktualisieren oder ignorieren
            console.warn(`Notification mit ID ${notificationId} existiert bereits.`);
            return notificationId;
        }

        const notificationBox = document.createElement('div');
        notificationBox.id = notificationId;
        notificationBox.className = 'notification-box';

        // Header mit Titel und Schließen-Button
        const header = document.createElement('div');
        header.className = 'notification-header';

        const titleElement = document.createElement('h4');
        titleElement.className = 'notification-title';
        titleElement.textContent = options.title || 'Notification';
        header.appendChild(titleElement);

        const closeButton = document.createElement('div');
        closeButton.className = 'notification-close-button';
        closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        closeButton.onclick = () => this.close(notificationId);
        header.appendChild(closeButton);

        notificationBox.appendChild(header);

        // Nachrichteninhalt
        const messageElement = document.createElement('p');
        messageElement.className = 'notification-message';
        messageElement.textContent = options.message || '';
        notificationBox.appendChild(messageElement);

        // Action-Buttons
        if (options.buttons && options.buttons.length > 0) {
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'notification-actions';
            options.buttons.forEach(btnConfig => {
                const button = document.createElement('button');
                button.textContent = btnConfig.label || 'OK';
                button.className = 'notification-button';
                if (btnConfig.type === 'primary') button.classList.add('primary');
                else if (btnConfig.type === 'danger') button.classList.add('danger');

                button.addEventListener('click', () => {
                    if (typeof btnConfig.action === 'function') {
                        btnConfig.action();
                    }
                    this.close(notificationId); // Schließt die Notification nach Button-Klick
                });
                actionsContainer.appendChild(button);
            });
            notificationBox.appendChild(actionsContainer);
        }

        // Timer-Balken und Timeout
        let timerBar = null;
        let closeTimeout = null;
        if (options.duration && options.duration > 0) {
            timerBar = document.createElement('div');
            timerBar.className = 'notification-timer-bar';
            notificationBox.appendChild(timerBar);

            // Startet die Animation des Balkens (geht von 100% auf 0% Breite)
            requestAnimationFrame(() => {
                timerBar.style.transitionDuration = `${options.duration}ms`;
                timerBar.style.width = '0%';
            });

            closeTimeout = setTimeout(() => {
                this.close(notificationId);
            }, options.duration);
        }

        // Notification zum Container hinzufügen (oben)
        this.container.insertBefore(notificationBox, this.container.firstChild);

        // Sichtbar machen mit Animation
        requestAnimationFrame(() => {
            notificationBox.classList.add('visible');
        });

        // Referenz speichern
        this.activeNotifications.set(notificationId, { element: notificationBox, timeoutId: closeTimeout });

         // Scrollbar prüfen und ggf. anzeigen
        this.updateScrollbarVisibility();


        return notificationId;
    },

    /**
     * Schließt eine Notification.
     * @param {string} notificationId - Die ID der zu schließenden Notification.
     * @param {boolean} [immediately=false] - Ob sofort oder mit Animation geschlossen werden soll.
     */
    close(notificationId, immediately = false) {
        const notificationData = this.activeNotifications.get(notificationId);
        if (!notificationData) return;

        const { element, timeoutId } = notificationData;

        // Timer stoppen, falls vorhanden
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        this.activeNotifications.delete(notificationId);

        const removeElement = () => {
            if (element.parentElement) {
                element.remove();
            }
             this.updateScrollbarVisibility(); // Scrollbar neu prüfen
        };

        if (immediately) {
            removeElement();
        } else {
            element.classList.remove('visible');
            // Nach der Animation entfernen
            setTimeout(removeElement, 300); // Muss zur CSS transition-duration passen
        }
    },

    /**
     * Prüft, ob die Scrollbar benötigt wird und passt Container-Styling an.
     */
     updateScrollbarVisibility() {
        const needsScrollbar = this.container.scrollHeight > this.container.clientHeight;
         // Optional: Hier könntest du Klassen hinzufügen/entfernen,
         // wenn du z.B. das Padding ändern möchtest, wenn eine Scrollbar sichtbar ist.
         // Beispiel: this.container.classList.toggle('has-scrollbar', needsScrollbar);
     }
};

export default NotificationManager;