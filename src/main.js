import { Grid } from './Grid.js';
import { Generator } from './Generator.js';
import { Random } from './Random.js';
const SHOW_DEBUG = import.meta.env.VITE_SHOW_DEBUG === 'true';

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
const MIN_CELL_SIZE = 36; // Ensure grid can overflow for scrolling (v1.1.12)
const DOT_RADIUS_RATIO = 0.38;
const PADDING = 20;

const dpr = window.devicePixelRatio || 1;

// Dynamic values (recalculated on generate)
let CELL_SIZE = DEFAULT_CELL_SIZE;
let DOT_RADIUS = CELL_SIZE * DOT_RADIUS_RATIO;

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
  const maxWidth = availableWidth - PADDING * 2 - 30; // 30 extra for safety margin
  const maxHeight = availableHeight - 200; // Leave room for header/controls

  const cellW = Math.floor(maxWidth / cols);
  const cellH = Math.floor(maxHeight / rows);
  const bestFit = Math.min(cellW, cellH);
  return Math.max(MIN_CELL_SIZE, Math.min(bestFit, DEFAULT_CELL_SIZE));
}

function init() {
  console.log("Connect The Dots - v1.1.12 Initialized");

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
    if (e.touches.length > 1) {
      if (isDrawing) {
        isDrawing = false;
        activePathId = null;
        draw();
      }
      return;
    }
    const touch = e.touches[0];
    const started = handlePointerDown(touch);
    if (started && e.cancelable) {
      e.preventDefault();
      canvas.style.touchAction = 'none'; // Lock browser scroll while drawing
      document.body.classList.add('force-scroll');
    }
  };

  const onTouchMove = (e) => {
    if (e.touches.length > 1) {
      if (isDrawing) {
        isDrawing = false;
        activePathId = null;
        draw();
      }
      stopEdgeScroll();
      return;
    }
    const touch = e.touches[0];
    if (isDrawing) {
      if (e.cancelable) e.preventDefault();
      handlePointerMove(touch);
    }
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', (e) => { handlePointerUp(e); });
  window.addEventListener('touchcancel', (e) => { handlePointerUp(e); });

  // Populate build info version number
  if (buildInfoEl) {
    const buildNum = import.meta.env.VITE_BUILD_NUMBER || 'dev';
    buildInfoEl.textContent = `v1.1.12-${buildNum} (Tap to Update)`;
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
  const canvasX = x - rect.left - PADDING;
  const canvasY = y - rect.top - PADDING;

  const c = Math.floor(canvasX / CELL_SIZE);
  const r = Math.floor(canvasY / CELL_SIZE);

  if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) {
    return [r, c];
  }
  return null;
}

function handlePointerDown(e) {
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
      draw();
      return true;
    }
  }
  return false;
}

