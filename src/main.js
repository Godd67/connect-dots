import { Grid } from './Grid.js';
import { Generator } from './Generator.js';
import { Random } from './Random.js';
const APP_VERSION = '1.1.13';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const generateBtn = document.getElementById('generate-btn');
const revealBtn = document.getElementById('reveal-btn');
const sizeDisplay = document.getElementById('grid-size-display');
const sizeDecreaseBtn = document.getElementById('size-decrease');
const sizeIncreaseBtn = document.getElementById('size-increase');
const hardModeBtn = document.getElementById('hard-mode-btn');
const resetBtn = document.getElementById('reset-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const seedInput = document.getElementById('seed-input');

// Settings UI
const settingsModal = document.getElementById('settings-modal');
const settingsOpenBtn = document.getElementById('settings-open-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const canvasContainer = document.querySelector('.canvas-container');

const settingDefaultSize = document.getElementById('setting-default-size');
const settingAspectRatio = document.getElementById('setting-aspect-ratio');
const settingApplause = document.getElementById('setting-applause');
const settingNav = document.getElementById('setting-nav');
const debugParams = new URLSearchParams(window.location.search);
const AUTOSCROLL_DEBUG = debugParams.has('debug_autoscroll') || localStorage.getItem('dots-debug-autoscroll') === '1';

const ASPECT_RATIOS = {
  '1:1': 1,
  '3:4': 4 / 3, // Height = Width * (4/3)
  '9:16': 16 / 9
};

// Settings Management
const Settings = {
  data: {
    defaultGridSize: 10,
    aspectRatio: '1:1',
    applauseSound: true,
    navMode: 'drag'
  },

  load() {
    try {
      const saved = localStorage.getItem('dots-settings');
      if (saved) {
        this.data = { ...this.data, ...JSON.parse(saved) };
      } else {
        // First run: pick best aspect ratio based on screen dimensions
        this.data.aspectRatio = getDefaultAspectRatio();
      }
    } catch (e) {
      this.data.aspectRatio = getDefaultAspectRatio();
    }
    this.applyToUI();
  },

  save() {
    try {
      localStorage.setItem('dots-settings', JSON.stringify(this.data));
    } catch (e) {
      console.warn("Storage access denied or failed", e);
    }
  },

  applyToUI() {
    if (settingDefaultSize) settingDefaultSize.value = this.data.defaultGridSize;
    if (settingAspectRatio) settingAspectRatio.value = this.data.aspectRatio;
    if (settingApplause) settingApplause.checked = this.data.applauseSound;
    if (settingNav) settingNav.value = this.data.navMode;
  },

  syncFromUI() {
    if (settingDefaultSize) this.data.defaultGridSize = parseInt(settingDefaultSize.value) || 10;
    if (settingAspectRatio) this.data.aspectRatio = settingAspectRatio.value || '1:1';
    if (settingApplause) this.data.applauseSound = settingApplause.checked;
    if (settingNav) this.data.navMode = settingNav.value;
    this.save();
  }
};

let gridSize = Settings.data.defaultGridSize; // Initialized from settings

let grid = null;
let showPaths = false;
let userPaths = {}; // { pathId: [[r,c], [r,c], ...] }
let isDrawing = false;
let activePathId = null;
let lastCell = null; // [r, c] last cell user touched
let undoStack = [];
let redoStack = [];
let prevUserPaths = null;
let loadedSeed = null; // Track the seed of the active grid
let seedDirty = false; // Track if user edited the seed input

// Rendering constants
const DEFAULT_CELL_SIZE = 50;
const MIN_MOBILE_CELL_SIZE = 12; // Allow large boards to fit within the initial mobile viewport
const MOBILE_INITIAL_FIT = 0.94; // Leave a little slack so the board starts slightly narrower than the screen
const AUTOSCROLL_EDGE_ZONE = 48;
const AUTOSCROLL_STOP_BUFFER = 24;
const AUTOSCROLL_DIRECTION_THRESHOLD = 2;
const AUTOSCROLL_MAX_SPEED = 18;
const MIN_BOARD_SCALE = 0.5;
const MAX_BOARD_SCALE = 3;
const DOT_RADIUS_RATIO = 0.38;
const PADDING = 20;

const dpr = window.devicePixelRatio || 1;

// Dynamic values (recalculated on generate)
let CELL_SIZE = DEFAULT_CELL_SIZE;
let DOT_RADIUS = CELL_SIZE * DOT_RADIUS_RATIO;
let boardScale = 1;
let boardBaseWidth = 0;
let boardBaseHeight = 0;
let isPanningBoard = false;
let panStartX = 0;
let panStartY = 0;
let panStartScrollLeft = 0;
let panStartScrollTop = 0;
let pinchGesture = null;
const edgeScroll = {
  rafId: null,
  dx: 0,
  dy: 0,
  pointerX: null,
  pointerY: null,
  travelX: 0,
  travelY: 0,
  moveX: 0,
  moveY: 0
};

function isMobile() {
  // Check both width and user agent for better mobile/tablet detection
  return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/** Pick the best default aspect ratio for first-run based on physical screen dimensions. */
function getDefaultAspectRatio() {
  if (!isMobile()) return '1:1';
  // Use screen (physical pixels) for best accuracy on mobile
  const h = screen.height;
  const w = screen.width;
  const ratio = Math.max(h, w) / Math.min(h, w); // always > 1 regardless of orientation
  if (ratio >= 1.6) return '9:16';   // Typical phone portrait (16/9 ≈ 1.78)
  if (ratio >= 1.2) return '3:4';   // Typical tablet portrait (4/3 ≈ 1.33)
  return '1:1';
}

function showToast(message, durationMs = 2500) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), durationMs);
}

