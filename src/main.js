import { Grid } from './Grid.js';
import { Generator } from './Generator.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const generateBtn = document.getElementById('generate-btn');
const revealBtn = document.getElementById('reveal-btn');
const sizeDisplay = document.getElementById('grid-size-display');
const sizeDecreaseBtn = document.getElementById('size-decrease');
const sizeIncreaseBtn = document.getElementById('size-increase');
const hardModeCb = document.getElementById('hard-mode-cb');
const resetBtn = document.getElementById('reset-btn');

// Level Code UI
const levelCodeInput = document.getElementById('level-code-input');
const loadCodeBtn = document.getElementById('load-code-btn');
const copyCodeBtn = document.getElementById('copy-code-btn');

// Settings UI
const settingsModal = document.getElementById('settings-modal');
const settingsOpenBtn = document.getElementById('settings-open-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');

const settingDefaultSize = document.getElementById('setting-default-size');
const settingApplause = document.getElementById('setting-applause');
const settingNav = document.getElementById('setting-nav');

// Settings Management
const Settings = {
  data: {
    defaultGridSize: 10,
    applauseSound: true,
    navMode: 'drag'
  },

  load() {
    const saved = localStorage.getItem('dots-settings');
    if (saved) {
      try {
        this.data = { ...this.data, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
    this.applyToUI();
  },

  save() {
    localStorage.setItem('dots-settings', JSON.stringify(this.data));
  },

  applyToUI() {
    settingDefaultSize.value = this.data.defaultGridSize;
    settingApplause.checked = this.data.applauseSound;
    settingNav.value = this.data.navMode;
  },

  syncFromUI() {
    this.data.defaultGridSize = parseInt(settingDefaultSize.value) || 10;
    this.data.applauseSound = settingApplause.checked;
    this.data.navMode = settingNav.value;
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

// Rendering constants
const DEFAULT_CELL_SIZE = 50;
const DOT_RADIUS_RATIO = 0.38; // Increased from 0.32 to fit numbers better
const PADDING = 20;

const dpr = window.devicePixelRatio || 1;

// Dynamic values (recalculated on generate)
let CELL_SIZE = DEFAULT_CELL_SIZE;
let DOT_RADIUS = CELL_SIZE * DOT_RADIUS_RATIO;

function isMobile() {
  return window.innerWidth <= 768;
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

function calculateCellSize(gridSize) {
  if (!isMobile()) return DEFAULT_CELL_SIZE;
  const availableWidth = document.documentElement.clientWidth || window.innerWidth;
  const maxWidth = availableWidth - PADDING * 2 - 30; // 30 extra for safety margin
  return Math.floor(maxWidth / gridSize);
}

function init() {
  generateBtn.addEventListener('click', generate);

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
    }
  });

  sizeIncreaseBtn.addEventListener('click', () => {
    if (gridSize < 20) {
      gridSize++;
      sizeDisplay.textContent = gridSize;
    }
  });

  resetBtn.addEventListener('click', () => {
    userPaths = {};
    draw();
  });


  loadCodeBtn.addEventListener('click', loadLevelCode);
  copyCodeBtn.addEventListener('click', () => {
    levelCodeInput.select();
    navigator.clipboard.writeText(levelCodeInput.value).then(() => {
      const originalText = copyCodeBtn.textContent;
      copyCodeBtn.textContent = 'Copied!';
      setTimeout(() => copyCodeBtn.textContent = originalText, 1500);
    });
  });

  // Settings Events
  settingsOpenBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  settingsCloseBtn.addEventListener('click', () => {
    Settings.syncFromUI();
    settingsModal.classList.add('hidden');
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
  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);

  // Mobile Touch Events
  // Mobile Touch Events
  const onTouchStart = (e) => {
    if (e.touches.length > 1) {
      if (isDrawing) {
        isDrawing = false;
        activePathId = null;
        draw();
      }
      return; // Never preventDefault on multi-touch
    }

    // Single touch
    const touch = e.touches[0];
    const started = handlePointerDown(touch);

    // ONLY preventDefault if we actually hit a dot and started drawing.
    // This is crucial: it lets the browser handle scroll/zoom if we touch empty space.
    if (started) {
      if (e.cancelable) e.preventDefault();
    }
  };

  const onTouchMove = (e) => {
    if (e.touches.length > 1) {
      if (isDrawing) {
        isDrawing = false;
        activePathId = null;
        draw();
      }
      return;
    }

    if (isDrawing) {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      handlePointerMove(touch);
    }
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', handlePointerUp);
  window.addEventListener('touchcancel', handlePointerUp);



  // Populate build info
  const buildInfoEl = document.getElementById('build-info');
  if (buildInfoEl) {
    const buildNum = import.meta.env.VITE_BUILD_NUMBER || 'dev';
    buildInfoEl.textContent = `v1.0.0-${buildNum}`;
  }

  // Initial generation
  generate();
  // Ensure title is correct initially
  updateTitle(false);
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

  if (r >= 0 && r < grid.size && c >= 0 && c < grid.size) {
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
      }
    }
    checkWin();
  }
  isDrawing = false;
  activePathId = null;
  lastCell = null;
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
    exportLevelCode();
    playApplause();
  }
}


function resetGameState() {
  showPaths = false;
  userPaths = {};
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
  const size = gridSize;

  // Reset state and switch to a fresh empty grid immediately
  resetGameState();
  grid = new Grid(size);

  // Recalculate dynamic sizing for mobile
  CELL_SIZE = calculateCellSize(size);

  // Make dot size relative to grid size (smaller ratio for smaller grids to avoid "clunky" look)
  // 5x5 -> 0.28, 20x20 -> 0.38
  const dynamicRatio = 0.28 + ((size - 5) / 15) * 0.10;
  DOT_RADIUS = CELL_SIZE * Math.min(0.38, Math.max(0.28, dynamicRatio));

  generateBtn.disabled = true;
  generateBtn.disabled = true;



  // Allow UI to update
  setTimeout(() => {
    try {
      const t0 = performance.now();
      const generator = new Generator(grid, { hardMode: hardModeCb.checked });

      let success = false;
      if (generator.generate()) {
        success = true;
      }

      const t1 = performance.now();

      if (success) {
        // Explicitly mark stones in generated grid as -1
        for (let r = 0; r < grid.size; r++) {
          for (let c = 0; c < grid.size; c++) {
            if (grid.cells[r][c] === 0) grid.cells[r][c] = -1;
          }
        }
        draw();
        renderColorLegend();
        exportLevelCode();
      } else {
        console.error("Failed to generate valid board. Try again.");
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

  const size = grid.size;
  const width = size * CELL_SIZE + PADDING * 2;
  const height = size * CELL_SIZE + PADDING * 2;

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

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
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
  for (let i = 0; i <= size; i++) {
    ctx.moveTo(PADDING + i * CELL_SIZE, PADDING);
    ctx.lineTo(PADDING + i * CELL_SIZE, PADDING + size * CELL_SIZE);

    ctx.moveTo(PADDING, PADDING + i * CELL_SIZE);
    ctx.lineTo(PADDING + size * CELL_SIZE, PADDING + i * CELL_SIZE);
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

function renderColorLegend() {
  const legendEl = document.getElementById('color-legend');
  if (!grid || !legendEl) return;

  legendEl.innerHTML = '<h3>Path Colors</h3>';

  const legendContainer = document.createElement('div');
  legendContainer.style.display = 'flex';
  legendContainer.style.flexWrap = 'wrap';
  legendContainer.style.gap = '10px';
  legendContainer.style.marginTop = '10px';

  grid.paths.forEach(path => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '8px';
    item.style.padding = '5px 10px';
    item.style.backgroundColor = '#333';
    item.style.borderRadius = '4px';

    const swatch = document.createElement('div');
    swatch.style.width = '24px';
    swatch.style.height = '24px';
    swatch.style.backgroundColor = path.color;
    swatch.style.borderRadius = '50%';
    swatch.style.border = '2px solid #555';

    const label = document.createElement('span');
    label.style.color = '#fff';
    label.style.fontSize = '12px';
    label.textContent = path.color;

    item.appendChild(swatch);
    item.appendChild(label);
    legendContainer.appendChild(item);
  });

  legendEl.appendChild(legendContainer);
}

// ------------------------------------
// Level Code Logic (Base36)
// ------------------------------------

function toBase36(n) {
  return n.toString(36);
}

function fromBase36(char) {
  return parseInt(char, 36);
}

function exportLevelCode() {
  if (!grid) return;
  // Code Format: [Size][Coords]-[StoneBitmask]
  let code = toBase36(grid.size);

  grid.paths.forEach(p => {
    const start = p.points[0];
    const end = p.points[p.points.length - 1];
    code += toBase36(start[0]) + toBase36(start[1]) + toBase36(end[0]) + toBase36(end[1]);
  });

  // Bitmask: 1 bit per cell (1=Stone, 0=Empty/Dot)
  let bits = "";
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      // Stones are marked as -1
      bits += (grid.cells[r][c] === -1 ? "1" : "0");
    }
  }
  // Pad to be multiple of 5 for Base36 encoding
  while (bits.length % 5 !== 0) bits += "0";

  let bitmaskString = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5);
    bitmaskString += parseInt(chunk, 2).toString(36);
  }

  levelCodeInput.value = code + "-" + bitmaskString;
}

function loadLevelCode() {
  const fullCode = levelCodeInput.value.trim();
  if (!fullCode) return;

  const [code, bitmask] = fullCode.split("-");

  try {
    const size = fromBase36(code[0]);
    if (isNaN(size) || size < 5 || size > 20) throw new Error("Invalid grid size");

    // Reset Game State
    resetGameState();
    grid = new Grid(size);
    grid.isImported = true;

    CELL_SIZE = calculateCellSize(size);
    const dynamicRatio = 0.28 + ((size - 5) / 15) * 0.10;
    DOT_RADIUS = CELL_SIZE * Math.min(0.38, Math.max(0.28, dynamicRatio));

    // 1. Parse Stones from bitmask if present
    if (bitmask) {
      let bits = "";
      for (let char of bitmask) {
        bits += parseInt(char, 36).toString(2).padStart(5, "0");
      }
      let bitIdx = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (bits[bitIdx] === "1") {
            grid.cells[r][c] = -1;
          }
          bitIdx++;
        }
      }
    }

    // 2. Parse Paths (Chunks of 4)
    const body = code.substring(1);
    // Be robust: coords might not be a multiple of 4 if the code is truncated, but we try anyway
    const colors = [
      '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffa500', '#800080', '#008000', '#000080',
      '#ffc0cb', '#a52a2a', '#808080', '#ffffff', '#ffd700', '#4b0082', '#40e0d0', '#fa8072', '#ffe4e1', '#d2b48c'
    ];

    let pathId = 1;
    for (let i = 0; i < body.length; i += 4) {
      if (i + 3 >= body.length) break;
      const coords = [body[i], body[i + 1], body[i + 2], body[i + 3]].map(fromBase36);
      if (coords.some(v => isNaN(v) || v < 0 || v >= size)) throw new Error("Invalid coordinate");

      const [r1, c1, r2, c2] = coords;
      const color = colors[(pathId - 1) % colors.length];

      grid.cells[r1][c1] = pathId;
      grid.cells[r2][c2] = pathId;

      grid.paths.push({
        id: pathId,
        color: color,
        points: [[r1, c1], [r2, c2]],
        isFiller: false
      });
      pathId++;
    }

    gridSize = size;
    sizeDisplay.textContent = size;

    // Must call draw() to properly resize canvas before other UI updates
    draw();
    renderColorLegend();
    updateTitle(false);

    // Disable Hint for imported levels as their full paths are unknown
    revealBtn.classList.add('no-hint');
    revealBtn.innerHTML = `
      <svg id="hint-icon" viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M11.83,9L15,12.16C15,12.11 15,12.05 15,12A3,3 0 0,0 12,9C11.94,9 11.89,9 11.83,9M7.53,9.8L9.08,11.35C9.03,11.56 9,11.77 9,12A3,3 0 0,0 12,15C12.22,15 12.44,14.97 12.65,14.92L14.2,16.47C13.53,16.8 12.79,17 12,17A5,5 0 0,1 7,12C7,11.21 7.2,10.47 7.53,9.8M2,4.27L4.28,6.55L4.73,7C3.08,8.3 1.78,10 1,12C2.73,16.39 7,19.5 12,19.5C13.55,19.5 15.03,19.2 16.38,18.66L16.81,19.08L19.73,22L21,20.73L3.27,3M12,7A5,5 0 0,1 17,12C17,12.64 16.87,13.26 16.64,13.82L19.57,16.75C21.07,15.5 22.27,13.86 23,12C21.27,7.61 17,4.5 12,4.5C10.6,4.5 9.26,4.75 8,5.2L10.17,7.35C10.74,7.13 11.35,7 12,7Z" />
      </svg>
    `;
    revealBtn.disabled = true;

    // Force a redraw after a short delay to ensure canvas is properly sized
    setTimeout(() => draw(), 10);

  } catch (e) {
    console.error(e);
    alert("Invalid Level Code: " + e.message);
  }
}


init();
