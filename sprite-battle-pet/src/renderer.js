const canvas = document.getElementById('petCanvas');
const context = canvas.getContext('2d');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubbleText');
const hpFill = document.getElementById('hpFill');
const taskPanel = document.getElementById('taskPanel');
const taskPrompt = document.getElementById('taskPrompt');
const taskCwd = document.getElementById('taskCwd');
const taskStatus = document.getElementById('taskStatus');
const taskOutput = document.getElementById('taskOutput');
const taskRun = document.getElementById('taskRun');
const taskCancel = document.getElementById('taskCancel');
const taskClose = document.getElementById('taskClose');

context.imageSmoothingEnabled = true;

const DEBUG_MODE = location.search.includes('debug');

if (DEBUG_MODE) {
  document.body.classList.add('debug-window');
}

const PET_FORMS = {
  lingren: {
    label: '灵刃',
    defaultDirection: 'right',
    pixelated: false,
    sizePresets: {
      tiny: { width: 230, height: 210, petHeight: 132 },
      small: { width: 320, height: 280, petHeight: 190 },
      normal: { width: 390, height: 330, petHeight: 225 },
      large: { width: 480, height: 400, petHeight: 280 }
    }
  },
  cat: {
    label: '小猫',
    defaultDirection: 'right',
    pixelated: true,
    sizePresets: {
      tiny: { width: 170, height: 150, petHeight: 70 },
      small: { width: 220, height: 190, petHeight: 92 },
      normal: { width: 270, height: 230, petHeight: 118 },
      large: { width: 330, height: 280, petHeight: 150 }
    }
  }
};

const FORM_ORDER = ['lingren', 'cat'];
const DEFAULT_FORM = 'lingren';
const DEFAULT_SIZE_NAME = 'small';
const MAX_HP = 5;
const BOUNDARY_MARGIN = 18;
const BOUNDARY_PROBE_INTERVAL = 180;
const BOTTOM_INSET = 34;
const TASK_OUTPUT_LIMIT = 12000;
const TASK_PANEL_PET_SCALE = 0.68;
const TASK_PANEL_SIZE = { width: 420, height: 560 };

let manifest;
let images = {};
let currentForm = DEFAULT_FORM;
let currentState = 'idle';
let currentDirection = PET_FORMS[DEFAULT_FORM].defaultDirection;
let stateStartedAt = performance.now();
let stateDurationMs = 0;
let stateUntil = 0;
let behaviorDeadline = 0;
let moveVector = { x: 0, y: 0 };
let moveRemainder = { x: 0, y: 0 };
let moveSpeed = 0;
let hp = MAX_HP;
let isDown = false;
let selectedSizeName = DEFAULT_SIZE_NAME;
let currentSize = PET_FORMS[DEFAULT_FORM].sizePresets[DEFAULT_SIZE_NAME];
let bubbleUntil = 0;
let lastTime = performance.now();
let lastBoundaryTurnAt = 0;
let lastBoundaryProbeAt = 0;
let boundaryProbePending = false;
let clickChain = 0;
let lastClickAt = 0;
let taskPanelOpen = false;
let taskDefaultsLoaded = false;
let taskRunning = false;
let taskOutputBuffer = '';

let pointerDown = false;
let dragging = false;
let pointerStart = { x: 0, y: 0 };

function currentFormConfig() {
  return PET_FORMS[currentForm] || PET_FORMS[DEFAULT_FORM];
}

function currentSizePresets() {
  return currentFormConfig().sizePresets;
}

function currentPetHeight() {
  const baseHeight = currentSize.petHeight;
  return taskPanelOpen ? Math.round(baseHeight * TASK_PANEL_PET_SCALE) : baseHeight;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  context.imageSmoothingEnabled = !currentFormConfig().pixelated;
  canvas.style.imageRendering = currentFormConfig().pixelated ? 'pixelated' : 'auto';
}

function manifestAssetPaths(nextManifest) {
  return new Set(Object.values(nextManifest.states).map((spec) => spec.sheet));
}

function setBubble(message, durationMs = 1800) {
  if (!message) {
    bubble.hidden = true;
    bubbleUntil = 0;
    return;
  }

  bubbleText.textContent = message;
  bubble.hidden = false;
  bubbleUntil = performance.now() + durationMs;
}

function hideBubble() {
  bubble.hidden = true;
  bubbleUntil = 0;
}

function updateHp() {
  hpFill.style.width = `${Math.max(0, Math.min(1, hp / MAX_HP)) * 100}%`;
}