function updateAutoscrollDebug(details) {
  if (!AUTOSCROLL_DEBUG) return;

  const scroller = document.scrollingElement || document.documentElement;
  const pageX = Math.round(window.scrollX || scroller?.scrollLeft || 0);
  const pageY = Math.round(window.scrollY || scroller?.scrollTop || 0);
  const containerX = Math.round(canvasContainer?.scrollLeft || 0);
  const containerY = Math.round(canvasContainer?.scrollTop || 0);
  const canvasRect = canvas.getBoundingClientRect();

  const lines = [
    `draw:${isDrawing} path:${activePathId ?? '-'}`,
    `ptr:${details.clientX ?? '-'},${details.clientY ?? '-'}`,
    `move:${details.moveX ?? 0},${details.moveY ?? 0}`,
    `travel:${details.travelX ?? 0},${details.travelY ?? 0}`,
    `edge:${details.distLeft ?? '-'} ${details.distRight ?? '-'} ${details.distTop ?? '-'} ${details.distBottom ?? '-'}`,
    `hidden:${details.hiddenLeft ?? 0} ${details.hiddenRight ?? 0} ${details.hiddenUp ?? 0} ${details.hiddenDown ?? 0}`,
    `scroll:${details.dx ?? 0} ${details.dy ?? 0}`,
    `page:${pageX} ${pageY}`,
    `cont:${containerX} ${containerY}`,
    `canvas:${Math.round(canvasRect.left)} ${Math.round(canvasRect.top)} ${Math.round(canvasRect.right)} ${Math.round(canvasRect.bottom)}`,
    `reason:${details.reason ?? '-'}`
  ];

  const panel = ensureAutoscrollDebugPanel();

  panel.textContent = lines.join('\n');
  console.debug('[autoscroll]', details);
}

function ensureAutoscrollDebugPanel() {
  let panel = document.getElementById('autoscroll-debug');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'autoscroll-debug';
  panel.style.position = 'fixed';
  panel.style.left = '8px';
  panel.style.bottom = '8px';
  panel.style.zIndex = '10002';
  panel.style.pointerEvents = 'none';
  panel.style.background = 'rgba(0, 0, 0, 0.78)';
  panel.style.color = '#8ef58e';
  panel.style.font = '12px/1.35 monospace';
  panel.style.padding = '8px 10px';
  panel.style.borderRadius = '8px';
  panel.style.whiteSpace = 'pre-line';
  panel.style.maxWidth = 'calc(100vw - 16px)';
  document.body.appendChild(panel);
  return panel;
}

function playApplause() {

  if (!Settings.data.applauseSound) return;

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Triumphant fanfare melody: C-E-G-C (rising)
  const notes = [
    { freq: 261.63, start: 0.0, duration: 0.15 },  // C4
    { freq: 329.63, start: 0.15, duration: 0.15 }, // E4
    { freq: 392.00, start: 0.3, duration: 0.15 },  // G4
    { freq: 523.25, start: 0.45, duration: 0.4 }   // C5 (longer final note)
  ];

  notes.forEach(note => {
    const time = audioCtx.currentTime + note.start;

    // Main oscillator (trumpet-like)
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(note.freq, time);

    // Envelope for natural attack/decay
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.3, time + 0.02); // Quick attack
    gain.gain.linearRampToValueAtTime(0.25, time + note.duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.01, time + note.duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(time);
    osc.stop(time + note.duration);
  });
}

function calculateCellSize(cols, rows) {
  if (!isMobile()) return DEFAULT_CELL_SIZE;
  const availableWidth = document.documentElement.clientWidth || window.innerWidth;
  const availableHeight = document.documentElement.clientHeight || window.innerHeight;
  const maxWidth = Math.floor((availableWidth - PADDING * 2 - 30) * MOBILE_INITIAL_FIT);
  const maxHeight = Math.floor((availableHeight - 200) * MOBILE_INITIAL_FIT); // Leave room for header/controls

  const cellW = Math.floor(maxWidth / cols);
  const cellH = Math.floor(maxHeight / rows);
  const bestFit = Math.min(cellW, cellH);
  return Math.max(MIN_MOBILE_CELL_SIZE, Math.min(bestFit, DEFAULT_CELL_SIZE));
}

