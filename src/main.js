import { Grid } from './Grid.js';
import { Generator } from './Generator.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const sizeInput = document.getElementById('grid-size');
const generateBtn = document.getElementById('generate-btn');
const statusEl = document.getElementById('status');

let grid = null;

const CELL_SIZE = 50;
const DOT_RADIUS = 10;
const PADDING = 20;

function init() {
  generateBtn.addEventListener('click', generate);
  // Initial generation
  generate();
}

function generate() {
  const size = parseInt(sizeInput.value);
  if (size < 5 || size > 15) {
    alert("Size must be between 5 and 15");
    return;
  }

  statusEl.textContent = "Generating...";
  generateBtn.disabled = true;

  // Allow UI to update
  setTimeout(() => {
    const t0 = performance.now();
    grid = new Grid(size);
    const generator = new Generator(grid);

    let success = false;
    // Retry logic if it fails (randomness)
    for (let i = 0; i < 500; i++) {
      grid.reset();
      if (generator.generate()) {
        success = true;
        break;
      }
    }

    const t1 = performance.now();

    if (success) {
      statusEl.textContent = `Generated in ${Math.round(t1 - t0)}ms`;
      draw();
    } else {
      statusEl.textContent = "Failed to generate valid board. Try again.";
    }
    generateBtn.disabled = false;
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
        // Draw "Void" style: Gray with Black Diagonals
        ctx.fillStyle = '#444';
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Draw diagonals
        const step = CELL_SIZE / 4;
        for (let k = -CELL_SIZE; k < CELL_SIZE; k += step) {
          // diagonal /
          ctx.moveTo(x + k, y + CELL_SIZE);
          ctx.lineTo(x + CELL_SIZE + k, y);
        }
        ctx.stroke();

        // Border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
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

  // Draw Paths
  for (const path of grid.paths) {
    drawPath(path);
  }
}

function drawPath(path) {
  if (!path.points || path.points.length === 0) return;

  ctx.strokeStyle = path.color || '#fff';
  ctx.lineWidth = CELL_SIZE / 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();

  // Draw lines connecting points
  const points = path.points;
  for (let i = 0; i < points.length; i++) {
    const [r, c] = points[i];
    const x = PADDING + c * CELL_SIZE + CELL_SIZE / 2;
    const y = PADDING + r * CELL_SIZE + CELL_SIZE / 2;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw End Dots
  const start = points[0];
  const end = points[points.length - 1];

  drawDot(start[0], start[1], path.color);
  drawDot(end[0], end[1], path.color);
}

function drawDot(r, c, color) {
  const x = PADDING + c * CELL_SIZE + CELL_SIZE / 2;
  const y = PADDING + r * CELL_SIZE + CELL_SIZE / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Inner white dot for effect
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(x, y, DOT_RADIUS / 2, 0, Math.PI * 2);
  ctx.fill();
}

init();
