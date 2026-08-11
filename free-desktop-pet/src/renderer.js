const canvas = document.getElementById('petCanvas');
const context = canvas.getContext('2d');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubbleText');
const taskPanel = document.getElementById('taskPanel');
const taskPrompt = document.getElementById('taskPrompt');
const taskCwd = document.getElementById('taskCwd');
const taskStatus = document.getElementById('taskStatus');
const taskOutput = document.getElementById('taskOutput');
const taskRun = document.getElementById('taskRun');
const taskCancel = document.getElementById('taskCancel');
const taskClose = document.getElementById('taskClose');

context.imageSmoothingEnabled = false;

const DEBUG_MODE = location.search.includes('debug');

if (DEBUG_MODE) {
  document.body.classList.add('debug-window');
}

const PET_FORMS = {
  lanyu: {
    label: '蓝羽',
    defaultDirection: 'front',
    sizePresets: {
      tiny: { width: 220, height: 220, pixelScale: 1.25 },
      small: { width: 280, height: 270, pixelScale: 1.6 },
      normal: { width: 360, height: 320, pixelScale: 2 },
      large: { width: 460, height: 420, pixelScale: 2.8 }
    },
    moveProfiles: [
      { direction: 'left', vector: { x: -1, y: 0 } },
      { direction: 'right', vector: { x: 1, y: 0 } },
      { direction: 'front', vector: { x: 0, y: 0.62 } },
      { direction: 'back', vector: { x: 0, y: -0.62 } }
    ],
    commandDirections: {
      left: 'left',
      right: 'right',
      front: 'front',
      back: 'back'
    }
  },
  cat: {
    label: '猫咪',
    defaultDirection: 'right',
    sizePresets: {
      tiny: { width: 200, height: 190, pixelScale: 3.6 },
      small: { width: 240, height: 220, pixelScale: 4.3 },
      normal: { width: 300, height: 260, pixelScale: 5.2 },
      large: { width: 380, height: 320, pixelScale: 7 }
    },
    moveProfiles: [
      { direction: 'left', vector: { x: -1, y: 0 } },
      { direction: 'right', vector: { x: 1, y: 0 } }
    ],
    commandDirections: {
      left: 'left',
      right: 'right',
      front: 'right',
      back: 'left'
    }
  }
};

const FORM_ORDER = ['lanyu', 'cat'];
const DEFAULT_FORM = 'lanyu';
const DEFAULT_SIZE_NAME = 'tiny';
const TASK_PANEL_SIZE = { width: 440, height: 620 };
const TASK_PANEL_PET_SCALE = 0.74;
const TASK_OUTPUT_LIMIT = 32000;

const CLICK_ACTIONS = [
  { state: 'happy', effect: 'heart', message: '今天也要开心。' },
  { state: 'surprised', effect: 'exclaim', message: '诶？' },
  { state: 'angry', effect: 'exclaim', message: '不要一直戳我。' }
];

const BOUNDARY_TURN = {
  left: { direction: 'right', vector: { x: 1, y: 0 } },
  right: { direction: 'left', vector: { x: -1, y: 0 } },
  top: { direction: 'front', vector: { x: 0, y: 0.62 } },
  bottom: { direction: 'back', vector: { x: 0, y: -0.62 } }
};

const PERSPECTIVE = {
  front: { scale: 1.08, yOffset: 6 },
  back: { scale: 0.92, yOffset: -10 },
  left: { scale: 1, yOffset: 0 },
  right: { scale: 1, yOffset: 0 }
};

const SLEEP_ROAMING_CHANCE = 0.05;
const IDLE_ROAMING_THRESHOLD = 0.30;
const WALK_ROAMING_THRESHOLD = 0.53;
const RUN_ROAMING_THRESHOLD = 0.95;
const BOUNDARY_MARGIN = 16;
const BOUNDARY_PROBE_INTERVAL = 180;

