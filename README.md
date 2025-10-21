# Nota

A straightforward, modern text editor built with Electron. ✍️

## Overview

Nota is an Electron-based desktop application designed for editing text files. It leverages CodeMirror for its core editing capabilities and features a clean, tabbed dark-themed user interface.

## ✨ Key Features

* **Multi-File Editing:** Open and manage multiple files seamlessly using a tabbed interface with smooth open/close animations.
* **CodeMirror Integration:** Utilizes the CodeMirror editor component, providing line numbers, active line highlighting, and a dark theme (`one-dark`).
* **File Management:**
    * Open files via a system dialog or by dragging and dropping them onto the application.
    * Save files, including a "Save As" prompt for new, untitled files.
    * Detects unsaved changes (`dirty` state) and prompts the user before closing.
* **Custom Interface:**
    * Features a frameless window design with custom minimize, maximize, and close controls.
    * Includes a status bar showing the current cursor position (line, column) and editor zoom level.
* **Zoom Control:** Adjust the editor's font size using `Ctrl + Mouse Wheel`. Click the zoom indicator in the status bar to reset to 100%.
* **Automatic Updates:** Integrated update functionality using `electron-updater` notifies users when a new version is downloaded and ready to install.

## ⚙️ Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run the Application (Development Mode):**
    ```bash
    npm start
    ```

## 📦 Building for Distribution

To package the application for distribution (e.g., creating an NSIS installer for Windows):

```bash
npm run dist