function handlePointerMove(e) {
  if (!isDrawing || !activePathId) return;

  const cell = getCellFromCoords(e.clientX, e.clientY);
  if (isDrawing) {
    checkEdgeScroll(e);
  }
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
  document.body.classList.remove('force-scroll');
  stopEdgeScroll();
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


function resetGameState() {
  showPaths = false;
  userPaths = {};
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
  isDrawing = false;
  activePathId = null;
  lastCell = null;
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

  // Calculate cols/rows to maintain the aspect ratio while keeping
  // total cells near gridSize² — the stable generator's sweet spot.
  // cols * (cols * ratio) = gridSize²  →  cols = gridSize / sqrt(ratio)
  const ratio = ASPECT_RATIOS[Settings.data.aspectRatio] || 1;
  cols = Math.max(4, Math.floor(cols / Math.sqrt(ratio)));
  const rows = Math.max(4, Math.round(cols * ratio));

  // Reset state and switch to a fresh empty grid immediately
  resetGameState();
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

  // Handle High-DPI (Retina) scaling
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

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



// ──────────────────────────────────────────────────────────
// Mobile Edge-Drag Auto-Scroll
// When a finger is close to a screen edge while drawing, we
// automatically scroll the canvas container so the user can
// reach dots that are off-screen without lifting their finger.
// ──────────────────────────────────────────────────────────
const EDGE_ZONE = 100;      // Increased for better sensitivity (v1.1.5)
const MAX_SCROLL_SPEED = 18; // px per animation frame

const edgeScroll = { rafId: null, dx: 0, dy: 0, active: false };

function checkEdgeScroll(touch) {
  // Use visualViewport for absolute screen edges even when zoomed
  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;

  const x = touch.clientX;
  const y = touch.clientY;

  let dx = 0;
  let dy = 0;

  if (x < EDGE_ZONE) {
    dx = -MAX_SCROLL_SPEED * (1 - x / EDGE_ZONE) * 1.5;
  } else if (x > vw - EDGE_ZONE) {
    dx = MAX_SCROLL_SPEED * (1 - (vw - x) / EDGE_ZONE) * 1.5;
  }

  if (y < EDGE_ZONE) {
    dy = -MAX_SCROLL_SPEED * (1 - y / EDGE_ZONE) * 1.5;
  } else if (y > vh - EDGE_ZONE) {
    dy = MAX_SCROLL_SPEED * (1 - (vh - y) / EDGE_ZONE) * 1.5;
  }

  edgeScroll.dx = dx;
  edgeScroll.dy = dy;
  if (SHOW_DEBUG) {
    updateDebugDot(x, y);
    updateDebugLog(x, y, vw, vh, dx, dy);
  }

  if (dx !== 0 || dy !== 0) {
    if (SHOW_DEBUG) {
      showEdgeIndicator(dx, dy);
    }
    if (!edgeScroll.active) {
      edgeScroll.active = true;
    }
    if (!edgeScroll.rafId) {
      const loop = () => {
        if (edgeScroll.dx !== 0 || edgeScroll.dy !== 0) {
          let scrolledX = false;
          let scrolledY = false;

          // ───────── LAYER 1: Canvas Container ─────────
          if (canvasContainer) {
            const oldX = canvasContainer.scrollLeft;
            const oldY = canvasContainer.scrollTop;
            
            if (edgeScroll.dx !== 0) {
              canvasContainer.scrollLeft += edgeScroll.dx;
              if (Math.abs(canvasContainer.scrollLeft - oldX) > 0.5) scrolledX = true;
            }
            if (edgeScroll.dy !== 0) {
              canvasContainer.scrollTop += edgeScroll.dy;
              if (Math.abs(canvasContainer.scrollTop - oldY) > 0.5) scrolledY = true;
            }
          }

          // ───────── LAYER 2: Document Scrolling Element ─────────
          const scroller = document.scrollingElement || document.documentElement;
          if ((edgeScroll.dx !== 0 && !scrolledX) || (edgeScroll.dy !== 0 && !scrolledY)) {
            const oldWX = scroller.scrollLeft;
            const oldWY = scroller.scrollTop;
            
            scroller.scrollBy(
              scrolledX ? 0 : edgeScroll.dx,
              scrolledY ? 0 : edgeScroll.dy
            );
            
            if (!scrolledX && Math.abs(scroller.scrollLeft - oldWX) > 0.5) scrolledX = true;
            if (!scrolledY && Math.abs(scroller.scrollTop - oldWY) > 0.5) scrolledY = true;
          }

          // ───────── LAYER 3: Window Direct (Final Fallback) ─────────
          if ((edgeScroll.dx !== 0 && !scrolledX) || (edgeScroll.dy !== 0 && !scrolledY)) {
            window.scrollBy(
              scrolledX ? 0 : edgeScroll.dx,
              scrolledY ? 0 : edgeScroll.dy
            );
          }
          
          edgeScroll.rafId = requestAnimationFrame(loop);
        } else {
          edgeScroll.rafId = null;
        }
      };
      edgeScroll.rafId = requestAnimationFrame(loop);
    }
  } else {
    stopEdgeScroll();
  }
}

function updateDebugLog(x, y, vw, vh, dx, dy) {
  if (!SHOW_DEBUG) return;
  let log = document.getElementById('debug-log');
  if (!log) {
    log = document.createElement('div');
    log.id = 'debug-log';
    log.style.position = 'fixed';
    log.style.top = '5px';
    log.style.left = '5px';
    log.style.backgroundColor = 'rgba(0,0,0,0.7)';
    log.style.color = '#0f0';
    log.style.padding = '5px';
    log.style.fontSize = '10px';
    log.style.fontFamily = 'monospace';
    log.style.zIndex = '10001';
    log.style.pointerEvents = 'none';
    document.body.appendChild(log);
  }
  const scX = window.scrollX || document.documentElement.scrollLeft;
  const scY = window.scrollY || document.documentElement.scrollTop;
  const cScX = canvasContainer ? canvasContainer.scrollLeft : 0;
  const cScY = canvasContainer ? canvasContainer.scrollTop : 0;

  const vv = window.visualViewport;
  log.innerHTML = `V: 1.1.12 | Draw: ${isDrawing}<br>
                   Touch: ${Math.round(x)}, ${Math.round(y)}<br>
                   WinScroll: ${Math.round(scX)}, ${Math.round(scY)}<br>
                   ContScroll: ${Math.round(cScX)}, ${Math.round(cScY)}<br>
                   Dims: ${canvasContainer ? canvasContainer.scrollWidth : 0} / ${canvasContainer ? canvasContainer.clientWidth : 0}<br>
                   Scale: ${vv ? vv.scale.toFixed(2) : 1.0}<br>
                   Speed: ${dx.toFixed(1)}, ${dy.toFixed(1)}`;
}

function updateDebugDot(x, y) {
  if (!SHOW_DEBUG) return;
  let dot = document.getElementById('debug-dot');
  if (!dot) {
    dot = document.createElement('div');
    dot.id = 'debug-dot';
    dot.style.position = 'fixed';
    dot.style.width = '10px';
    dot.style.height = '10px';
    dot.style.background = 'red';
    dot.style.borderRadius = '50%';
    dot.style.pointerEvents = 'none';
    dot.style.zIndex = '10000';
    dot.style.display = 'none';
    document.body.appendChild(dot);
  }
  if (isDrawing) {
    dot.style.display = 'block';
    dot.style.left = (x - 5) + 'px';
    dot.style.top = (y - 5) + 'px';
  } else {
    dot.style.display = 'none';
  }
}

function showEdgeIndicator(dx, dy) {
  let indicator = document.getElementById('edge-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'edge-indicator';
    indicator.style.position = 'fixed';
    indicator.style.top = '0';
    indicator.style.left = '0';
    indicator.style.width = '100vw';
    indicator.style.height = '100vh';
    indicator.style.pointerEvents = 'none';
    indicator.style.zIndex = '9999';
    indicator.style.transition = 'box-shadow 0.1s';
    document.body.appendChild(indicator);
  }

  let shadow = '';
  const color = 'rgba(64, 156, 255, 0.5)'; // Brighter blue
  const size = '50px';
  if (dy < 0) shadow += `inset 0 ${size} ${size} -${size} ${color}, `;
  if (dy > 0) shadow += `inset 0 -${size} ${size} -${size} ${color}, `;
  if (dx < 0) shadow += `inset ${size} 0 ${size} -${size} ${color}, `;
  if (dx > 0) shadow += `inset -${size} 0 ${size} -${size} ${color}, `;

  indicator.style.boxShadow = shadow.trim().replace(/,$/, '');
}

function stopEdgeScroll() {
  edgeScroll.dx = 0;
  edgeScroll.dy = 0;
  edgeScroll.active = false;
  // Note: touchAction is restored in handlePointerUp, not here,
  // to prevent standard scroll from kicking in while still drawing.
  const indicator = document.getElementById('edge-indicator');
  if (indicator) indicator.style.boxShadow = 'none';
  if (SHOW_DEBUG) {
    const dot = document.getElementById('debug-dot');
    if (dot) dot.style.display = 'none';
    const log = document.getElementById('debug-log');
    if (log) log.style.display = 'none';
  }

  if (edgeScroll.rafId) {
    cancelAnimationFrame(edgeScroll.rafId);
    edgeScroll.rafId = null;
  }
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