let manifest;
let images = {};
let currentForm = DEFAULT_FORM;
let currentState = 'idle';
let currentDirection = PET_FORMS[DEFAULT_FORM].defaultDirection;
let stateUntil = 0;
let currentEffect = null;
let effectStartedAt = 0;
let currentProp = null;
let propUntil = 0;
let bubbleUntil = 0;
let pixelScale = PET_FORMS[DEFAULT_FORM].sizePresets[DEFAULT_SIZE_NAME].pixelScale;
let behaviorDeadline = 0;
let moveVector = { x: 0, y: 0 };
let moveRemainder = { x: 0, y: 0 };
let moveSpeed = 0;
let lastBoundaryTurnAt = 0;
let lastBoundaryProbeAt = 0;
let boundaryProbePending = false;
let lastTime = performance.now();
let clickIndex = 0;
let selectedSizeName = DEFAULT_SIZE_NAME;
let taskPanelOpen = false;
let panelReturnSizeName = DEFAULT_SIZE_NAME;
let taskDefaultsLoaded = false;
let taskRunning = false;
let taskOutputBuffer = '';

let pointerDown = false;
let dragging = false;
let pointerStart = { x: 0, y: 0 };

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  context.imageSmoothingEnabled = false;
}

function drawDebugPanel(lines) {
  if (!DEBUG_MODE) return;
  context.save();
  context.imageSmoothingEnabled = false;
  context.fillStyle = 'rgba(255, 84, 98, 0.95)';
  context.fillRect(10, 10, Math.min(canvas.width - 20, 330), 26 + lines.length * 18);
  context.fillStyle = '#ffffff';
  context.font = '13px sans-serif';
  lines.forEach((line, index) => {
    context.fillText(line, 20, 31 + index * 18);
  });
  context.restore();
}

function currentFormConfig() {
  return PET_FORMS[currentForm] || PET_FORMS[DEFAULT_FORM];
}

function currentSizePresets() {
  return currentFormConfig().sizePresets;
}

function directionForIdle() {
  const config = currentFormConfig();
  if (currentForm === 'cat') {
    return currentDirection === 'left' ? 'left' : 'right';
  }
  return config.defaultDirection;
}

function directionForCommand(direction) {
  const config = currentFormConfig();
  return config.commandDirections[direction] || config.defaultDirection;
}

function moveProfileForDirection(direction) {
  const config = currentFormConfig();
  return config.moveProfiles.find((profile) => profile.direction === direction) || config.moveProfiles[0];
}

function manifestAssetPaths(nextManifest) {
  const paths = new Set();
  Object.values(nextManifest.states).forEach((spec) => paths.add(spec.sheet));
  Object.values(nextManifest.effects).forEach((spec) => paths.add(spec.sheet));
  Object.values(nextManifest.props).forEach((path) => paths.add(path));
  Object.values(nextManifest.ui).forEach((path) => paths.add(path));
  return paths;
}

function setBubble(message, kind = 'speech', durationMs = 2200) {
  if (!message) {
    bubble.hidden = true;
    bubbleUntil = 0;
    return;
  }

  const uiPath = manifest.ui[kind] || manifest.ui.speech;
  bubble.style.backgroundImage = `url("${window.petAPI.assetUrl(uiPath)}")`;
  bubbleText.textContent = message;
  bubble.hidden = false;
  bubbleUntil = performance.now() + durationMs;
}

function setTemporaryState(state, durationMs, options = {}) {
  currentState = state;
  currentDirection = options.direction || currentDirection || currentFormConfig().defaultDirection;
  stateUntil = performance.now() + durationMs;
  moveSpeed = options.speed || 0;
  moveVector = options.moveVector || { x: 0, y: 0 };

  if (options.effect) {
    currentEffect = options.effect;
    effectStartedAt = performance.now();
  }

  if (options.prop) {
    currentProp = options.prop;
    propUntil = performance.now() + Math.max(durationMs, 1800);
  }

  if (options.message) {
    setBubble(options.message, options.bubbleKind || 'speech', options.messageDuration || durationMs);
  }
}