function getTouchDistance(touches) {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getTouchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

function clampBoardScale(scale) {
  return Math.max(MIN_BOARD_SCALE, Math.min(MAX_BOARD_SCALE, scale));
}

function clampContainerScroll() {
  if (!canvasContainer) return;
  const maxLeft = Math.max(0, canvasContainer.scrollWidth - canvasContainer.clientWidth);
  const maxTop = Math.max(0, canvasContainer.scrollHeight - canvasContainer.clientHeight);
  canvasContainer.scrollLeft = Math.max(0, Math.min(canvasContainer.scrollLeft, maxLeft));
  canvasContainer.scrollTop = Math.max(0, Math.min(canvasContainer.scrollTop, maxTop));
}

function applyBoardScale(nextScale, anchorClientX = null, anchorClientY = null) {
  const clampedScale = clampBoardScale(nextScale);
  if (clampedScale === boardScale) return;

  let anchorOffsetX = null;
  let anchorOffsetY = null;
  let anchorContentX = null;
  let anchorContentY = null;

  if (canvasContainer && anchorClientX != null && anchorClientY != null) {
    const rect = canvasContainer.getBoundingClientRect();
    anchorOffsetX = anchorClientX - rect.left;
    anchorOffsetY = anchorClientY - rect.top;
    anchorContentX = canvasContainer.scrollLeft + anchorOffsetX;
    anchorContentY = canvasContainer.scrollTop + anchorOffsetY;
  }

  const previousScale = boardScale;
  boardScale = clampedScale;
  updateCanvasDisplaySize();

  if (canvasContainer && anchorContentX != null && anchorContentY != null) {
    const ratio = boardScale / previousScale;
    canvasContainer.scrollLeft = anchorContentX * ratio - anchorOffsetX;
    canvasContainer.scrollTop = anchorContentY * ratio - anchorOffsetY;
  }

  clampContainerScroll();
}

function updateCanvasDisplaySize() {
  if (!boardBaseWidth || !boardBaseHeight) return;
  canvas.style.width = `${Math.round(boardBaseWidth * boardScale)}px`;
  canvas.style.height = `${Math.round(boardBaseHeight * boardScale)}px`;
}

function init() {
  console.log(`Connect The Dots - v${APP_VERSION} Initialized`);
  if (AUTOSCROLL_DEBUG) {
    ensureAutoscrollDebugPanel();
    updateAutoscrollDebug({ reason: 'idle' });
  }

  // Cache Control: Clear SW and reload if user clicks the version/update link
  const buildInfoEl = document.getElementById('build-info');
  if (buildInfoEl) {
    buildInfoEl.style.cursor = 'pointer';
    buildInfoEl.style.textDecoration = 'underline';
    buildInfoEl.addEventListener('click', () => {
      if (confirm("Force update? This will clear the cache and reload the page.")) {
        forceUpdate();
      }
    });
  }

  generateBtn.addEventListener('click', () => {
    // If user has not changed the seed input manually, randomize it.
    // This allows "New" to truly feel like a new level every time.
    if (!seedDirty && seedInput.value === loadedSeed) {
      seedInput.value = '';
    }
    generate();
  });

  const updateSeedFromUI = () => {
    const seed = seedInput.value.trim();
    const match = seed.match(/^(\d+)([HS])(.+)$/);
    if (match) {
      const rawSeed = match[3];
      const isHard = hardModeBtn.classList.contains('active');
      const modeChar = isHard ? 'H' : 'S';
      seedInput.value = `${gridSize}${modeChar}${rawSeed}`;
    }
  };

  seedInput.addEventListener('input', () => {
    seedDirty = true;
    const seed = seedInput.value.trim();
    const match = seed.match(/^(\d+)([HS])(.+)$/);
    if (match) {
      const size = parseInt(match[1]);
      const hard = (match[2] === 'H');
      if (size >= 5 && size <= 20) {
        gridSize = size;
        sizeDisplay.textContent = size;
        if (hard) hardModeBtn.classList.add('active');
        else hardModeBtn.classList.remove('active');
      }
    }
  });

  hardModeBtn.addEventListener('click', () => {
    hardModeBtn.classList.toggle('active');
    updateSeedFromUI();
  });

  // Hint button: press and hold to show
  const showHint = (e) => {
    if (e && e.cancelable) e.preventDefault();
    showPaths = true;
    draw();
  };
  const hideHint = (e) => {
    // DO NOT prevent default on touchend/mouseup as it blocks click events and triggers console errors
    showPaths = false;
    draw();
  };

  revealBtn.addEventListener('mousedown', showHint);
  revealBtn.addEventListener('touchstart', showHint, { passive: false });
  // Add release listeners to window/revealBtn for reliability
  revealBtn.addEventListener('mouseup', hideHint);
  revealBtn.addEventListener('touchend', hideHint);
  revealBtn.addEventListener('touchcancel', hideHint);
  window.addEventListener('mouseup', hideHint); // Backup if release outside button
  window.addEventListener('touchend', hideHint); // Backup if release outside button

  // Grid size controls
  sizeDecreaseBtn.addEventListener('click', () => {
    if (gridSize > 5) {
      gridSize--;
      sizeDisplay.textContent = gridSize;
      updateSeedFromUI();
    }
  });

  sizeIncreaseBtn.addEventListener('click', () => {
    if (gridSize < 20) {
      gridSize++;
      sizeDisplay.textContent = gridSize;
      updateSeedFromUI();
    }
  });

  resetBtn.addEventListener('click', () => {
    userPaths = {};
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
    draw();
  });

  undoBtn.addEventListener('click', () => {
    if (undoStack.length > 0) {
      redoStack.push(JSON.stringify(userPaths));
      userPaths = JSON.parse(undoStack.pop());
      updateUndoRedoButtons();
      draw();
      checkWin();
    }
  });

  redoBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
      undoStack.push(JSON.stringify(userPaths));
      userPaths = JSON.parse(redoStack.pop());
      updateUndoRedoButtons();
      draw();
      checkWin();
    }
  });


  // Settings Events
  settingsOpenBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  settingsCloseBtn.addEventListener('click', () => {
    Settings.syncFromUI();
    settingsModal.classList.add('hidden');
  });

  settingAspectRatio.addEventListener('change', () => {
    Settings.syncFromUI();
  });

  // Close modal on outside click
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      Settings.syncFromUI();
      settingsModal.classList.add('hidden');
    }
  });

  // Load Settings
  Settings.load();
  gridSize = Settings.data.defaultGridSize;
  sizeDisplay.textContent = gridSize;

  // Mouse Events
  canvas.addEventListener('mousedown', (e) => {
    redoStack = [];
    prevUserPaths = JSON.stringify(userPaths);
    handlePointerDown(e);
    updateUndoRedoButtons();
  });
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);

  // Mobile Touch Events
  const onTouchStart = (e) => {
    redoStack = [];
    prevUserPaths = JSON.stringify(userPaths);
    if (e.touches.length === 2) {
      if (isDrawing) {
        isDrawing = false;
        activePathId = null;
        draw();
      }
      isPanningBoard = false;
      pinchGesture = {
        startDistance: getTouchDistance(e.touches),
        startScale: boardScale
      };
      stopEdgeScroll(true);
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (e.touches.length > 2) return;

    const touch = e.touches[0];
    const started = handlePointerDown(touch);
    if (started && e.cancelable) {
      e.preventDefault();
      return;
    }
    isPanningBoard = true;
    panStartX = touch.clientX;
    panStartY = touch.clientY;
    panStartScrollLeft = canvasContainer ? canvasContainer.scrollLeft : 0;
    panStartScrollTop = canvasContainer ? canvasContainer.scrollTop : 0;
  };

  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      if (isDrawing) {
        isDrawing = false;
        activePathId = null;
        draw();
      }
      isPanningBoard = false;
      if (!pinchGesture) {
        pinchGesture = {
          startDistance: getTouchDistance(e.touches),
          startScale: boardScale
        };
      }
      const distance = getTouchDistance(e.touches);
      if (pinchGesture.startDistance > 0) {
        const midpoint = getTouchMidpoint(e.touches);
        applyBoardScale(pinchGesture.startScale * (distance / pinchGesture.startDistance), midpoint.x, midpoint.y);
      }
      stopEdgeScroll(true);
      if (e.cancelable) e.preventDefault();
      return;
    }
    pinchGesture = null;
    if (e.touches.length > 1) return;

    const touch = e.touches[0];
    if (isDrawing) {
      if (e.cancelable) e.preventDefault();
      handlePointerMove(touch);
    } else if (isPanningBoard && canvasContainer) {
      if (e.cancelable) e.preventDefault();
      canvasContainer.scrollLeft = panStartScrollLeft - (touch.clientX - panStartX);
      canvasContainer.scrollTop = panStartScrollTop - (touch.clientY - panStartY);
      clampContainerScroll();
    }
  };

  const onTouchEnd = (e) => {
    if (pinchGesture && (!e || e.touches?.length < 2)) {
      pinchGesture = null;
    }
    if (!e || e.touches?.length === 0) {
      isPanningBoard = false;
      handlePointerUp();
    }
  };

  canvasContainer.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);

  // Populate build info version number
  if (buildInfoEl) {
    const buildNum = import.meta.env.VITE_BUILD_NUMBER || 'dev';
    buildInfoEl.textContent = `v${APP_VERSION}-${buildNum} (Tap to Update)`;
  }

  // Initial generation
  generate();
  updateTitle(false);
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  if (!undoBtn || !redoBtn) return;
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}

