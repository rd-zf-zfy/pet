const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const projectRoot = path.join(__dirname, '..');

contextBridge.exposeInMainWorld('battlePetAPI', {
  loadManifest() {
    const manifestPath = path.join(projectRoot, 'assets', 'manifest.json');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  },
  assetUrl(relativePath) {
    return pathToFileURL(path.join(projectRoot, relativePath)).toString();
  },
  moveBy(delta) {
    ipcRenderer.send('pet-move-by', delta);
  },
  getWindowState() {
    return ipcRenderer.invoke('pet-window-state');
  },
  dragStart(offset) {
    ipcRenderer.send('pet-drag-start', offset);
  },
  dragMove() {
    ipcRenderer.send('pet-drag-move');
  },
  dragEnd() {
    ipcRenderer.send('pet-drag-end');
  },
  resize(size) {
    ipcRenderer.send('pet-resize', size);
  },
  home() {
    ipcRenderer.send('pet-home');
  },
  openMenu() {
    ipcRenderer.send('pet-open-menu');
  },
  onCommand(callback) {
    ipcRenderer.on('pet-command', (_event, message) => callback(message.command, message.payload || {}));
  }
});