function stateSpec(stateName) {
  return manifest.states[stateName] || manifest.states.idle;
}

function imageForState(stateName) {
  return images[stateSpec(stateName).sheet];
}

function frameIndex(spec, now) {
  if (!spec.loop && !stateDurationMs) {
    return spec.columns - 1;
  }

  const elapsed = now - stateStartedAt;
  const frame = Math.floor((elapsed / 1000) * spec.fps);
  if (spec.loop) {
    return frame % spec.columns;
  }
  return Math.min(frame, spec.columns - 1);
}

function setState(stateName, durationMs = 0, options = {}) {
  currentState = manifest.states[stateName] ? stateName : 'idle';
  currentDirection = options.direction || currentDirection || currentFormConfig().defaultDirection;
  stateStartedAt = performance.now();
  stateDurationMs = durationMs || 0;
  stateUntil = durationMs ? stateStartedAt + durationMs : 0;
  moveSpeed = options.speed || 0;
  moveVector = options.moveVector || { x: 0, y: 0 };

  if (options.suppressBubble) {
    hideBubble();
  } else if (options.message) {
    setBubble(options.message, options.messageDuration || 1500);
  }
}

function setIdle(delayMs = 1400) {
  if (isDown) return;

  if (currentState !== 'idle') {
    setState('idle');
  } else {
    stateUntil = 0;
    moveSpeed = 0;
    moveVector = { x: 0, y: 0 };
    moveRemainder = { x: 0, y: 0 };
  }

  behaviorDeadline = performance.now() + delayMs;
}

function setRun(direction, durationMs = 2400) {
  const x = direction === 'left' ? -1 : 1;
  const speed = currentForm === 'cat' ? 1.65 : 2.35;
  setState('run', durationMs, {
    direction,
    speed,
    moveVector: { x, y: 0 }
  });
  behaviorDeadline = performance.now() + durationMs + 700;
}

function doAttack() {
  if (isDown) {
    revive();
    return;
  }
  setState('attack', currentForm === 'cat' ? 620 : 760, {
    message: currentForm === 'cat' ? '喵！' : '出招。',
    messageDuration: 900
  });
  behaviorDeadline = performance.now() + 1300;
}

function doJump() {
  if (isDown) {
    revive();
    return;
  }
  setState('jump', currentForm === 'cat' ? 720 : 940, {
    message: currentForm === 'cat' ? '跳一下。' : '跳一下。',
    messageDuration: 950,
    suppressBubble: true
  });
  behaviorDeadline = performance.now() + 1500;
}

function doHit() {
  if (isDown) return;
  hp -= 1;
  updateHp();
  setState('hit', currentForm === 'cat' ? 820 : 980, {
    message: hp > 0 ? '疼。' : '撑不住了...',
    messageDuration: 1100
  });

  if (hp <= 0) {
    setTimeout(() => {
      if (hp <= 0) {
        doDeath();
      }
    }, currentForm === 'cat' ? 760 : 920);
  }
}

function doAutoHit() {
  if (isDown) return;
  setState('hit', currentForm === 'cat' ? 760 : 900, {
    message: currentForm === 'cat' ? '喵呜。' : '哎呀。',
    messageDuration: 850
  });
  behaviorDeadline = performance.now() + 1800;
}

function doDeath() {
  hp = 0;
  isDown = true;
  updateHp();
  setState('death', 0, {
    message: '倒下了。再点我复活。',
    messageDuration: 2300
  });
  moveRemainder = { x: 0, y: 0 };
}

function doAutoFall() {
  if (isDown) return;
  hp = Math.max(1, hp);
  isDown = true;
  setState('death', 0, {
    message: currentForm === 'cat' ? '打个滚。' : '假摔一下。',
    messageDuration: 1200
  });
  moveRemainder = { x: 0, y: 0 };
  setTimeout(() => {
    if (isDown && currentState === 'death' && hp > 0) {
      revive();
    }
  }, 1600);
}

function revive() {
  hp = MAX_HP;
  isDown = false;
  updateHp();
  setState('jump', currentForm === 'cat' ? 720 : 920, {
    message: '复活。',
    messageDuration: 1100,
    suppressBubble: true
  });
  behaviorDeadline = performance.now() + 1600;
}