function updateTitle(isWin) {
  const h1 = document.querySelector('header h1');
  if (!h1) return;

  const text = "The Dots";
  let spansHtml = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    // Add jitter class only if won
    const classes = isWin ? 'jitter' : '';
    // Space handling: wrap it too to keep nth-child count consistent
    const content = char === ' ' ? '&nbsp;' : char;
    spansHtml += `<span class="${classes}">${content}</span>`;
  }

  const coloredSpan = `<span id="title-colored">${spansHtml}</span>`;

  if (isWin) {
    h1.innerHTML = `${coloredSpan} connected!`;
  } else {
    h1.innerHTML = `Connect ${coloredSpan}!`;
  }
}

function getCellFromCoords(x, y) {
  const rect = canvas.getBoundingClientRect();
  const logicalWidth = canvas.width / dpr;
  const logicalHeight = canvas.height / dpr;
  const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1;
  const canvasX = (x - rect.left) * scaleX - PADDING;
  const canvasY = (y - rect.top) * scaleY - PADDING;

  const c = Math.floor(canvasX / CELL_SIZE);
  const r = Math.floor(canvasY / CELL_SIZE);

  if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) {
    return [r, c];
  }
  return null;
}

function handlePointerDown(e) {
  stopEdgeScroll(true);
  if (!grid) return false;
  const cell = getCellFromCoords(e.clientX, e.clientY);

  if (!cell) return false;

  const [r, c] = cell;
  const pathId = grid.cells[r][c];

  // Only start drawing if we clicked on an endpoint dot
  if (pathId > 0) {
    const path = grid.paths.find(p => p.id === parseInt(pathId));
    if (!path) return false;

    const start = path.points[0];
    const end = path.points[path.points.length - 1];

    const isStart = (r === start[0] && c === start[1]);
    const isEnd = (r === end[0] && c === end[1]);

    if (isStart || isEnd) {
      isDrawing = true;
      activePathId = pathId;
      userPaths[pathId] = [cell];
      lastCell = cell;
      edgeScroll.pointerX = e.clientX;
      edgeScroll.pointerY = e.clientY;
      edgeScroll.travelX = 0;
      edgeScroll.travelY = 0;
      edgeScroll.moveX = 0;
      edgeScroll.moveY = 0;
      draw();
      return true;
    }
  }
  return false;
}

function handlePointerMove(e) {
  if (!isDrawing || !activePathId) return;
  updateEdgeScrollIntent(e.clientX, e.clientY);
  extendActivePathAt(e.clientX, e.clientY);
}

function extendActivePathAt(clientX, clientY) {
  const cell = getCellFromCoords(clientX, clientY);
  if (!cell) return;

  const [r, c] = cell;
  const [lr, lc] = lastCell;

  // Only add if it's a new cell and adjacent to the last one
  if (r === lr && c === lc) return;

  const dist = Math.abs(r - lr) + Math.abs(c - lc);
  if (dist === 1) {
    // Check if cell is occupied by a stone or ANOTHER user path
    // But allow passing through the MATCHING endpoint
    const path = grid.paths.find(p => p.id === activePathId);
    const targetDots = [path.points[0], path.points[path.points.length - 1]];
    const isTargetDot = targetDots.some(d => d[0] === r && d[1] === c);

    // Collision detection:
    // 1. Is it a stone? 
    const cellVal = grid.cells[r][c];
    if (cellVal === -1 && !isTargetDot) {
      return; // It's a stone!
    }

    // 2. Is it a dot of ANOTHER path?
    const otherDot = grid.paths.some(p => {
      if (p.id === activePathId) return false;
      const start = p.points[0];
      const end = p.points[p.points.length - 1];
      return (r === start[0] && c === start[1]) || (r === end[0] && c === end[1]);
    });
    if (otherDot) return;

    // 3. Is it occupied by ANOTHER user path?
    for (const otherId in userPaths) {
      if (parseInt(otherId) === activePathId) continue;
      if (userPaths[otherId].some(p => p[0] === r && p[1] === c)) return;
    }

    // - Cannot move into own path (but can backtrack)
    const existingIdx = userPaths[activePathId].findIndex(p => p[0] === r && p[1] === c);
    if (existingIdx !== -1) {
      // Backtracking: if we move to the previous point, truncate the path
      if (existingIdx === userPaths[activePathId].length - 2) {
        userPaths[activePathId].pop();
        lastCell = cell;
        draw();
      }
      return;
    }

    // Check if path is already "finished" (reached the other dot)
    const currentPoints = userPaths[activePathId];
    const pathEnd = targetDots.find(d => d[0] === lr && d[1] === lc);
    const totalEndsFound = targetDots.filter(d => currentPoints.some(p => p[0] === d[0] && p[1] === d[1])).length;

    // If we were already at an endpoint (that wasn't the start), don't extend further 
    // unless we are backtracking (handled above)
    if (totalEndsFound >= 2 && currentPoints.length > 1) {
      const [fr, fc] = currentPoints[0];
      const [lr_p, lc_p] = currentPoints[currentPoints.length - 1];
      // if last point is the "other" dot, stop
      return;
    }

    userPaths[activePathId].push(cell);
    lastCell = cell;
    draw();
  }
}

