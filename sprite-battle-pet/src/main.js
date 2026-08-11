const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;
let dragOffset = { x: 0, y: 0 };

const DEFAULT_SIZE = { width: 320, height: 280 };
const isSmokeTest = process.argv.includes('--smoke-test');
const isDebugWindow = process.argv.includes('--debug-window');
app.disableHardwareAcceleration();
app.setName('灵刃桌宠');

function writeDebugLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.appendFileSync(path.join(app.getPath('userData'), 'debug.log'), line, 'utf8');
  } catch (_error) {
    // Debug logging must never prevent the packaged desktop pet from running.
  }
}

function clampWindowBounds(x, y, width, height) {
  const display = screen.getDisplayMatching({ x, y, width, height });
  const area = display.workArea;
  const nextX = Math.max(area.x, Math.min(x, area.x + area.width - width));
  const nextY = Math.max(area.y, Math.min(y, area.y + area.height - height));
  return { x: nextX, y: nextY };
}

function sendPetCommand(command, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet-command', { command, payload });
  }
}

function boundaryHitPayload(dx, dy, requested, clamped) {
  const edges = [];

  if (clamped.x !== requested.x) {
    edges.push(requested.x > clamped.x ? 'right' : 'left');
  }

  if (clamped.y !== requested.y) {
    edges.push(requested.y > clamped.y ? 'bottom' : 'top');
  }

  return { edges, dx, dy };
}

function popupPetMenu() {
  const menu = Menu.buildFromTemplate([
    { label: '攻击', click: () => sendPetCommand('attack') },
    { label: '跳跃', click: () => sendPetCommand('jump') },
    { label: '受击', click: () => sendPetCommand('hit') },
    { label: '倒下', click: () => sendPetCommand('death') },
    { label: '复活', click: () => sendPetCommand('revive') },
    { type: 'separator' },
    { label: '向左跑', click: () => sendPetCommand('run-left') },
    { label: '向右跑', click: () => sendPetCommand('run-right') },
    { type: 'separator' },
    {
      label: '尺寸',
      submenu: [
        { label: '迷你', click: () => sendPetCommand('size', { size: 'tiny' }) },
        { label: '小', click: () => sendPetCommand('size', { size: 'small' }) },
        { label: '正常', click: () => sendPetCommand('size', { size: 'normal' }) },
        { label: '大', click: () => sendPetCommand('size', { size: 'large' }) }
      ]
    },
    { type: 'separator' },
    { label: '回到底部右侧', click: () => sendPetCommand('home') },
    { label: '退出', click: () => app.quit() }
  ]);

  menu.popup({ window: mainWindow });
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const startX = area.x + area.width - DEFAULT_SIZE.width - 70;
  const startY = area.y + area.height - DEFAULT_SIZE.height - 36;

  mainWindow = new BrowserWindow({
    width: DEFAULT_SIZE.width,
    height: DEFAULT_SIZE.height,
    x: startX,
    y: startY,
    title: '灵刃桌宠',
    frame: false,
    transparent: !isDebugWindow,
    resizable: false,
    movable: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: !isSmokeTest,
    backgroundColor: isDebugWindow ? '#22262c' : '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeDebugLog(`renderer console level=${level} ${sourceId}:${line} ${message}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeDebugLog(`renderer gone reason=${details.reason} exitCode=${details.exitCode}`);
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    writeDebugLog(`did-fail-load ${errorCode} ${errorDescription}`);
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'), {
    query: isDebugWindow ? { debug: '1' } : {}
  });

  mainWindow.webContents.once('did-finish-load', () => {
    writeDebugLog(`did-finish-load debug=${isDebugWindow} smoke=${isSmokeTest}`);
    if (!isSmokeTest) {
      mainWindow.show();
      mainWindow.restore();
      mainWindow.moveTop();
    }
  });

  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 900);
    });
    mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`Smoke test load failed: ${errorCode} ${errorDescription}`);
      app.exit(1);
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('pet-open-menu', popupPetMenu);

ipcMain.handle('pet-window-state', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  return {
    bounds,
    workArea: display.workArea
  };
});

ipcMain.on('pet-move-by', (_event, delta) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const width = bounds.width;
  const height = bounds.height;
  const dx = Math.round(delta.dx || 0);
  const dy = Math.round(delta.dy || 0);
  const requested = {
    x: bounds.x + dx,
    y: bounds.y + dy
  };
  const clamped = clampWindowBounds(requested.x, requested.y, width, height);
  mainWindow.setPosition(clamped.x, clamped.y, false);

  if ((dx || dy) && (clamped.x !== requested.x || clamped.y !== requested.y)) {
    sendPetCommand('boundary-hit', boundaryHitPayload(dx, dy, requested, clamped));
  }
});

ipcMain.on('pet-drag-start', (_event, offset) => {
  dragOffset = {
    x: Math.round(offset.x || 0),
    y: Math.round(offset.y || 0)
  };
});

ipcMain.on('pet-drag-move', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  const next = clampWindowBounds(
    cursor.x - dragOffset.x,
    cursor.y - dragOffset.y,
    bounds.width,
    bounds.height
  );
  mainWindow.setPosition(next.x, next.y, false);
});

ipcMain.on('pet-drag-end', () => {
  dragOffset = { x: 0, y: 0 };
});

ipcMain.on('pet-resize', (_event, size) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const width = Math.round(size.width || DEFAULT_SIZE.width);
  const height = Math.round(size.height || DEFAULT_SIZE.height);
  const bottom = bounds.y + bounds.height;
  const centerX = bounds.x + bounds.width / 2;
  const x = Math.round(centerX - width / 2);
  const y = Math.round(bottom - height);
  const clamped = clampWindowBounds(x, y, width, height);
  mainWindow.setBounds({ x: clamped.x, y: clamped.y, width, height }, false);
});

ipcMain.on('pet-home', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const area = screen.getPrimaryDisplay().workArea;
  mainWindow.setPosition(
    area.x + area.width - bounds.width - 70,
    area.y + area.height - bounds.height - 36,
    false
  );
});
