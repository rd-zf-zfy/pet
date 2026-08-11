const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let dragOffset = { x: 0, y: 0 };
let activeCodexTask = null;
let codexTaskSeq = 0;

const DEFAULT_SIZE = { width: 220, height: 220 };
const isSmokeTest = process.argv.includes('--smoke-test');
const isDebugWindow = process.argv.includes('--debug-window');
const projectRoot = path.join(__dirname, '..');

app.disableHardwareAcceleration();
app.setName('蓝羽桌宠');

function writeDebugLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.appendFileSync(path.join(app.getPath('userData'), 'debug.log'), line, 'utf8');
  } catch (_error) {
    // Debug logging must never prevent the packaged desktop pet from running.
  }
}

function defaultCodexCwd() {
  const candidates = [
    process.env.LANYU_CODEX_CWD,
    ...(app.isPackaged ? [] : [path.resolve(projectRoot, '..'), projectRoot]),
    app.getPath('documents')
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isDirectory();
    } catch (_error) {
      return false;
    }
  }) || process.cwd();
}

function normalizeTaskCwd(rawCwd) {
  const requested = String(rawCwd || '').trim();
  const cwd = path.resolve(requested || defaultCodexCwd());
  const stat = fs.statSync(cwd);

  if (!stat.isDirectory()) {
    throw new Error('工作目录不是文件夹');
  }

  return cwd;
}

function codexSpawnSpec() {
  if (process.platform !== 'win32') {
    return { command: 'codex', prefixArgs: [], label: 'codex' };
  }

  const pathDirs = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);

  for (const dir of pathDirs) {
    const codexScript = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(codexScript)) {
      const bundledNode = path.join(dir, 'node.exe');
      const nodeCommand = fs.existsSync(bundledNode) ? bundledNode : 'node';
      return {
        command: nodeCommand,
        prefixArgs: [codexScript],
        label: `${path.basename(nodeCommand)} ${codexScript}`
      };
    }
  }

  return {
    command: process.env.ComSpec || 'cmd.exe',
    prefixArgs: ['/d', '/s', '/c', 'codex.cmd'],
    label: 'codex.cmd'
  };
}

function buildCodexPrompt(userPrompt) {
  return [
    '你正在由“蓝羽桌宠”启动本地 Codex CLI 执行一个小任务。',
    '请在当前工作目录内完成任务，避免破坏性命令；如果修改文件，最后说明修改内容和验证结果。',
    '请用中文简明汇报。',
    '',
    '用户任务：',
    userPrompt
  ].join('\n');
}

function sendCodexTaskEvent(event) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('codex-task-event', event);
  }
}

function taskLogRootPath() {
  return process.env.LANYU_TASK_LOG_DIR
    || (app.isPackaged ? path.join(app.getPath('userData'), 'tasks') : path.join(projectRoot, 'tasks'));
}

function ensureTaskLogDir() {
  const taskLogRoot = taskLogRootPath();
  fs.mkdirSync(taskLogRoot, { recursive: true });
  return taskLogRoot;
}

function taskLogName(taskId, suffix) {
  return path.join(ensureTaskLogDir(), `${taskId}-${suffix}`);
}

function appendTaskLog(task, text) {
  if (!task || !task.logStream) return;
  task.logStream.write(text);
}

function finishCodexTask(taskId, event) {
  if (!activeCodexTask || activeCodexTask.id !== taskId) return;

  const task = activeCodexTask;
  appendTaskLog(task, `\n[${new Date().toISOString()}] ${event.type}\n`);
  if (event.message) appendTaskLog(task, `${event.message}\n`);
  task.logStream.end();
  activeCodexTask = null;
  sendCodexTaskEvent(event);
}

function killCodexProcessTree(task) {
  if (!task || !task.process || task.process.killed) return;

  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(task.process.pid), '/t', '/f'], { windowsHide: true });
    return;
  }

  task.process.kill('SIGTERM');
}