function handlePointerUp() {
  if (isDrawing && activePathId) {
    // Check if the path is complete before stopping
    const path = grid.paths.find(p => p.id === activePathId);
    if (path) {
      const userPath = userPaths[activePathId];
      const start = path.points[0];
      const end = path.points[path.points.length - 1];

      const first = userPath[0];
      const last = userPath[userPath.length - 1];

      const isStart = (first[0] === start[0] && first[1] === start[1]);
      const isEnd = (last[0] === end[0] && last[1] === end[1]);
      const isStartRev = (first[0] === end[0] && first[1] === end[1]);
      const isEndRev = (last[0] === start[0] && last[1] === start[1]);

      const complete = (isStart && isEnd) || (isStartRev && isEndRev);

      if (!complete) {
        // Remove unfinished path
        delete userPaths[activePathId];
        draw();
      } else {
        // Successfully connected! Save to history
        if (prevUserPaths) {
          undoStack.push(prevUserPaths);
          updateUndoRedoButtons();
        }
      }
    }
    checkWin();
  }
  prevUserPaths = null;
  isDrawing = false;
  activePathId = null;
  lastCell = null;
  stopEdgeScroll(true);
}

function checkWin() {
  if (!grid) return;

  let allConnected = true;
  for (const path of grid.paths) {
    const userPath = userPaths[path.id];
    if (!userPath || userPath.length < 2) {
      allConnected = false;
      continue;
    }

    const start = path.points[0];
    const end = path.points[path.points.length - 1];

    // Check if user path connects start and end
    const first = userPath[0];
    const last = userPath[userPath.length - 1];

    const conn1 = (first[0] === start[0] && first[1] === start[1] && last[0] === end[0] && last[1] === end[1]);
    const conn2 = (first[0] === end[0] && first[1] === end[1] && last[0] === start[0] && last[1] === start[1]);

    if (!conn1 && !conn2) {
      allConnected = false;
    } else {
      console.log(`Path ${path.id} is connected!`);
    }
  }

  if (allConnected) {
    console.log("ALL PATHS CONNECTED!");
    updateTitle(true);
    playApplause();
  }
}

function getScrollViewportRect() {
  const vv = window.visualViewport;
  if (vv) {
    return {
      left: 0,
      top: 0,
      right: vv.width,
      bottom: vv.height
    };
  }
  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight
  };
}

function getContainerHiddenDistances() {
  if (!canvasContainer) {
    return { left: 0, right: 0, up: 0, down: 0 };
  }

  return {
    left: canvasContainer.scrollLeft,
    right: Math.max(0, canvasContainer.scrollWidth - canvasContainer.clientWidth - canvasContainer.scrollLeft),
    up: canvasContainer.scrollTop,
    down: Math.max(0, canvasContainer.scrollHeight - canvasContainer.clientHeight - canvasContainer.scrollTop)
  };
}

function getViewportHiddenDistances() {
  const viewport = getScrollViewportRect();
  const rect = canvas.getBoundingClientRect();

  return {
    left: Math.max(0, Math.round(viewport.left - rect.left)),
    right: Math.max(0, Math.round(rect.right - viewport.right)),
    up: Math.max(0, Math.round(viewport.top - rect.top)),
    down: Math.max(0, Math.round(rect.bottom - viewport.bottom))
  };
}

function getHiddenBoardDistances() {
  const containerHidden = getContainerHiddenDistances();
  const viewportHidden = getViewportHiddenDistances();

  return {
    left: Math.max(containerHidden.left, viewportHidden.left),
    right: Math.max(containerHidden.right, viewportHidden.right),
    up: Math.max(containerHidden.up, viewportHidden.up),
    down: Math.max(containerHidden.down, viewportHidden.down)
  };
}

function getEdgeSpeed(distanceToEdge) {
  const clampedDistance = Math.max(0, Math.min(distanceToEdge, AUTOSCROLL_EDGE_ZONE));
  return AUTOSCROLL_MAX_SPEED * (1 - clampedDistance / AUTOSCROLL_EDGE_ZONE);
}

function setAutoscrollPageMode(enabled) {
  document.body.classList.toggle('force-scroll', enabled);
}

function applyAutoscrollStep(stepX, stepY) {
  let remainingX = stepX;
  let remainingY = stepY;

  if (canvasContainer) {
    const containerHidden = getContainerHiddenDistances();

    if (remainingX < 0 && containerHidden.left > 0) {
      const applied = -Math.min(Math.abs(remainingX), containerHidden.left);
      canvasContainer.scrollLeft += applied;
      remainingX -= applied;
    } else if (remainingX > 0 && containerHidden.right > 0) {
      const applied = Math.min(remainingX, containerHidden.right);
      canvasContainer.scrollLeft += applied;
      remainingX -= applied;
    }

    if (remainingY < 0 && containerHidden.up > 0) {
      const applied = -Math.min(Math.abs(remainingY), containerHidden.up);
      canvasContainer.scrollTop += applied;
      remainingY -= applied;
    } else if (remainingY > 0 && containerHidden.down > 0) {
      const applied = Math.min(remainingY, containerHidden.down);
      canvasContainer.scrollTop += applied;
      remainingY -= applied;
    }
  }

  if (remainingX !== 0 || remainingY !== 0) {
    const scroller = document.scrollingElement || document.documentElement;
    if (scroller) {
      scroller.scrollLeft += remainingX;
      scroller.scrollTop += remainingY;
    }
    window.scrollBy(remainingX, remainingY);
  }
}

