const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const projectRoot = path.join(__dirname, '..');

contextBridge.exposeInMainWorld('petAPI', {
  loadManifest(form = 'lanyu') {
    const safeForm = String(form || 'lanyu').replace(/[^a-z0-9_-]/gi, '');
    const formManifestPath = path.join(projectRoot, 'assets', 'manifests', `${safeForm}.json`);
    const manifestPath = fs.existsSync(formManifestPath)
      ? formManifestPath
      : path.join(projectRoot, 'assets', 'manifest.json');
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
  openMenu() {
    ipcRenderer.send('pet-open-menu');
  },
  resize(size) {
    ipcRenderer.send('pet-resize', size);
  },
  home() {
    ipcRenderer.send('pet-home');
  },
  getCodexTaskDefaults() {
    return ipcRenderer.invoke('codex-task-defaults');
  },
  runCodexTask(task) {
    return ipcRenderer.invoke('codex-task-run', task);
  },
  cancelCodexTask() {
    return ipcRenderer.invoke('codex-task-cancel');
  },
  onCodexTaskEvent(callback) {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('codex-task-event', listener);
    return () => ipcRenderer.removeListener('codex-task-event', listener);
  },
  onCommand(callback) {
    ipcRenderer.on('pet-command', (_event, message) => callback(message.command, message.payload || {}));
  }
});