function clampWindowBounds(x, y, width, height) {
  const display = screen.getDisplayMatching({ x, y, width, height });
  const area = display.workArea;
  const nextX = Math.max(area.x, Math.min(x, area.x + area.width - width));
  const nextY = Math.max(area.y, Math.min(y, area.y + area.height - height));
  return { x: nextX, y: nextY };
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const startX = area.x + area.width - DEFAULT_SIZE.width - 40;
  const startY = area.y + area.height - DEFAULT_SIZE.height - 24;

  mainWindow = new BrowserWindow({
    width: DEFAULT_SIZE.width,
    height: DEFAULT_SIZE.height,
    x: startX,
    y: startY,
    title: '蓝羽桌宠',
    frame: false,
    transparent: !isDebugWindow,
    resizable: false,
    movable: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: !isSmokeTest,
    backgroundColor: isDebugWindow ? '#303040' : '#00000000',
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
      const bounds = mainWindow.getBounds();
      const area = screen.getPrimaryDisplay().workArea;
      const startX = area.x + area.width - bounds.width - 80;
      const startY = area.y + area.height - bounds.height - 60;
      mainWindow.setPosition(startX, startY, false);
      mainWindow.show();
      mainWindow.restore();
      mainWindow.focus();
      mainWindow.moveTop();
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
          mainWindow.moveTop();
        }
      }, 500);
    }
  });

  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => app.quit(), 800);
    });
    mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`Smoke test load failed: ${errorCode} ${errorDescription}`);
      app.exit(1);
    });
  }
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
    { label: '开心', click: () => sendPetCommand('happy') },
    { label: '生气', click: () => sendPetCommand('angry') },
    { label: '惊讶', click: () => sendPetCommand('surprised') },
    { type: 'separator' },
    { label: '向右跑', click: () => sendPetCommand('walk-right') },
    { label: '向左跑', click: () => sendPetCommand('walk-left') },
    { label: '向前走', click: () => sendPetCommand('walk-front') },
    { label: '向后走', click: () => sendPetCommand('walk-back') },
    { type: 'separator' },
    { label: '睡觉', click: () => sendPetCommand('sleep') },
    { label: '摔倒', click: () => sendPetCommand('fall') },
    { type: 'separator' },
    { label: '喂零食', click: () => sendPetCommand('snack') },
    { label: '给小球', click: () => sendPetCommand('ball') },
    { label: '送礼物', click: () => sendPetCommand('gift') },
    { type: 'separator' },
    { label: '变身', click: () => sendPetCommand('toggle-form') },
    { type: 'separator' },
    { label: '交给蓝羽小任务', click: () => sendPetCommand('show-task-panel') },
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

ipcMain.handle('codex-task-defaults', () => ({
  cwd: defaultCodexCwd(),
  logRoot: ensureTaskLogDir(),
  running: Boolean(activeCodexTask),
  activeTaskId: activeCodexTask ? activeCodexTask.id : null
}));

ipcMain.handle('codex-task-run', (_event, request = {}) => {
  if (activeCodexTask) {
    throw new Error('已有一个小任务正在执行');
  }

  const userPrompt = String(request.prompt || '').trim();
  if (!userPrompt) {
    throw new Error('任务内容不能为空');
  }

  const cwd = normalizeTaskCwd(request.cwd);
  const taskId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${++codexTaskSeq}`;
  const logPath = taskLogName(taskId, 'output.log');
  const lastMessagePath = taskLogName(taskId, 'last-message.txt');
  const logStream = fs.createWriteStream(logPath, { flags: 'a', encoding: 'utf8' });
  const spawnSpec = codexSpawnSpec();
  const args = [
    ...spawnSpec.prefixArgs,
    '-a',
    'never',
    'exec',
    '-C',
    cwd,
    '--sandbox',
    'workspace-write',
    '--skip-git-repo-check',
    '--color',
    'never',
    '-o',
    lastMessagePath,
    '-'
  ];

  const task = {
    id: taskId,
    cwd,
    logPath,
    lastMessagePath,
    logStream,
    process: null,
    cancelled: false
  };

  activeCodexTask = task;
  appendTaskLog(task, `[${new Date().toISOString()}] codex task started\n`);
  appendTaskLog(task, `cwd: ${cwd}\n`);
  appendTaskLog(task, `command: ${spawnSpec.label} ${args.slice(spawnSpec.prefixArgs.length).join(' ')}\n\n`);

  const child = spawn(spawnSpec.command, args, {
    cwd,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1'
    },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  task.process = child;

  child.stdout.on('data', (data) => {
    const text = data.toString('utf8');
    appendTaskLog(task, text);
    sendCodexTaskEvent({ type: 'stdout', taskId, text });
  });

  child.stderr.on('data', (data) => {
    const text = data.toString('utf8');
    appendTaskLog(task, text);
    sendCodexTaskEvent({ type: 'stderr', taskId, text });
  });

  child.stdin.on('error', (error) => {
    appendTaskLog(task, `stdin error: ${error.message}\n`);
  });

  child.on('error', (error) => {
    finishCodexTask(taskId, {
      type: 'error',
      taskId,
      message: `Codex 启动失败：${error.message}`,
      logPath,
      lastMessagePath
    });
  });

  child.on('close', (code, signal) => {
    if (task.cancelled) {
      finishCodexTask(taskId, {
        type: 'cancelled',
        taskId,
        code,
        signal,
        message: '任务已停止',
        logPath,
        lastMessagePath
      });
      return;
    }

    finishCodexTask(taskId, {
      type: code === 0 ? 'done' : 'failed',
      taskId,
      code,
      signal,
      message: code === 0 ? '任务完成' : `任务失败，退出码 ${code}`,
      logPath,
      lastMessagePath
    });
  });

  sendCodexTaskEvent({
    type: 'started',
    taskId,
    cwd,
    logPath,
    lastMessagePath
  });

  child.stdin.end(buildCodexPrompt(userPrompt), 'utf8');

  return { taskId, cwd, logPath, lastMessagePath };
});

ipcMain.handle('codex-task-cancel', () => {
  if (!activeCodexTask) {
    return { cancelled: false };
  }

  activeCodexTask.cancelled = true;
  killCodexProcessTree(activeCodexTask);
  return { cancelled: true, taskId: activeCodexTask.id };
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
    area.x + area.width - bounds.width - 40,
    area.y + area.height - bounds.height - 24,
    false
  );
});