function applyAxisStopBuffer() {
  const hidden = getHiddenBoardDistances();
  if (edgeScroll.dx < 0 && hidden.left <= AUTOSCROLL_STOP_BUFFER) edgeScroll.dx = 0;
  if (edgeScroll.dx > 0 && hidden.right <= AUTOSCROLL_STOP_BUFFER) edgeScroll.dx = 0;
  if (edgeScroll.dy < 0 && hidden.up <= AUTOSCROLL_STOP_BUFFER) edgeScroll.dy = 0;
  if (edgeScroll.dy > 0 && hidden.down <= AUTOSCROLL_STOP_BUFFER) edgeScroll.dy = 0;
}

function updateEdgeScrollIntent(clientX, clientY) {
  const prevX = edgeScroll.pointerX;
  const prevY = edgeScroll.pointerY;
  edgeScroll.pointerX = clientX;
  edgeScroll.pointerY = clientY;

  const moveX = prevX == null ? 0 : clientX - prevX;
  const moveY = prevY == null ? 0 : clientY - prevY;

  if (moveX !== 0) {
    edgeScroll.travelX = Math.sign(edgeScroll.travelX) === Math.sign(moveX)
      ? edgeScroll.travelX + moveX
      : moveX;
  }
  if (moveY !== 0) {
    edgeScroll.travelY = Math.sign(edgeScroll.travelY) === Math.sign(moveY)
      ? edgeScroll.travelY + moveY
      : moveY;
  }

  edgeScroll.moveX = Math.abs(edgeScroll.travelX) >= AUTOSCROLL_DIRECTION_THRESHOLD ? edgeScroll.travelX : 0;
  edgeScroll.moveY = Math.abs(edgeScroll.travelY) >= AUTOSCROLL_DIRECTION_THRESHOLD ? edgeScroll.travelY : 0;

  let dx = 0;
  let dy = 0;
  let reason = 'inactive';
  let distLeft = null;
  let distRight = null;
  let distTop = null;
  let distBottom = null;
  let hidden = { left: 0, right: 0, up: 0, down: 0 };

  if (isDrawing && canvasContainer) {
    const rect = getScrollViewportRect();
    hidden = getHiddenBoardDistances();
    distLeft = Math.round(clientX - rect.left);
    distRight = Math.round(rect.right - clientX);
    distTop = Math.round(clientY - rect.top);
    distBottom = Math.round(rect.bottom - clientY);
    reason = 'eligible';

    if (edgeScroll.moveX < 0 && hidden.left > AUTOSCROLL_STOP_BUFFER && distLeft <= AUTOSCROLL_EDGE_ZONE) {
      dx = -getEdgeSpeed(distLeft);
      reason = 'scroll-left';
    } else if (edgeScroll.moveX > 0 && hidden.right > AUTOSCROLL_STOP_BUFFER && distRight <= AUTOSCROLL_EDGE_ZONE) {
      dx = getEdgeSpeed(distRight);
      reason = 'scroll-right';
    }

    if (edgeScroll.moveY < 0 && hidden.up > AUTOSCROLL_STOP_BUFFER && distTop <= AUTOSCROLL_EDGE_ZONE) {
      dy = -getEdgeSpeed(distTop);
      reason = dx !== 0 ? `${reason}+up` : 'scroll-up';
    } else if (edgeScroll.moveY > 0 && hidden.down > AUTOSCROLL_STOP_BUFFER && distBottom <= AUTOSCROLL_EDGE_ZONE) {
      dy = getEdgeSpeed(distBottom);
      reason = dx !== 0 ? `${reason}+down` : 'scroll-down';
    }

    if (dx === 0 && dy === 0) {
      if (edgeScroll.moveX === 0 && edgeScroll.moveY === 0) {
        reason = 'movement-too-small';
      } else if (edgeScroll.moveX < 0 && hidden.left <= AUTOSCROLL_STOP_BUFFER) {
        reason = 'left-visible';
      } else if (edgeScroll.moveX > 0 && hidden.right <= AUTOSCROLL_STOP_BUFFER) {
        reason = 'right-visible';
      } else if (edgeScroll.moveY < 0 && hidden.up <= AUTOSCROLL_STOP_BUFFER) {
        reason = 'top-visible';
      } else if (edgeScroll.moveY > 0 && hidden.down <= AUTOSCROLL_STOP_BUFFER) {
        reason = 'bottom-visible';
      } else {
        reason = 'not-near-edge';
      }
    }
  }

  edgeScroll.dx = dx;
  edgeScroll.dy = dy;
  applyAxisStopBuffer();

  if (edgeScroll.dx !== 0 || edgeScroll.dy !== 0) {
    startEdgeScroll();
  } else {
    stopEdgeScroll();
  }

  updateAutoscrollDebug({
    clientX: Math.round(clientX),
    clientY: Math.round(clientY),
    moveX: Math.round(edgeScroll.moveX),
    moveY: Math.round(edgeScroll.moveY),
    travelX: Math.round(edgeScroll.travelX),
    travelY: Math.round(edgeScroll.travelY),
    distLeft,
    distRight,
    distTop,
    distBottom,
    hiddenLeft: Math.round(hidden.left),
    hiddenRight: Math.round(hidden.right),
    hiddenUp: Math.round(hidden.up),
    hiddenDown: Math.round(hidden.down),
    dx: Math.round(edgeScroll.dx),
    dy: Math.round(edgeScroll.dy),
    reason
  });
}