function setIdle() {
  currentState = 'idle';
  currentDirection = directionForIdle();
  stateUntil = 0;
  moveSpeed = 0;
  moveVector = { x: 0, y: 0 };
  moveRemainder = { x: 0, y: 0 };
}

function setMoveState(state, profile, speed) {
  currentState = state;
  currentDirection = profile.direction;
  moveVector = profile.vector;
  moveSpeed = speed;
}

function randomMoveProfile() {
  const profiles = currentFormConfig().moveProfiles;
  return profiles[Math.floor(Math.random() * profiles.length)];
}

function turnFromBoundary(payload = {}) {
  const now = performance.now();
  if (!['walk', 'run'].includes(currentState) || now - lastBoundaryTurnAt < 450) {
    return;
  }

  const edges = Array.isArray(payload.edges) ? payload.edges : [];
  const preferredEdge = edges.find((edge) => {
    if (edge === 'left' || edge === 'right') return Math.abs(moveVector.x) >= Math.abs(moveVector.y);
    if (edge === 'top' || edge === 'bottom') return Math.abs(moveVector.y) >= Math.abs(moveVector.x);
    return false;
  }) || edges[0];

  const nextProfile = BOUNDARY_TURN[preferredEdge];
  if (!nextProfile) return;

  currentDirection = nextProfile.direction;
  moveVector = nextProfile.vector;
  moveRemainder = { x: 0, y: 0 };
  lastBoundaryTurnAt = now;
  behaviorDeadline = Math.max(behaviorDeadline, now + 900);
}

async function probeBoundaryTurn(now) {
  if (boundaryProbePending || now - lastBoundaryProbeAt < BOUNDARY_PROBE_INTERVAL) {
    return;
  }

  if (!['walk', 'run'].includes(currentState) || !moveSpeed) {
    return;
  }

  lastBoundaryProbeAt = now;
  boundaryProbePending = true;

  try {
    const state = await window.petAPI.getWindowState();
    if (!state) return;

    const { bounds, workArea } = state;
    const edges = [];
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const workRight = workArea.x + workArea.width;
    const workBottom = workArea.y + workArea.height;

    if (moveVector.x < 0 && bounds.x <= workArea.x + BOUNDARY_MARGIN) {
      edges.push('left');
    }
    if (moveVector.x > 0 && right >= workRight - BOUNDARY_MARGIN) {
      edges.push('right');
    }
    if (moveVector.y < 0 && bounds.y <= workArea.y + BOUNDARY_MARGIN) {
      edges.push('top');
    }
    if (moveVector.y > 0 && bottom >= workBottom - BOUNDARY_MARGIN) {
      edges.push('bottom');
    }

    if (edges.length) {
      turnFromBoundary({ edges });
    }
  } finally {
    boundaryProbePending = false;
  }
}

function moveWindowBy(dx, dy) {
  moveRemainder.x += dx;
  moveRemainder.y += dy;

  const sendX = moveRemainder.x > 0 ? Math.floor(moveRemainder.x) : Math.ceil(moveRemainder.x);
  const sendY = moveRemainder.y > 0 ? Math.floor(moveRemainder.y) : Math.ceil(moveRemainder.y);

  if (sendX || sendY) {
    moveRemainder.x -= sendX;
    moveRemainder.y -= sendY;
    window.petAPI.moveBy({ dx: sendX, dy: sendY });
  }
}

