import { Grid } from './Grid.js';
import { Generator } from './Generator.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const generateBtn = document.getElementById('generate-btn');
const revealBtn = document.getElementById('reveal-btn');
const statusEl = document.getElementById('status');
const sizeDisplay = document.getElementById('grid-size-display');
const sizeDecreaseBtn = document.getElementById('size-decrease');
const sizeIncreaseBtn = document.getElementById('size-increase');

let gridSize = 5; // Current grid size

let grid = null;
let showPaths = false;
let userPaths = {}; // { pathId: [[r,c], [r,c], ...] }
let isDrawing = false;
let activePathId = null;
let lastCell = null; // [r, c] last cell user touched

// Rendering constants
const DEFAULT_CELL_SIZE = 50;
const DOT_RADIUS_RATIO = 0.32; // DOT_RADIUS as ratio of CELL_SIZE
const PADDING = 20;

// Dynamic values (recalculated on generate)
let CELL_SIZE = DEFAULT_CELL_SIZE;
let DOT_RADIUS = CELL_SIZE * DOT_RADIUS_RATIO;

function isMobile() {
  return window.innerWidth <= 768;
}

function calculateCellSize(gridSize) {
  if (!isMobile()) return DEFAULT_CELL_SIZE;
  const maxWidth = window.innerWidth - PADDING * 2 - 20; // 20 extra for safety margin
  return Math.floor(maxWidth / gridSize);
}

function init() {
  generateBtn.addEventListener('click', generate);
  revealBtn.addEventListener('click', toggleReveal);

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

  // Mouse Events
  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);

  // Touch Events
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handlePointerDown(touch);
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handlePointerMove(touch);
  }, { passive: false });

  window.addEventListener('touchend', handlePointerUp);

  // Colorize title
  colorizeTitle();

  // Initial generation
  generate();
}

function colorizeTitle() {
  const titleSpan = document.getElementById('title-colored');
  if (!titleSpan) return;

  const text = titleSpan.textContent;
  titleSpan.innerHTML = '';

  for (let i = 0; i < text.length; i++) {
    const span = document.createElement('span');
    span.textContent = text[i];
    if (text[i] !== ' ') {
      const hue = (i * 137.5) % 360;
      span.style.color = `hsl(${hue}, 85%, 60%)`;
    }
    titleSpan.appendChild(span);
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
  if (!grid) return;
  const cell = getCellFromCoords(e.clientX, e.clientY);
  if (!cell) return;

  const [r, c] = cell;
  const pathId = grid.cells[r][c];

  // Only start drawing if we clicked on an endpoint dot
  if (pathId > 0) {
    const path = grid.paths.find(p => p.id === pathId);
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
    }
  }
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
    if (cellVal === 0 && !isTargetDot) {
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
    statusEl.textContent = "PUZZLE SOLVED! WELL DONE!";
    statusEl.style.color = "#4CAF50";
    statusEl.style.fontWeight = "bold";
  }
}

function toggleReveal() {
  showPaths = !showPaths;
  revealBtn.textContent = showPaths ? "Hide Paths" : "Reveal Paths";
  draw();
}

function generate() {
  const size = gridSize;

  // Recalculate dynamic sizing for mobile
  CELL_SIZE = calculateCellSize(size);
  DOT_RADIUS = CELL_SIZE * DOT_RADIUS_RATIO;

  statusEl.textContent = "Generating...";
  generateBtn.disabled = true;

  // Allow UI to update
  setTimeout(() => {
    try {
      const t0 = performance.now();
      grid = new Grid(size);
      const generator = new Generator(grid);

      let success = false;
      // Single attempt (Generator handles its own 500 retries)
      if (generator.generate()) {
        success = true;
      }

      const t1 = performance.now();

      if (success) {
        statusEl.textContent = `Generated in ${Math.round(t1 - t0)}ms`;
        draw();
        renderColorLegend();
      } else {
        statusEl.textContent = "Failed to generate valid board. Try again.";
      }
    } catch (e) {
      console.error("Generation crashed:", e);
      statusEl.textContent = "Error: " + e.message;
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

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, width, height);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const x = PADDING + c * CELL_SIZE;
      const y = PADDING + r * CELL_SIZE;
      const cellVal = grid.cells[r][c];

      if (cellVal === 0) {
        // Draw stone-like obstacle with rounded corners and shadow
        const padding = 4;
        const stoneX = x + padding;
        const stoneY = y + padding;
        const stoneSize = CELL_SIZE - padding * 2;
        const radius = 8;

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
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= size; i++) {
    ctx.moveTo(PADDING + i * CELL_SIZE, PADDING);
    ctx.lineTo(PADDING + i * CELL_SIZE, PADDING + size * CELL_SIZE);

    ctx.moveTo(PADDING, PADDING + i * CELL_SIZE);
    ctx.lineTo(PADDING + size * CELL_SIZE, PADDING + i * CELL_SIZE);
  }
  ctx.stroke();

  // Draw Solution Paths (if revealed)
  if (showPaths) {
    for (const path of grid.paths) {
      drawPathSegments(path);
    }
  }

  // Draw User Paths
  for (const pathId in userPaths) {
    const points = userPaths[pathId];
    if (points.length > 0) {
      const path = grid.paths.find(p => p.id === parseInt(pathId));
      drawUserPath(points, path.color);
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
  const types = path.pointTypes || new Array(points.length).fill(0);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

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
    ctx.lineWidth = CELL_SIZE / 3;
    ctx.strokeStyle = path.color || '#fff';
    ctx.stroke();
  }
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

  // Add border for better visibility
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(1, DOT_RADIUS / 8);
  ctx.stroke();

  // Draw path number in center (scaled to fit inside dot)
  const fontSize = Math.max(10, Math.floor(DOT_RADIUS * 0.9));
  ctx.fillStyle = '#000';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pathId.toString(), x, y);
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

init();