function startEdgeScroll() {
  if (!canvasContainer || edgeScroll.rafId) return;
  setAutoscrollPageMode(true);

  const loop = () => {
    if (!isDrawing || !canvasContainer) {
      edgeScroll.rafId = null;
      stopEdgeScroll(true);
      return;
    }

    applyAxisStopBuffer();
    const stepX = edgeScroll.dx;
    const stepY = edgeScroll.dy;

    if (stepX === 0 && stepY === 0) {
      edgeScroll.rafId = null;
      updateAutoscrollDebug({ reason: 'loop-stop-buffer', dx: 0, dy: 0 });
      stopEdgeScroll(true);
      return;
    }

    applyAutoscrollStep(stepX, stepY);

    if (edgeScroll.pointerX != null && edgeScroll.pointerY != null) {
      extendActivePathAt(edgeScroll.pointerX, edgeScroll.pointerY);
    }

    edgeScroll.rafId = requestAnimationFrame(loop);
  };

  edgeScroll.rafId = requestAnimationFrame(loop);
}

function stopEdgeScroll(clearPointer = false) {
  edgeScroll.dx = 0;
  edgeScroll.dy = 0;
  setAutoscrollPageMode(false);

  if (clearPointer) {
    edgeScroll.travelX = 0;
    edgeScroll.travelY = 0;
    edgeScroll.moveX = 0;
    edgeScroll.moveY = 0;
    edgeScroll.pointerX = null;
    edgeScroll.pointerY = null;
  }

  if (edgeScroll.rafId) {
    cancelAnimationFrame(edgeScroll.rafId);
    edgeScroll.rafId = null;
  }

  if (clearPointer) {
    updateAutoscrollDebug({ reason: 'stopped', dx: 0, dy: 0 });
  }
}


function resetGameState() {
  showPaths = false;
  userPaths = {};
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
  isDrawing = false;
  isPanningBoard = false;
  pinchGesture = null;
  activePathId = null;
  lastCell = null;
  stopEdgeScroll(true);
  revealBtn.classList.remove('no-hint');
  revealBtn.innerHTML = `
    <svg id="hint-icon" viewBox="0 0 24 24" width="22" height="22">
      <path fill="currentColor" d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z" />
    </svg>
  `;
  revealBtn.disabled = false;
  updateTitle(false);
}

function generate() {
  let seed = seedInput.value.trim();
  let cols = gridSize;
  let hardMode = hardModeBtn.classList.contains('active');

  // Pattern: [Size][Mode][RandomPart] (e.g., 10HB7AQ66)
  const match = seed.match(/^(\d+)([HS])(.+)$/);
  if (match) {
    cols = parseInt(match[1]);
    hardMode = (match[2] === 'H');
    seed = match[3];

    // Update UI to match seed settings
    gridSize = cols;
    sizeDisplay.textContent = cols;
    if (hardMode) hardModeBtn.classList.add('active');
    else hardModeBtn.classList.remove('active');
  }

  // If input was empty or didn't have prefix, we use current UI settings
  if (!seed) {
    seed = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Unified seed for display/sharing
  const modeChar = hardMode ? 'H' : 'S';
  const displaySeed = `${cols}${modeChar}${seed}`;
  seedInput.value = displaySeed;
  seedDirty = false;

  // Treat the selected size as the actual play-grid column count.
  // Aspect ratio only affects the number of rows.
  const ratio = ASPECT_RATIOS[Settings.data.aspectRatio] || 1;
  const rows = Math.max(4, Math.round(cols * ratio));

  // Reset state and switch to a fresh empty grid immediately
  resetGameState();
  boardScale = 1;
  grid = new Grid(cols, rows);

  const random = new Random(seed);

  // Recalculate dynamic sizing for mobile
  CELL_SIZE = calculateCellSize(cols, rows);

  // Make dot size relative to grid size (use average or max of dims)
  const avgDim = (cols + rows) / 2;
  const dynamicRatio = 0.28 + ((avgDim - 5) / 15) * 0.10;
  DOT_RADIUS = CELL_SIZE * Math.min(0.38, Math.max(0.28, dynamicRatio));

  generateBtn.disabled = true;

  // Allow UI to update
  setTimeout(() => {
    try {
      const generator = new Generator(grid, {
        hardMode: hardMode,
        random: random
      });

      if (generator.generate()) {
        loadedSeed = displaySeed;
        for (let r = 0; r < grid.rows; r++) {
          for (let c = 0; c < grid.cols; c++) {
            if (grid.cells[r][c] === 0) grid.cells[r][c] = -1;
          }
        }
        draw();
      } else {
        console.warn('Failed to generate valid board. Try again.');
      }
    } catch (e) {
      console.error("Generation crashed:", e);
    } finally {
      generateBtn.disabled = false;
    }
  }, 50);
}

function draw() {
  if (!grid) return;

  const cols = grid.cols;
  const rows = grid.rows;
  const width = cols * CELL_SIZE + PADDING * 2;
  const height = rows * CELL_SIZE + PADDING * 2;
  boardBaseWidth = width;
  boardBaseHeight = height;

  // Handle High-DPI (Retina) scaling
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  updateCanvasDisplaySize();

  ctx.resetTransform();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, width, height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PADDING + c * CELL_SIZE;
      const y = PADDING + r * CELL_SIZE;
      const cellVal = grid.cells[r][c];

      if (cellVal === -1) {
        // Draw stone-like obstacle with rounded corners and shadow
        const padding = Math.max(2, CELL_SIZE * 0.08);
        const stoneX = x + padding;
        const stoneY = y + padding;
        const stoneSize = CELL_SIZE - padding * 2;
        const radius = stoneSize * 0.15;

        // Add variety by using cell position to vary appearance slightly
        const variation = (r * 7 + c * 11) % 3;

        // Shadow (offset down and right)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        roundRect(ctx, stoneX + 2, stoneY + 2, stoneSize, stoneSize, radius);
        ctx.fill();

        // Main stone body with gradient
        const gradient = ctx.createRadialGradient(
          stoneX + stoneSize / 3,
          stoneY + stoneSize / 3,
          0,
          stoneX + stoneSize / 2,
          stoneY + stoneSize / 2,
          stoneSize
        );

        // Vary stone colors slightly for natural look
        const baseColors = [
          ['#6a6a6a', '#3a3a3a'], // standard stone
          ['#5a6a5a', '#2a3a2a'], // mossy stone
          ['#6a5a5a', '#3a2a2a'], // earth stone
          ['#7a7a7a', '#4a4a4a']  // light stone
        ];
        const colorVar = (r * 13 + c * 7) % baseColors.length;
        const [light, dark] = baseColors[colorVar];

        gradient.addColorStop(0, light);
        gradient.addColorStop(1, dark);
        ctx.fillStyle = gradient;
        roundRect(ctx, stoneX, stoneY, stoneSize, stoneSize, radius);
        ctx.fill();

        // Add cracks
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 0.5;
        const crackCount = (r + c) % 3;
        for (let i = 0; i < crackCount; i++) {
          const startX = stoneX + (stoneSize * 0.2) + ((r * 11 + i * 13) % (stoneSize * 0.6));
          const startY = stoneY + (stoneSize * 0.2) + ((c * 17 + i * 19) % (stoneSize * 0.6));
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(startX + (Math.sin(r + i) * 5), startY + (Math.cos(c + i) * 5));
          ctx.stroke();
        }

        // Add moss spots (greenish patches)
        const mossCount = (r * 3 + c * 5) % 4 + 2;
        for (let i = 0; i < mossCount; i++) {
          const mossX = stoneX + padding + ((r * 31 + c * 7 + i * 13) % (stoneSize - padding * 2));
          const mossY = stoneY + padding + ((r * 7 + c * 31 + i * 17) % (stoneSize - padding * 2));
          const mossSize = 2 + (i % 3);

          ctx.fillStyle = variation === 1 ? 'rgba(80, 120, 60, 0.6)' : 'rgba(60, 90, 40, 0.4)';
          ctx.beginPath();
          ctx.arc(mossX, mossY, mossSize, 0, Math.PI * 2);
          ctx.fill();
        }

        // Highlight edge for 3D effect
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        roundRect(ctx, stoneX, stoneY, stoneSize, stoneSize, radius);
        ctx.stroke();
      } else {
        // Path ID exists
        // (No background needed, path drawn on top later)
      }
    }
  }

  // Draw Grid Lines (for occupied cells too)
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= cols; i++) {
    ctx.moveTo(PADDING + i * CELL_SIZE, PADDING);
    ctx.lineTo(PADDING + i * CELL_SIZE, PADDING + rows * CELL_SIZE);
  }
  for (let i = 0; i <= rows; i++) {
    ctx.moveTo(PADDING, PADDING + i * CELL_SIZE);
    ctx.lineTo(PADDING + cols * CELL_SIZE, PADDING + i * CELL_SIZE);
  }
  ctx.stroke();

  // Draw User Paths
  for (const pathId in userPaths) {
    const points = userPaths[pathId];
    if (points.length > 0) {
      const path = grid.paths.find(p => p.id === parseInt(pathId));
      if (path) {
        drawUserPath(points, path.color);
      }
    }
  }

  // Draw Solution Paths (if revealed) - NOW OVER user paths
  if (showPaths) {
    for (const path of grid.paths) {
      drawPathSegments(path);
    }
  }

  // Draw Dots (always on top)
  for (const path of grid.paths) {
    const start = path.points[0];
    const end = path.points[path.points.length - 1];
    drawDot(start[0], start[1], path.color, path.id);
    drawDot(end[0], end[1], path.color, path.id);
  }
}