function chooseRoamingBehavior(now) {
  const roll = Math.random();

  if (roll >= 1 - SLEEP_ROAMING_CHANCE) {
    setTemporaryState('sleep', 5200, {
      prop: 'pillow',
      message: 'Zzz...',
      bubbleKind: 'thought',
      messageDuration: 2200
    });
    behaviorDeadline = now + 6200;
    return;
  }

  if (roll < IDLE_ROAMING_THRESHOLD) {
    setIdle();
    behaviorDeadline = now + 1800 + Math.random() * 2600;
    return;
  }

  if (roll < WALK_ROAMING_THRESHOLD) {
    setMoveState('walk', randomMoveProfile(), 0.95);
    behaviorDeadline = now + 2200 + Math.random() * 2800;
    return;
  }

  if (roll < RUN_ROAMING_THRESHOLD) {
    setMoveState('run', randomMoveProfile(), 1.8);
    behaviorDeadline = now + 1200 + Math.random() * 1600;
    return;
  }
}

function frameSpecForState(stateName) {
  return manifest.states[stateName] || manifest.states.idle;
}

function imageForPath(relativePath) {
  return images[relativePath];
}

function frameColumn(spec, now) {
  const fps = spec.fps || 8;
  return Math.floor((now / 1000) * fps) % spec.columns;
}

function frameRow(spec) {
  if (!spec.directions) return 0;
  return spec.directions[currentDirection] ?? spec.directions.front ?? 0;
}

function renderPixelScale() {
  return taskPanelOpen ? currentSizePresets().tiny.pixelScale * TASK_PANEL_PET_SCALE : pixelScale;
}

function drawFrame(spec, now) {
  const image = imageForPath(spec.sheet);
  if (!image) {
    drawDebugPanel([`missing image`, spec.sheet]);
    return;
  }

  const column = frameColumn(spec, now);
  const row = frameRow(spec);
  const sx = column * spec.frameWidth;
  const sy = row * spec.frameHeight;
  const perspective = PERSPECTIVE[currentDirection] || PERSPECTIVE.front;
  const scale = renderPixelScale();
  const bottomInset = taskPanelOpen ? 42 : 18;
  const drawWidth = Math.round(spec.frameWidth * scale * perspective.scale);
  const drawHeight = Math.round(spec.frameHeight * scale * perspective.scale);
  const x = Math.round((canvas.width - drawWidth) / 2);
  const y = Math.round(canvas.height - drawHeight - bottomInset + perspective.yOffset * scale);
  const shouldMirror = Boolean(spec.mirrorDirections && spec.mirrorDirections[currentDirection]);

  context.save();
  if (shouldMirror) {
    context.translate(x + drawWidth, y);
    context.scale(-1, 1);
    context.drawImage(
      image,
      sx,
      sy,
      spec.frameWidth,
      spec.frameHeight,
      0,
      0,
      drawWidth,
      drawHeight
    );
  } else {
    context.drawImage(
      image,
      sx,
      sy,
      spec.frameWidth,
      spec.frameHeight,
      x,
      y,
      drawWidth,
      drawHeight
    );
  }
  context.restore();
}

function drawProp(now) {
  if (!currentProp || now > propUntil) {
    currentProp = null;
    return;
  }

  const propPath = manifest.props[currentProp];
  const image = propPath ? imageForPath(propPath) : null;
  if (!image) return;

  const scale = renderPixelScale();
  const baseWidth = manifest.baseFrame?.width || 64;
  const size = Math.round(baseWidth * scale * 0.62);
  const x = Math.round(canvas.width / 2 - size / 2 + (taskPanelOpen ? 32 : 46));
  const y = Math.round(canvas.height - size - (taskPanelOpen ? 12 : 18));
  context.drawImage(image, x, y, size, size);
}

