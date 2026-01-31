import { Grid } from './Grid.js';

export class Generator {
    constructor(grid) {
        this.grid = grid;
    }

    generate() {
        // Global retry loop for the entire grid generation
        for (let attempt = 0; attempt < 500; attempt++) {
            this.grid.reset();

            // Phase 1: Generative greedy placement
            if (this.fillGreedy()) {
                // Phase 2: Linear Expansion (Momentum based)
                this.expandPathsLinear();

                // Phase 3: Prune "dumb" geometric loops (optimization)
                // This is the FINAL step to ensure no artifacts remain.
                this.tightenPaths();

                // Phase 4: Re-Expand Linear
                // Re-filling voids created by tightening, but STRICTLY linearly to avoid loops.
                this.expandPathsLinear();

                // Phase 5: Final Validation
                if (this.validateGrid()) {
                    console.log(`Generated valid grid on attempt ${attempt + 1}`);
                    return true;
                }
            }
        }
        return false;
    }

    fillGreedy() {
        let failures = 0;
        let attempts = 0;
        const maxAttempts = 1000;

        while (failures < 50 && attempts < maxAttempts) {
            attempts++;
            if (this.addPair()) {
                failures = 0;
            } else {
                failures++;
            }
        }
        return this.grid.paths.length > 1;
    }

    // Aggressive optimization: Reroute paths to be as short as possible
    tightenPaths() {
        let improved = true;
        while (improved) {
            improved = false;
            // Iterate all paths
            for (const path of this.grid.paths) {
                // 1. Clear this path from the grid temporarily
                for (const [r, c] of path.points) {
                    this.grid.setCell(r, c, 0);
                }

                // 2. Find the absolute shortest path now possible
                const start = path.points[0];
                const end = path.points[path.points.length - 1];
                const newPoints = this.findShortestPath(start, end);

                // 3. If shorter, keep it. If not, revert.
                if (newPoints && newPoints.length < path.points.length) {
                    path.points = newPoints;
                    improved = true;
                }

                // 4. Mark grid again
                for (const [r, c] of path.points) {
                    this.grid.setCell(r, c, path.id);
                }
            }
        }
    }

    validateGrid() {
        // Check constraints
        for (const path of this.grid.paths) {
            // Constraint: Path must have length >= 3
            if (path.points.length < 3) return false;

            const start = path.points[0];
            const end = path.points[path.points.length - 1];

            // Check if Start and End are adjacent (distance 1)
            // This prevents "U-turn" shapes where dots are neighbors.
            if (this.areNeighbors(start[0], start[1], end[0], end[1])) {
                return false;
            }
        }
        return true;
    }

    addPair() {
        // 1. Pick two random empty cells
        const empties = this.getAllEmpty();
        if (empties.length < 2) return false;

        // random A
        const idxA = Math.floor(Math.random() * empties.length);
        const start = empties[idxA];

        // Remove A from list to pick B
        empties.splice(idxA, 1);
        const idxB = Math.floor(Math.random() * empties.length);
        const end = empties[idxB];

        // 2. Find Shortest Path (BFS)
        const pathPoints = this.findShortestPath(start, end);

        // 3. Validate
        // Path length >= 3 (Start, Mid, End) -> 2 edges, separation 1 square
        if (pathPoints && pathPoints.length >= 3) {
            const pathId = this.grid.paths.length + 1;

            // Mark grid
            for (const [r, c] of pathPoints) {
                this.grid.setCell(r, c, pathId);
            }

            this.grid.paths.push({
                id: pathId,
                points: pathPoints,
                color: this.getDistinctColor(pathId)
            });
            return true;
        }

        return false;
    }

    expandPathsLinear() {
        let changed = true;
        let iterations = 0;

        // Loop until no more expansions are possible
        while (changed && iterations < 50) {
            changed = false;
            iterations++;
            // Shuffle to vary the order of processing paths
            this.shuffle(this.grid.paths);

            for (const path of this.grid.paths) {
                if (this.expandEndpointLinearly(path, 0)) {
                    changed = true;
                }
                if (this.expandEndpointLinearly(path, path.points.length - 1)) {
                    changed = true;
                }
            }
        }
    }