function drawPathSegments(path) {
  const points = path.points;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.save();
  // Visual Polish: Hints are thinner and desaturated/distinguishable
  ctx.lineWidth = CELL_SIZE / 5;
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = path.color || '#fff';

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const x1 = PADDING + p1[1] * CELL_SIZE + CELL_SIZE / 2;
    const y1 = PADDING + p1[0] * CELL_SIZE + CELL_SIZE / 2;
    const x2 = PADDING + p2[1] * CELL_SIZE + CELL_SIZE / 2;
    const y2 = PADDING + p2[0] * CELL_SIZE + CELL_SIZE / 2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawUserPath(points, color) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = CELL_SIZE * 0.4; // Slightly thicker for user path
  ctx.strokeStyle = color;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const x1 = PADDING + p1[1] * CELL_SIZE + CELL_SIZE / 2;
    const y1 = PADDING + p1[0] * CELL_SIZE + CELL_SIZE / 2;
    const x2 = PADDING + p2[1] * CELL_SIZE + CELL_SIZE / 2;
    const y2 = PADDING + p2[0] * CELL_SIZE + CELL_SIZE / 2;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

// Helper to draw a rounded rectangle
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Helper to darken hex color
// amount is percentage (e.g., -20 for 20% darker)
function darkenColor(color, percent) {
  if (!color) return '#333';

  let num = parseInt(color.replace("#", ""), 16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt,
    B = (num >> 8 & 0x00FF) + amt,
    G = (num & 0x0000FF) + amt;

  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (B < 255 ? B < 1 ? 0 : B : 255) * 0x100 + (G < 255 ? G < 1 ? 0 : G : 255)).toString(16).slice(1);
}

function drawDot(r, c, color, pathId) {
  const x = PADDING + c * CELL_SIZE + CELL_SIZE / 2;
  const y = PADDING + r * CELL_SIZE + CELL_SIZE / 2;

  // Draw main dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();



  // Draw path number in center (scaled to fit inside dot)
  const fontSize = Math.floor(DOT_RADIUS * 1.15);
  ctx.fillStyle = '#000';
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw the text (nudged down slightly by 10% of radius for better visual centering)
  ctx.fillText(pathId.toString(), x, y + (DOT_RADIUS * 0.1));
}



async function forceUpdate() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }
    window.location.reload(true);
  } else {
    window.location.reload(true);
  }
}

init();