function drawEffect(now) {
  if (!currentEffect) return;

  const spec = manifest.effects[currentEffect];
  if (!spec) {
    currentEffect = null;
    return;
  }

  const image = imageForPath(spec.sheet);
  if (!image) return;

  const elapsed = now - effectStartedAt;
  const frame = Math.floor((elapsed / 1000) * spec.fps);
  if (frame >= spec.columns) {
    currentEffect = null;
    return;
  }

  const scale = renderPixelScale();
  const baseWidth = manifest.baseFrame?.width || spec.frameWidth;
  const baseHeight = manifest.baseFrame?.height || spec.frameHeight;
  const petHeight = Math.round(baseHeight * scale);
  const bottomInset = taskPanelOpen ? 42 : 18;
  const size = Math.round(baseWidth * scale * 0.58);
  const x = Math.round(canvas.width / 2 + 4 * scale);
  const y = Math.round(canvas.height - bottomInset - petHeight - size * 0.45);
  context.drawImage(
    image,
    frame * spec.frameWidth,
    0,
    spec.frameWidth,
    spec.frameHeight,
    x,
    y,
    size,
    size
  );
}

function updateBehavior(now, deltaMs) {
  if (stateUntil && now > stateUntil) {
    setIdle();
    behaviorDeadline = now + 900;
  }

  if (bubbleUntil && now > bubbleUntil) {
    bubble.hidden = true;
    bubbleUntil = 0;
  }

  if (!stateUntil && now > behaviorDeadline) {
    chooseRoamingBehavior(now);
  }

  if ((currentState === 'walk' || currentState === 'run') && moveSpeed) {
    probeBoundaryTurn(now);
    const factor = moveSpeed * (deltaMs / 16.67);
    moveWindowBy(moveVector.x * factor, moveVector.y * factor);
  }
}

function render(now) {
  const deltaMs = now - lastTime;
  lastTime = now;
  updateBehavior(now, deltaMs);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;

  drawProp(now);
  drawFrame(frameSpecForState(currentState), now);
  drawEffect(now);

  requestAnimationFrame(render);
}

function handleClick() {
  const action = CLICK_ACTIONS[clickIndex % CLICK_ACTIONS.length];
  clickIndex += 1;
  setTemporaryState(action.state, 1800, {
    effect: action.effect,
    message: action.message,
    messageDuration: 1600
  });
  behaviorDeadline = performance.now() + 2200;
}

function resizeWindowTo(size) {
  window.petAPI.resize(size);
  setTimeout(resizeCanvas, 80);
}

function setTaskStatus(message) {
  taskStatus.textContent = message;
}

function setTaskControls(running) {
  taskRunning = running;
  taskRun.disabled = running;
  taskCancel.disabled = !running;
  taskPrompt.disabled = running;
  taskCwd.disabled = running;
}

function clearTaskOutput() {
  taskOutputBuffer = '';
  taskOutput.textContent = '';
}

function appendTaskOutput(text) {
  if (!text) return;

  taskOutputBuffer += text;
  if (taskOutputBuffer.length > TASK_OUTPUT_LIMIT) {
    taskOutputBuffer = `...省略较早输出...\n${taskOutputBuffer.slice(-TASK_OUTPUT_LIMIT)}`;
  }

  taskOutput.textContent = taskOutputBuffer;
  taskOutput.scrollTop = taskOutput.scrollHeight;
}

async function loadTaskDefaults(force = false) {
  if (taskDefaultsLoaded && !force) return;

  try {
    const defaults = await window.petAPI.getCodexTaskDefaults();
    if (!taskCwd.value) {
      taskCwd.value = defaults.cwd || '';
    }
    if (defaults.running) {
      setTaskStatus('已有任务运行中');
      setTaskControls(true);
    }
    taskDefaultsLoaded = true;
  } catch (error) {
    setTaskStatus(`读取 Codex 配置失败：${error.message}`);
  }
}

function openTaskPanel() {
  if (taskPanelOpen) {
    taskPanel.hidden = false;
    taskPrompt.focus();
    return;
  }

  panelReturnSizeName = selectedSizeName;
  taskPanelOpen = true;
  taskPanel.hidden = false;
  document.body.classList.add('task-panel-open');
  resizeWindowTo(TASK_PANEL_SIZE);
  loadTaskDefaults();
  setTemporaryState('surprised', 1200, {
    effect: 'exclaim',
    message: '有什么任务？',
    messageDuration: 1200
  });
  setTimeout(() => taskPrompt.focus(), 120);
}