    expandEndpointLinearly(path, index) {
        // Get start position
        const [r, c] = path.points[index];
        const isStart = (index === 0);

        const otherIdx = isStart ? path.points.length - 1 : 0;
        const [otherR, otherC] = path.points[otherIdx];

        // Determine CURRENT direction of the path at this endpoint
        let prevDir = null;
        if (path.points.length > 1) {
            // If start, direction is [0] - [1]
            // If end, direction is [last] - [last-1]
            const [pr, pc] = isStart ? path.points[1] : path.points[path.points.length - 2];
            prevDir = [r - pr, c - pc];
        }

        // 1. Find all valid empty neighbors
        let neighbors = this.getNeighbors(r, c).filter(([nr, nc]) => this.grid.isEmpty(nr, nc));

        if (neighbors.length === 0) return false;

        // 2. Evaluate each neighbor to see how far we can extend linearly
        const candidates = neighbors.map(neighbor => {
            const dir = [neighbor[0] - r, neighbor[1] - c];
            let steps = 0;
            let currR = neighbor[0];
            let currC = neighbor[1];

            // Check availability for the FIRST step
            if (this.areNeighbors(currR, currC, otherR, otherC)) {
                return { neighbor, dir, steps: 0, degree: 0 };
            }
            steps = 1;

            // Simulate forward
            while (true) {
                const nextR = currR + dir[0];
                const nextC = currC + dir[1];

                // Check Bounds
                if (!this.grid.isValid(nextR, nextC)) break;
                // Check Empty
                if (!this.grid.isEmpty(nextR, nextC)) break;
                // Check Constraint (Distance to other endpoint)
                if (this.areNeighbors(nextR, nextC, otherR, otherC)) break;

                // Valid step
                steps++;
                currR = nextR;
                currC = nextC;
            }

            // Warnsdorff score
            const degree = this.getEmptyNeighborCount(neighbor[0], neighbor[1]);

            return { neighbor, dir, steps, degree };
        });

        // 3. Filter candidates
        const validCandidates = candidates.filter(c => {
            if (c.steps <= 0) return false;

            // STRICT ANTI-ZIGZAG RULE:
            // If this move is a TURN (dir != prevDir) AND steps < 2, disallow it.
            // We only allow 1-step moves if we are continuing straight.
            if (prevDir) {
                const isTurn = (c.dir[0] !== prevDir[0] || c.dir[1] !== prevDir[1]);
                if (isTurn && c.steps < 2) {
                    return false;
                }
            }
            return true;
        });

        if (validCandidates.length === 0) return false;

        validCandidates.sort((a, b) => {
            // Priority 1: Maximize Steps
            if (b.steps !== a.steps) return b.steps - a.steps;

            // Priority 2: Minimize Degree
            return a.degree - b.degree;
        });

        // 4. Execute the Best Move
        const best = validCandidates[0];

        // Perform the run
        let currR = r;
        let currC = c;
        for (let i = 0; i < best.steps; i++) {
            currR += best.dir[0];
            currC += best.dir[1];

            this.grid.setCell(currR, currC, path.id);
            if (isStart) path.points.unshift([currR, currC]);
            else path.points.push([currR, currC]);
        }

        return true;
    }

    areNeighbors(r1, c1, r2, c2) {
        return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
    }

    getDistinctColor(index) {
        // curated distinct palette
        const palette = [
            '#FF0000', // Red
            '#00FF00', // Green (The ONLY Green)
            '#0000FF', // Blue
            '#FFFF00', // Yellow
            '#FF00FF', // Magenta
            '#00FFFF', // Cyan
            '#FFA500', // Orange
            '#A52A2A', // Brown
            '#800080', // Purple
            '#FFC0CB', // Pink
            '#FFFFFF', // White
            '#808080', // Gray
        ];
        return palette[(index - 1) % palette.length];
    }

    getEmptyNeighborCount(r, c) {
        let count = 0;
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (this.grid.isValid(nr, nc) && this.grid.cells[nr][nc] === 0) count++;
        }
        return count;
    }

    getAllEmpty() {
        const res = [];
        for (let r = 0; r < this.grid.size; r++) {
            for (let c = 0; c < this.grid.size; c++) {
                if (this.grid.isEmpty(r, c)) res.push([r, c]);
            }
        }
        return res;
    }

    findShortestPath(start, end) {
        const [startR, startC] = start;
        const [endR, endC] = end;

        const queue = [[startR, startC, []]]; // r, c, history
        const visited = new Set();
        visited.add(`${startR},${startC}`);

        // Optimization: BFS for shortest path
        // We need to store the path.

        // Queue: [ [r, c] ]
        // Map parent pointers to reconstruct path: parent[key] = prevKey

        const q = [start];
        const parents = new Map();
        parents.set(`${startR},${startC}`, null);

        let found = false;

        while (q.length > 0) {
            const [r, c] = q.shift();

            if (r === endR && c === endC) {
                found = true;
                break;
            }

            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

            for (const [dr, dc] of dirs) {
                const nr = r + dr, nc = c + dc;
                const key = `${nr},${nc}`;

                if (!parents.has(key)) {
                    // Valid if: 
                    // 1. Inside grid
                    // 2. Empty OR it is the End cell
                    if (this.grid.isValid(nr, nc)) {
                        if (this.grid.cells[nr][nc] === 0 || (nr === endR && nc === endC)) {
                            parents.set(key, [r, c]);
                            q.push([nr, nc]);
                        }
                    }
                }
            }
        }

        if (!found) return null;

        // Reconstruct
        const path = [];
        let curr = end;
        while (curr) {
            path.push(curr);
            const key = `${curr[0]},${curr[1]}`;
            curr = parents.get(key);
        }
        return path.reverse();
    }

    getNeighbors(r, c) {
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const res = [];
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (this.grid.isValid(nr, nc)) {
                res.push([nr, nc]);
            }
        }
        return res;
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
