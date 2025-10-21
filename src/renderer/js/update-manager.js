// src/renderer/js/update-manager.js

// Importiere den NotificationManager statt dem ModalManager
import NotificationManager from './notification-manager.js';

const UpdateManager = {
  init() {
    window.electronAPI.onUpdateStatus((payload) => {
      console.log('UpdateManager received:', payload);
      this.handleUpdateStatus(payload);
    });
    console.log("Renderer UpdateManager initialized.");
  },

  handleUpdateStatus(payload) {
    const { status, version, message } = payload;

    switch (status) {
      case 'downloaded-pending-restart':
        // Rufe die neue Notification-Funktion auf
        this.showRestartNotification(version);
        break;
      
      case 'error':
        // Wandel auch die Fehlermeldung in eine Notification um
        this.showErrorNotification(message);
        break;
        
      case 'downloading':
        console.log(`Update-Status: Lade herunter... ${payload.percent}%`);
        break;
      case 'checking':
        console.log('Update-Status: Suche nach Update...');
        break;
      case 'not-available':
        console.log('Update-Status: Keine Updates verfügbar.');
        break;
    }
  },

  /**
   * NEU: Zeigt die Update-Benachrichtigung an (statt Modal).
   */
  showRestartNotification(version) {
    NotificationManager.show({
      title: 'Update bereit ✅',
      message: `Version ${version} wurde installiert.\nStarte die App neu, um das Update anzuwenden.`,
      // duration: undefined (oder weglassen) -> kein Timer
      buttons: [
        // Der "x"-Button wird automatisch erstellt.
        // Wir brauchen nur den "Neu starten"-Button.
        {
          label: 'Jetzt neu starten',
          type: 'primary', // Nutzt dein .notification-button.primary Styling
          action: () => {
            window.electronAPI.restartAndInstall();
          }
        }
      ]
    });
  },

  /**
   * NEU: Zeigt eine Fehler-Benachrichtigung an (statt Modal).
   */
  showErrorNotification(message) {
     NotificationManager.show({
        title: 'Update Fehler ❌',
        message: `Es gab ein Problem beim Update:\n${message || 'Unbekannter Fehler'}`,
        // Kein Timer, kein Button (nur 'x' zum Schließen)
     });
  },

  cleanup() {
    window.electronAPI.removeListener('update-status');
  }
};

export default UpdateManager;