function closeTaskPanel() {
  if (!taskPanelOpen) return;

  taskPanel.hidden = true;
  taskPanelOpen = false;
  document.body.classList.remove('task-panel-open');
  setSize(panelReturnSizeName || selectedSizeName);

  if (taskRunning) {
    setBubble('我继续处理。', 'speech', 1300);
  }
}

async function runCodexTask() {
  const prompt = taskPrompt.value.trim();
  if (!prompt) {
    setTaskStatus('任务内容不能为空');
    setTemporaryState('surprised', 1200, { effect: 'exclaim', message: '写点任务吧。', messageDuration: 1000 });
    return;
  }

  setTaskControls(true);
  setTaskStatus('启动 Codex...');
  clearTaskOutput();
  appendTaskOutput(`> 工作目录：${taskCwd.value || '(默认)'}\n\n`);
  setTemporaryState('run', 1800, {
    direction: 'right',
    speed: 1.8,
    moveVector: { x: 1, y: 0 },
    message: '我去处理。',
    messageDuration: 1200
  });

  try {
    const result = await window.petAPI.runCodexTask({
      prompt,
      cwd: taskCwd.value
    });
    setTaskStatus('Codex 运行中');
    appendTaskOutput(`日志：${result.logPath}\n\n`);
  } catch (error) {
    setTaskControls(false);
    setTaskStatus('启动失败');
    appendTaskOutput(`启动失败：${error.message}\n`);
    setTemporaryState('angry', 1800, {
      effect: 'exclaim',
      message: '启动失败。',
      bubbleKind: 'angry',
      messageDuration: 1200
    });
  }
}

async function cancelCodexTask() {
  if (!taskRunning) return;

  taskCancel.disabled = true;
  setTaskStatus('停止中...');
  setBubble('我先停下来。', 'speech', 1200);

  try {
    await window.petAPI.cancelCodexTask();
  } catch (error) {
    setTaskStatus('停止失败');
    appendTaskOutput(`停止失败：${error.message}\n`);
    setTaskControls(false);
  }
}

function handleCodexTaskEvent(event = {}) {
  switch (event.type) {
    case 'started':
      setTaskControls(true);
      setTaskStatus('Codex 运行中');
      appendTaskOutput(`任务编号：${event.taskId}\n`);
      appendTaskOutput(`工作目录：${event.cwd}\n\n`);
      break;
    case 'stdout':
    case 'stderr':
      appendTaskOutput(event.text);
      break;
    case 'done':
      setTaskControls(false);
      setTaskStatus('任务完成');
      appendTaskOutput(`\n${event.message}\n`);
      appendTaskOutput(`结果：${event.lastMessagePath}\n`);
      setTemporaryState('happy', 2200, { effect: 'heart', message: '任务完成。', messageDuration: 1600 });
      break;
    case 'failed':
      setTaskControls(false);
      setTaskStatus('任务失败');
      appendTaskOutput(`\n${event.message}\n`);
      appendTaskOutput(`日志：${event.logPath}\n`);
      setTemporaryState('angry', 2200, {
        effect: 'exclaim',
        message: '任务失败了。',
        bubbleKind: 'angry',
        messageDuration: 1600
      });
      break;
    case 'error':
      setTaskControls(false);
      setTaskStatus('Codex 错误');
      appendTaskOutput(`\n${event.message}\n`);
      setTemporaryState('angry', 2200, {
        effect: 'exclaim',
        message: '出错了。',
        bubbleKind: 'angry',
        messageDuration: 1600
      });
      break;
    case 'cancelled':
      setTaskControls(false);
      setTaskStatus('任务已停止');
      appendTaskOutput(`\n${event.message}\n`);
      setTemporaryState('surprised', 1600, { effect: 'exclaim', message: '已停止。', messageDuration: 1200 });
      break;
    default:
      break;
  }
}

