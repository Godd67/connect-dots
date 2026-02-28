import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createCanvas } from 'canvas';
import { Grid } from './src/Grid.js';
import { Generator } from './src/Generator.js';
import { Random } from './src/Random.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const API_TOKEN = process.env.DOTS_API_TOKEN;

if (!API_TOKEN) {
    console.error('FATAL ERROR: DOTS_API_TOKEN is not defined in environment variables.');
    process.exit(1);
}

app.use(cors());
app.use(express.json());

// Middleware for Seed Tracking and Traceability
app.use((req, res, next) => {
    // Determine seed from various possible sources
    req.seed = req.query.seed || (req.body && req.body.seed) || req.headers['x-seed'] || Math.random().toString(36).substring(2, 8).toUpperCase();

    res.setHeader('X-Seed', req.seed);
    next();
});

// Auth middleware
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // Constant-time-like comparison or at least strict check
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== API_TOKEN) {
        console.warn(`Unauthorized access attempt [Seed: ${req.seed}] from IP: ${req.ip}`);
        return res.status(401).json({
            error: 'Unauthorized',
            seed: req.seed
        });
    }

    // Success: We can signal identity safely now that we know the client is authorized
    res.setHeader('X-Dots-Identity', API_TOKEN);
    next();
};

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', seed: req.seed });
});

app.get('/api/getPuzzle', auth, (req, res) => {
    const cols = parseInt(req.query.cols || req.query.size);
    const rows = parseInt(req.query.rows || cols);
    const modeStr = req.query.mode || 'normal';

    // Validation
    if (isNaN(cols) || cols < 5 || cols > 20 || isNaN(rows) || rows < 5 || rows > 35) {
        return res.status(400).json({ error: 'Invalid dimensions. Cols [5-20], Rows [5-35].' });
    }
    if (modeStr !== 'normal' && modeStr !== 'hard') {
        return res.status(400).json({ error: 'Invalid mode. Must be "normal" or "hard".' });
    }

    const mode = modeStr === 'hard';
    const seed = req.seed; // Use the seed from traceability middleware

    const grid = new Grid(cols, rows);
    const random = new Random(seed);
    const generator = new Generator(grid, {
        hardMode: mode,
        random: random
    });

    if (generator.generate()) {
        const dotPairs = grid.paths.map(path => ({
            id: path.id,
            color: path.color,
            start: path.points[0],
            end: path.points[path.points.length - 1]
        }));

        const stones = [];
        for (let r = 0; r < grid.rows; r++) {
            for (let c = 0; c < grid.cols; c++) {
                if (grid.cells[r][c] === 0) {
                    stones.push([r, c]);
                }
            }
        }

        res.json({
            cols,
            rows,
            mode: mode ? 'hard' : 'normal',
            seed,
            dotPairs,
            stones
        });
    } else {
        res.status(500).json({ error: 'Failed to generate puzzle' });
    }
});

app.post('/api/validatePuzzle', auth, (req, res) => {
    const cols = parseInt(req.body.cols || req.body.size);
    const rows = parseInt(req.body.rows || cols);
    const seed = req.seed;

    if (!cols || !paths) {
        return res.status(400).json({ error: 'Missing size/cols or paths', seed });
    }

    if (isNaN(cols) || cols < 5 || cols > 20 || isNaN(rows) || rows < 5 || rows > 35) {
        return res.status(400).json({ error: 'Invalid dimensions.', seed });
    }

    // Verify paths against the seed (re-generate the grid)
    const gridRef = new Grid(cols, rows);
    const randomRef = new Random(seed);
    const generatorRef = new Generator(gridRef, { hardMode: false, random: randomRef });
    generatorRef.generate();

    const stones = userStones || [];
    if (!userStones) {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (gridRef.cells[r][c] === 0) stones.push([r, c]);
            }
        }
    }

    // Drawing constants
    const CELL_SIZE = 50;
    const PADDING = 20;
    const width = cols * CELL_SIZE + PADDING * 2;
    const height = rows * CELL_SIZE + PADDING * 2;
    const DOT_RADIUS_RATIO = 0.38;
    const DOT_RADIUS = CELL_SIZE * DOT_RADIUS_RATIO;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
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

    // Draw stones
    stones.forEach(([r, c]) => {
        const x = PADDING + c * CELL_SIZE;
        const y = PADDING + r * CELL_SIZE;
        const padding = Math.max(2, CELL_SIZE * 0.08);
        const stoneX = x + padding;
        const stoneY = y + padding;
        const stoneSize = CELL_SIZE - padding * 2;

        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.roundRect(stoneX, stoneY, stoneSize, stoneSize, stoneSize * 0.15);
        ctx.fill();
    });

    // Draw paths
    paths.forEach(path => {
        if (!path.points || path.points.length < 2) return;

        ctx.strokeStyle = path.color || '#fff';
        ctx.lineWidth = CELL_SIZE / 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        const [startR, startC] = path.points[0];
        ctx.moveTo(PADDING + startC * CELL_SIZE + CELL_SIZE / 2, PADDING + startR * CELL_SIZE + CELL_SIZE / 2);

        for (let i = 1; i < path.points.length; i++) {
            const [r, c] = path.points[i];
            ctx.lineTo(PADDING + c * CELL_SIZE + CELL_SIZE / 2, PADDING + r * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke();

        // Dots at endpoints
        const start = path.points[0];
        const end = path.points[path.points.length - 1];

        [start, end].forEach(([r, c]) => {
            const x = PADDING + c * CELL_SIZE + CELL_SIZE / 2;
            const y = PADDING + r * CELL_SIZE + CELL_SIZE / 2;

            ctx.fillStyle = path.color || '#fff';
            ctx.beginPath();
            ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    });

    const buffer = canvas.toBuffer('image/png');
    res.set('Content-Type', 'image/png');
    res.send(buffer);
});

app.listen(port, () => {
    console.log(`Dots server listening at http://localhost:${port}`);
});