function chooseBehavior() {
  if (isDown || taskPanelOpen) return;
  const roll = Math.random();

  if (roll < 0.28) {
    setIdle(1200 + Math.random() * 1800);
    return;
  }

  if (roll < 0.56) {
    setRun(Math.random() < 0.5 ? 'left' : 'right', 1300 + Math.random() * 1700);
    return;
  }

  if (roll < 0.72) {
    doJump();
    return;
  }

  if (roll < 0.9) {
    doAttack();
    return;
  }

  if (roll < 0.97) {
    doAutoHit();
    return;
  }

  doAutoFall();
}

function turnFromBoundary(payload = {}) {
  const now = performance.now();
  if (currentState !== 'run' || now - lastBoundaryTurnAt < 420) {
    return;
  }

  const edges = Array.isArray(payload.edges) ? payload.edges : [];
  if (edges.includes('left')) {
    setRun('right', 1500);
  } else if (edges.includes('right')) {
    setRun('left', 1500);
  }

  lastBoundaryTurnAt = now;
}

async function probeBoundaryTurn(now) {
  if (boundaryProbePending || now - lastBoundaryProbeAt < BOUNDARY_PROBE_INTERVAL) {
    return;
  }

  if (currentState !== 'run' || !moveSpeed) {
    return;
  }

  lastBoundaryProbeAt = now;
  boundaryProbePending = true;

  try {
    const state = await window.battlePetAPI.getWindowState();
    if (!state) return;

    const { bounds, workArea } = state;
    const right = bounds.x + bounds.width;
    const workRight = workArea.x + workArea.width;
    const edges = [];

    if (moveVector.x < 0 && bounds.x <= workArea.x + BOUNDARY_MARGIN) {
      edges.push('left');
    }
    if (moveVector.x > 0 && right >= workRight - BOUNDARY_MARGIN) {
      edges.push('right');
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
    window.battlePetAPI.moveBy({ dx: sendX, dy: sendY });
  }
}

function updateBehavior(now, deltaMs) {
  if (bubbleUntil && now > bubbleUntil) {
    bubble.hidden = true;
    bubbleUntil = 0;
  }

  if (taskPanelOpen) {
    return;
  }

  if (stateUntil && now > stateUntil) {
    setIdle(900);
  }

  if (!stateUntil && now > behaviorDeadline) {
    chooseBehavior();
  }

  if (currentState === 'run' && moveSpeed) {
    probeBoundaryTurn(now);
    const factor = moveSpeed * (deltaMs / 16.67);
    moveWindowBy(moveVector.x * factor, moveVector.y * factor);
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function activeProgress(now, fallbackMs = 700) {
  const duration = stateDurationMs || fallbackMs;
  return clamp01((now - stateStartedAt) / duration);
}

function jumpArcOffset(now) {
  if (currentState !== 'jump') return 0;

  const progress = activeProgress(now, currentForm === 'cat' ? 720 : 940);
  const arc = Math.sin(progress * Math.PI);
  const landingBounce = progress > 0.84
    ? Math.sin((progress - 0.84) / 0.16 * Math.PI) * 8
    : 0;
  const jumpHeight = Math.min(72, Math.max(36, canvas.height * 0.22));
  return -arc * jumpHeight + landingBounce;
}

function hitShakeOffset(now) {
  if (currentState !== 'hit') return { x: 0, y: 0 };

  const progress = activeProgress(now, currentForm === 'cat' ? 820 : 980);
  const strength = (1 - progress) * 10 + 2;
  return {
    x: Math.round(Math.sin(progress * Math.PI * 18) * strength),
    y: Math.round(Math.sin(progress * Math.PI * 11) * strength * 0.22)
  };
}

function drawShadow(centerX, groundY, width, alpha = 0.24, height = 11) {
  context.save();
  context.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  context.beginPath();
  context.ellipse(centerX, groundY, width / 2, height, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawSlash(frame, centerX, centerY, scale) {
  if (currentState !== 'attack' || frame < 2 || frame > 8 || currentForm !== 'lingren') return;

  context.save();
  context.lineCap = 'round';
  context.globalAlpha = 0.76 - Math.abs(frame - 5) * 0.08;
  context.strokeStyle = '#f6f0d4';
  context.lineWidth = Math.max(2, 5 * scale);
  context.beginPath();
  context.moveTo(centerX + 14 * scale, centerY - 74 * scale);
  context.quadraticCurveTo(centerX + 88 * scale, centerY - 54 * scale, centerX + 102 * scale, centerY + 18 * scale);
  context.stroke();
  context.strokeStyle = 'rgba(255, 117, 74, 0.86)';
  context.lineWidth = Math.max(1, 2 * scale);
  context.stroke();
  context.restore();
}

function drawHitFlash(now, x, y, width, height) {
  if (currentState !== 'hit') return;

  const progress = activeProgress(now, currentForm === 'cat' ? 820 : 980);
  const pulse = Math.max(0, Math.sin(progress * Math.PI * 4)) * (1 - progress);
  context.save();
  context.globalAlpha = 0.18 + pulse * 0.28;
  context.strokeStyle = '#fff2d4';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x + width * 0.54, y + height * 0.38, Math.max(12, width * 0.22), 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = pulse * 0.22;
  context.fillStyle = '#ff5757';
  context.beginPath();
  context.ellipse(x + width * 0.52, y + height * 0.48, width * 0.48, height * 0.42, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function frameSourceRect(spec, frame) {
  if (spec.trim) {
    return {
      x: frame * manifest.frame.width + spec.trim.x,
      y: spec.trim.y,
      width: spec.trim.width,
      height: spec.trim.height
    };
  }

  const frameWidth = spec.frameWidth;
  const frameHeight = spec.frameHeight;
  const columns = spec.columns || 1;
  return {
    x: (frame % columns) * frameWidth,
    y: Math.floor(frame / columns) * frameHeight,
    width: frameWidth,
    height: frameHeight
  };
}

function shouldMirrorFrame(spec) {
  if (spec.mirrorDirections && spec.mirrorDirections[currentDirection]) {
    return true;
  }
  return currentForm === 'lingren' && currentDirection === 'left';
}

function drawFrame(now) {
  const spec = stateSpec(currentState);
  const image = imageForState(currentState);
  if (!image) return;

  const frame = frameIndex(spec, now);
  const src = frameSourceRect(spec, frame);
  const petHeight = currentPetHeight();
  const scale = petHeight / src.height;
  const drawWidth = Math.round(src.width * scale);
  const drawHeight = Math.round(src.height * scale);
  const jumpOffset = jumpArcOffset(now);
  const shake = hitShakeOffset(now);
  const x = Math.round((canvas.width - drawWidth) / 2 + shake.x);
  const bottomInset = taskPanelOpen ? 28 : BOTTOM_INSET;
  const baseY = Math.round(canvas.height - drawHeight - bottomInset);
  const y = Math.round(baseY + jumpOffset + shake.y);
  const groundY = baseY + drawHeight - 3;
  const jumpProgress = currentState === 'jump' ? activeProgress(now, currentForm === 'cat' ? 720 : 940) : 0;
  const shadowLift = currentState === 'jump' ? Math.sin(jumpProgress * Math.PI) : 0;
  const shadowWidth = Math.min(170, drawWidth * (0.72 - shadowLift * 0.3));
  const shadowAlpha = 0.24 - shadowLift * 0.11;
  const shadowHeight = 11 - shadowLift * 4;

  drawShadow(canvas.width / 2, groundY, shadowWidth, shadowAlpha, shadowHeight);

  context.save();
  if (shouldMirrorFrame(spec)) {
    context.translate(x + drawWidth, y);
    context.scale(-1, 1);
    context.drawImage(image, src.x, src.y, src.width, src.height, 0, 0, drawWidth, drawHeight);
  } else {
    context.drawImage(image, src.x, src.y, src.width, src.height, x, y, drawWidth, drawHeight);
  }
  context.restore();

  drawHitFlash(now, x, y, drawWidth, drawHeight);
  drawSlash(frame, canvas.width / 2, y + drawHeight * 0.56, scale);
}

function render(now) {
  const deltaMs = now - lastTime;
  lastTime = now;
  updateBehavior(now, deltaMs);

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawFrame(now);

  requestAnimationFrame(render);
}

function handleClick() {
  if (taskPanelOpen) return;

  const now = performance.now();
  if (now - lastClickAt > 1400) {
    clickChain = 0;
  }
  lastClickAt = now;
  clickChain += 1;

  if (isDown) {
    revive();
    return;
  }

  if (clickChain % 5 === 0) {
    doHit();
    return;
  }

  doAttack();
}

function setSize(sizeName) {
  selectedSizeName = currentSizePresets()[sizeName] ? sizeName : DEFAULT_SIZE_NAME;
  currentSize = currentSizePresets()[selectedSizeName];
  window.battlePetAPI.resize({ width: currentSize.width, height: currentSize.height });
  setTimeout(resizeCanvas, 80);
}

function setTaskStatus(message) {
  taskStatus.textContent = message;
}

function setTaskRunning(running) {
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
    const defaults = await window.battlePetAPI.getCodexTaskDefaults();
    if (!taskCwd.value) {
      taskCwd.value = defaults.cwd || '';
    }
    setTaskRunning(Boolean(defaults.running));
    setTaskStatus(defaults.running ? 'Codex 运行中' : '待命');
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

  taskPanelOpen = true;
  taskPanel.hidden = false;
  document.body.classList.add('task-panel-open');
  window.battlePetAPI.resize({
    width: Math.max(currentSize.width, TASK_PANEL_SIZE.width),
    height: Math.max(currentSize.height, TASK_PANEL_SIZE.height)
  });
  setTimeout(resizeCanvas, 80);
  moveSpeed = 0;
  moveVector = { x: 0, y: 0 };
  moveRemainder = { x: 0, y: 0 };
  setState('idle');
  setBubble('我来处理。', 1600);
  loadTaskDefaults();
  setTimeout(() => taskPrompt.focus(), 120);
}

function closeTaskPanel() {
  if (!taskPanelOpen) return;

  taskPanel.hidden = true;
  taskPanelOpen = false;
  document.body.classList.remove('task-panel-open');
  window.battlePetAPI.resize({ width: currentSize.width, height: currentSize.height });
  setTimeout(resizeCanvas, 80);
  setIdle(900);
}

async function runCodexTask() {
  const prompt = taskPrompt.value.trim();
  if (!prompt) {
    setTaskStatus('先写一个任务');
    taskPrompt.focus();
    return;
  }

  setTaskStatus('启动 Codex...');
  setTaskRunning(true);
  clearTaskOutput();
  appendTaskOutput(`> 工作目录：${taskCwd.value || '(默认)'}\n\n`);

  try {
    const result = await window.battlePetAPI.runCodexTask({
      prompt,
      cwd: taskCwd.value
    });
    setTaskStatus('Codex 运行中');
    appendTaskOutput(`任务编号：${result.taskId}\n日志：${result.logPath}\n\n`);
  } catch (error) {
    setTaskRunning(false);
    setTaskStatus(`启动失败：${error.message}`);
    appendTaskOutput(`启动失败：${error.message}\n`);
  }
}

async function cancelCodexTask() {
  if (!taskRunning) return;

  taskCancel.disabled = true;
  setTaskStatus('正在停止...');

  try {
    await window.battlePetAPI.cancelCodexTask();
  } catch (error) {
    setTaskStatus(`停止失败：${error.message}`);
    taskCancel.disabled = false;
  }
}

function handleCodexTaskEvent(event = {}) {
  switch (event.type) {
    case 'started':
      setTaskRunning(true);
      setTaskStatus('Codex 运行中');
      appendTaskOutput(`任务编号：${event.taskId}\n`);
      break;
    case 'stdout':
    case 'stderr':
      appendTaskOutput(event.text);
      break;
    case 'done':
      setTaskRunning(false);
      setTaskStatus('任务完成');
      appendTaskOutput(`\n${event.message}\n结果：${event.lastMessagePath}\n`);
      setBubble('任务完成。', 1600);
      break;
    case 'failed':
      setTaskRunning(false);
      setTaskStatus('任务失败');
      appendTaskOutput(`\n${event.message}\n日志：${event.logPath}\n`);
      setBubble('任务失败了。', 1800);
      break;
    case 'cancelled':
      setTaskRunning(false);
      setTaskStatus('已停止');
      appendTaskOutput('\n任务已停止。\n');
      break;
    case 'error':
      setTaskRunning(false);
      setTaskStatus('Codex 错误');
      appendTaskOutput(`\n${event.message}\n`);
      setBubble('Codex 启动失败。', 1800);
      break;
    default:
      break;
  }
}

async function loadPetForm(formName, options = {}) {
  const nextForm = PET_FORMS[formName] ? formName : DEFAULT_FORM;
  const nextManifest = window.battlePetAPI.loadManifest(nextForm);
  const loaded = await Promise.all(Array.from(manifestAssetPaths(nextManifest)).map(loadImage));

  currentForm = nextForm;
  manifest = nextManifest;
  images = Object.fromEntries(loaded);
  currentDirection = currentFormConfig().defaultDirection;
  currentState = manifest.states[currentState] ? currentState : 'idle';
  isDown = false;
  hp = MAX_HP;
  updateHp();
  currentSize = currentSizePresets()[selectedSizeName] || currentSizePresets()[DEFAULT_SIZE_NAME];
  resizeCanvas();

  if (options.resize !== false) {
    window.battlePetAPI.resize({ width: currentSize.width, height: currentSize.height });
    setTimeout(resizeCanvas, 80);
  }

  if (options.announce !== false) {
    setState('jump', currentForm === 'cat' ? 720 : 920, {
      message: `变成${currentFormConfig().label}了。`,
      messageDuration: 1200
    });
  } else {
    setIdle(1200);
  }

  behaviorDeadline = performance.now() + 1800;
  console.log(`battle pet form loaded: ${currentForm}, assets: ${Object.keys(images).length}`);
}

async function morphToForm(formName) {
  if (formName === currentForm) {
    setBubble(`现在就是${currentFormConfig().label}。`, 1200);
    return;
  }

  try {
    await loadPetForm(formName);
  } catch (error) {
    setBubble(`变身失败：${error.message}`, 2200);
    console.error(error);
  }
}

function toggleForm() {
  const currentIndex = FORM_ORDER.indexOf(currentForm);
  const nextForm = FORM_ORDER[(currentIndex + 1) % FORM_ORDER.length] || DEFAULT_FORM;
  morphToForm(nextForm);
}

function applyCommand(command, payload = {}) {
  switch (command) {
    case 'attack':
      doAttack();
      break;
    case 'jump':
      doJump();
      break;
    case 'hit':
      doHit();
      break;
    case 'death':
      doDeath();
      break;
    case 'revive':
      revive();
      break;
    case 'run-left':
      if (!isDown) setRun('left', 2300);
      break;
    case 'run-right':
      if (!isDown) setRun('right', 2300);
      break;
    case 'boundary-hit':
      turnFromBoundary(payload);
      break;
    case 'size':
      setSize(payload.size || DEFAULT_SIZE_NAME);
      break;
    case 'toggle-form':
      toggleForm();
      break;
    case 'morph':
      morphToForm(payload.form || DEFAULT_FORM);
      break;
    case 'show-task-panel':
      openTaskPanel();
      break;
    case 'home':
      window.battlePetAPI.home();
      break;
    default:
      setIdle();
      break;
  }
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
    window.battlePetAPI.dragStart(pointerStart);
    if (!isDown) {
      const direction = event.clientX >= pointerStart.x ? 'right' : 'left';
      setState('run', 60 * 60 * 1000, {
        direction,
        speed: 0,
        moveVector: { x: 0, y: 0 },
        message: currentForm === 'cat' ? '被拎起来了。' : '被拎起来了。',
        messageDuration: 60 * 60 * 1000
      });
    }
  }

  if (dragging) {
    if (!isDown) {
      currentDirection = event.clientX >= pointerStart.x ? 'right' : 'left';
    }
    window.battlePetAPI.dragMove();
  }
}

function onPointerUp(event) {
  if (!pointerDown) return;
  pointerDown = false;
  canvas.releasePointerCapture(event.pointerId);

  if (dragging) {
    dragging = false;
    canvas.classList.remove('dragging');
    window.battlePetAPI.dragEnd();
    if (!isDown) {
      setState('jump', currentForm === 'cat' ? 680 : 780, {
        message: '落地。',
        messageDuration: 900,
        suppressBubble: true
      });
    }
    return;
  }

  handleClick();
}

function onContextMenu(event) {
  event.preventDefault();
  window.battlePetAPI.openMenu();
}

function loadImage(relativePath) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([relativePath, image]);
    image.onerror = () => reject(new Error(`Failed to load image: ${relativePath}`));
    image.src = window.battlePetAPI.assetUrl(relativePath);
  });
}

async function start() {
  console.log('battle pet renderer start');
  await loadPetForm(DEFAULT_FORM, { resize: false, announce: false });

  resizeCanvas();
  updateHp();
  setBubble('左键攻击，连戳会扣血。', 2400);
  behaviorDeadline = performance.now() + 1600;
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
    runCodexTask();
  }
});
window.battlePetAPI.onCommand(applyCommand);
window.battlePetAPI.onCodexTaskEvent(handleCodexTaskEvent);

start().catch((error) => {
  console.error(error);
  resizeCanvas();
  context.clearRect(0, 0, canvas.width, canvas.height);
  bubbleText.textContent = error.message;
  bubble.hidden = false;
});