function setDirectedWalk(commandDirection, message) {
  const direction = directionForCommand(commandDirection);
  const profile = moveProfileForDirection(direction);
  setTemporaryState('walk', 2600, {
    direction: profile.direction,
    speed: currentForm === 'cat' ? 1.1 : 0.95,
    moveVector: profile.vector,
    message,
    messageDuration: 1400
  });
}

function applyCommand(command, payload = {}) {
  switch (command) {
    case 'happy':
      setTemporaryState('happy', 2400, { effect: 'heart', message: '收到。', messageDuration: 1800 });
      break;
    case 'angry':
      setTemporaryState('angry', 2400, { effect: 'exclaim', message: '哼。', bubbleKind: 'angry', messageDuration: 1600 });
      break;
    case 'surprised':
      setTemporaryState('surprised', 2200, { effect: 'exclaim', message: '发生什么了？', messageDuration: 1700 });
      break;
    case 'boundary-hit':
      turnFromBoundary(payload);
      break;
    case 'walk-left':
      setDirectedWalk('left', '我往左边看看。');
      break;
    case 'walk-right':
      setDirectedWalk('right', '我往右边看看。');
      break;
    case 'walk-front':
      setDirectedWalk('front', currentForm === 'cat' ? '我往右边跑。' : '我过来了。');
      break;
    case 'walk-back':
      setDirectedWalk('back', currentForm === 'cat' ? '我往左边跑。' : '我去那边看看。');
      break;
    case 'sleep':
      setTemporaryState('sleep', 7000, { prop: 'pillow', message: 'Zzz...', bubbleKind: 'thought', messageDuration: 2600 });
      break;
    case 'fall':
      setTemporaryState('fall', 2600, { effect: 'star', message: '摔倒了...', messageDuration: 1800 });
      break;
    case 'snack':
      setTemporaryState('happy', 2600, { prop: 'snack', effect: 'heart', message: '好吃。', messageDuration: 1800 });
      break;
    case 'ball':
      const profile = randomMoveProfile();
      setTemporaryState('run', 3000, {
        direction: profile.direction,
        speed: 2.2,
        moveVector: profile.vector,
        prop: 'ball',
        effect: 'star',
        message: '追小球！',
        messageDuration: 1600
      });
      break;
    case 'gift':
      setTemporaryState('surprised', 1200, { prop: 'gift', effect: 'exclaim', message: '礼物？', messageDuration: 1200 });
      setTimeout(() => setTemporaryState('happy', 2200, { prop: 'gift', effect: 'heart', message: '谢谢。', messageDuration: 1800 }), 1150);
      break;
    case 'morph':
      morphToForm(payload.form || DEFAULT_FORM);
      break;
    case 'toggle-form':
      toggleForm();
      break;
    case 'show-task-panel':
      openTaskPanel();
      break;
    case 'size':
      setSize(payload.size || DEFAULT_SIZE_NAME);
      break;
    case 'home':
      window.petAPI.home();
      break;
    default:
      setIdle();
      break;
  }

  behaviorDeadline = performance.now() + 2600;
}

function setSize(sizeName) {
  selectedSizeName = currentSizePresets()[sizeName] ? sizeName : DEFAULT_SIZE_NAME;
  const preset = currentSizePresets()[selectedSizeName];
  pixelScale = preset.pixelScale;

  if (taskPanelOpen) {
    return;
  }

  window.petAPI.resize({ width: preset.width, height: preset.height });
  setTimeout(resizeCanvas, 80);
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  pointerDown = true;
  dragging = false;
  pointerStart = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!pointerDown) return;

  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  if (!dragging && distance > 5) {
    dragging = true;
    canvas.classList.add('dragging');
    window.petAPI.dragStart(pointerStart);
    setTemporaryState('dragged', 60 * 60 * 1000, { message: '轻一点...', messageDuration: 1200 });
  }

  if (dragging) {
    window.petAPI.dragMove();
  }
}

