// src/renderer/js/update-manager.js

// Importiere den ModalManager, den du bereits hast
import ModalManager from './modal-manager.js';

const UpdateManager = {
  init() {
    // Lausche auf alle 'update-status'-Events vom Main-Prozess
    window.electronAPI.onUpdateStatus((payload) => {
      console.log('UpdateManager received:', payload); // Für Debugging
      this.handleUpdateStatus(payload);
    });
    console.log("Renderer UpdateManager initialized.");
  },

  handleUpdateStatus(payload) {
    const { status, version, message } = payload;

    switch (status) {
      case 'downloaded-pending-restart':
        // Das ist der wichtigste Teil: Update ist geladen
        this.showRestartModal(version);
        break;
      
      case 'error':
        // Zeige einen Fehler an, falls etwas schiefgeht
        this.showErrorModal(message);
        break;
        
      case 'checking':
        console.log('Update-Status: Suche nach Update...');
        // Hier könntest du später einen Ladeindikator in der UI zeigen
        break;
        
      case 'downloading':
        console.log(`Update-Status: Lade herunter... ${payload.percent}%`);
        // Hier könntest du eine Fortschrittsanzeige (dein Kreis) implementieren
        break;

      case 'not-available':
        console.log('Update-Status: Keine Updates verfügbar.');
        break;
    }
  },

  /**
   * Zeigt das Modal an, das den Neustart anbietet.
   */
  showRestartModal(version) {
    ModalManager.show({
      title: 'Update heruntergeladen ✅',
      message: `Version ${version} wurde heruntergeladen.\nDas Update wird beim nächsten Start installiert.`,
      buttons: [
        { 
          label: 'OK', 
          action: () => {} // Schließt einfach das Modal
        },
        {
          label: 'Jetzt neu starten',
          type: 'primary', // Nutzt dein 'primary' Button Styling
          action: () => {
            // Sendet das Signal zum Neustart an den Main-Prozess
            window.electronAPI.restartAndInstall();
          }
        }
      ]
    });
  },

  /**
   * Zeigt ein Fehler-Modal an.
   */
  showErrorModal(message) {
     ModalManager.show({
        title: 'Update Fehler ❌',
        message: `Es gab ein Problem beim Update:\n${message || 'Unbekannter Fehler'}`,
        buttons: [{ label: 'OK' }]
     });
  },

  /**
   * (Optional) Eine Cleanup-Funktion, um Listener zu entfernen.
   */
  cleanup() {
    window.electronAPI.removeListener('update-status');
  }
};

// Exportiere das Objekt, damit es in renderer.js importiert werden kann
export default UpdateManager;