function onPointerUp(event) {
  if (!pointerDown) return;
  pointerDown = false;
  canvas.releasePointerCapture(event.pointerId);

  if (dragging) {
    dragging = false;
    canvas.classList.remove('dragging');
    window.petAPI.dragEnd();
    setTemporaryState('surprised', 1200, { effect: 'exclaim', message: '放下来了。', messageDuration: 1000 });
    behaviorDeadline = performance.now() + 1800;
    return;
  }

  handleClick();
}

function onContextMenu(event) {
  event.preventDefault();
  window.petAPI.openMenu();
}

function loadImage(relativePath) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([relativePath, image]);
    image.onerror = () => reject(new Error(`Failed to load image: ${relativePath}`));
    image.src = window.petAPI.assetUrl(relativePath);
  });
}

async function loadPetForm(formName, options = {}) {
  const nextForm = PET_FORMS[formName] ? formName : DEFAULT_FORM;
  const nextManifest = window.petAPI.loadManifest(nextForm);
  const loaded = await Promise.all(Array.from(manifestAssetPaths(nextManifest)).map(loadImage));

  currentForm = nextForm;
  manifest = nextManifest;
  images = Object.fromEntries(loaded);
  currentDirection = currentFormConfig().defaultDirection;
  currentState = manifest.states[currentState] ? currentState : 'idle';
  currentEffect = null;
  currentProp = null;
  moveVector = { x: 0, y: 0 };
  moveRemainder = { x: 0, y: 0 };
  moveSpeed = 0;

  const preset = currentSizePresets()[selectedSizeName] || currentSizePresets()[DEFAULT_SIZE_NAME];
  pixelScale = preset.pixelScale;

  if (!taskPanelOpen && options.resize !== false) {
    resizeWindowTo({ width: preset.width, height: preset.height });
  }

  if (options.announce !== false) {
    setTemporaryState('surprised', 1200, {
      effect: 'exclaim',
      message: `变成${currentFormConfig().label}了。`,
      messageDuration: 1400
    });
  }

  behaviorDeadline = performance.now() + 1800;
  console.log(`pet form loaded: ${currentForm}, assets: ${Object.keys(images).length}`);
}

async function morphToForm(formName) {
  if (formName === currentForm) {
    setBubble(`现在就是${currentFormConfig().label}。`, 'speech', 1200);
    return;
  }

  try {
    await loadPetForm(formName);
  } catch (error) {
    console.error(error);
    setBubble(`变身失败：${error.message}`, 'angry', 2200);
  }
}

function toggleForm() {
  const currentIndex = FORM_ORDER.indexOf(currentForm);
  const nextForm = FORM_ORDER[(currentIndex + 1) % FORM_ORDER.length] || DEFAULT_FORM;
  morphToForm(nextForm);
}

async function start() {
  console.log('pet renderer start');
  await loadPetForm(DEFAULT_FORM, { resize: false, announce: false });

  resizeCanvas();
  setBubble('右键有菜单。', 'speech', 2200);
  loadTaskDefaults();
  behaviorDeadline = performance.now() + 1800;
  requestAnimationFrame(render);
}

window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('contextmenu', onContextMenu);
taskRun.addEventListener('click', runCodexTask);
taskCancel.addEventListener('click', cancelCodexTask);
taskClose.addEventListener('click', closeTaskPanel);
taskPrompt.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    runCodexTask();
  }
});
window.petAPI.onCommand(applyCommand);
window.petAPI.onCodexTaskEvent(handleCodexTaskEvent);

start().catch((error) => {
  console.error(error);
  resizeCanvas();
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawDebugPanel(['renderer error', error.message]);
  bubbleText.textContent = error.message;
  bubble.hidden = false;
});
