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
                // Phase 2: Random Expansion (Shape forming)
                this.expandPathsRandom(false);

                // Phase 3: Prune "dumb" geometric loops (optimization)
                // This is the FINAL step to ensure no artifacts remain.
                this.tightenPaths();

                // Phase 4: Re-Expand Random
                // Re-filling voids created by tightening. 
                // THESE are the "extensions" user wants to see distinguished.
                this.expandPathsRandom(true);

                // Phase 5: Final Validation
                if (this.validateGrid()) {
                    console.log(`Generated valid grid on attempt ${attempt + 1}`);
                    return true;
                } else {
                    // console.log("Validation failed on attempt", attempt);
                }
            } else {
                // console.log("Fill greedy failed on attempt", attempt);
            }
        }
        console.error("Failed to generate grid after 500 attempts");
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
                    // Reset point types to Core (0)
                    path.pointTypes = new Array(newPoints.length).fill(0);
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

        // For the FIRST pair only: ensure endpoints are at least 2/3 of grid height apart
        let candidateList = empties;
        if (this.grid.paths.length === 0) {
            const minDistance = Math.floor(this.grid.size * 2 / 3);
            const validCandidates = empties.filter(([r, c]) => {
                const distance = Math.abs(r - start[0]) + Math.abs(c - start[1]);
                return distance >= minDistance;
            });

            // If valid candidates exist, use them; otherwise fall back to all empties
            if (validCandidates.length > 0) {
                candidateList = validCandidates;
            }
        }

        if (candidateList.length === 0) return false;

        const idxB = Math.floor(Math.random() * candidateList.length);
        const end = candidateList[idxB];

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
                // Initialize point types (0 = core)
                pointTypes: new Array(pathPoints.length).fill(0),
                color: this.getDistinctColor(pathId)
            });
            return true;
        }

        return false;
    }

    expandPathsRandom(isExtension = false) {
        let changed = true;
        let iterations = 0;

        // Loop until no more expansions are possible
        // Increased limit for larger grids (20x20 = 400 cells)
        while (changed && iterations < 1000) {
            changed = false;
            iterations++;
            // Shuffle to vary the order of processing paths
            this.shuffle(this.grid.paths);

            for (const path of this.grid.paths) {
                // Try expanding Start
                if (this.expandEndpointRandom(path, 0, isExtension)) {
                    changed = true;
                }
                // Try expanding End
                if (this.expandEndpointRandom(path, path.points.length - 1, isExtension)) {
                    changed = true;
                }
            }
        }
    }

    expandEndpointRandom(path, index, isExtension) {
        // Get start position
        const [r, c] = path.points[index];
        const isStart = (index === 0);

        const otherIdx = isStart ? path.points.length - 1 : 0;
        const [otherR, otherC] = path.points[otherIdx];

        // Determine CURRENT direction of the path at this endpoint
        let prevDir = null;
        let prevSegmentLength = 0;

        if (path.points.length > 1) {
            // If tip is at 0 (Start), the path goes 0 -> 1.
            // So the "arriving" direction to tip was (0 - 1).
            // Wait, usually direction is "forward".
            // If we extend 0, we are moving AWAY from 1.
            // Direction = (0 - 1).

            // If tip is at End (N), path goes N-1 -> N.
            // Direction = (N - (N-1)).

            const [pr, pc] = isStart ? path.points[1] : path.points[path.points.length - 2];
            prevDir = [r - pr, c - pc];

            // Re-use helper to measure segment
            prevSegmentLength = this.measureStraightSegment(path, index, prevDir);
        }

        // 1. Find all valid empty neighbors
        let neighbors = this.getNeighbors(r, c).filter(([nr, nc]) => this.grid.isEmpty(nr, nc));

        if (neighbors.length === 0) return false;

        // 2. Random Selection Loop
        // "if the first selected is not valid... try other options"
        this.shuffle(neighbors);

        for (const [nr, nc] of neighbors) {
            // Check Constraint 1: Don't touch other endpoint
            if (this.areNeighbors(nr, nc, otherR, otherC)) {
                console.log(`[SKIP] Color: ${path.color}, Pos: (${r},${c}), Neighbor: (${nr},${nc}) - Would touch other endpoint`);
                continue;
            }

            // Check Constraint 2: No U-Shaped Turns
            // A U-shape is when you turn 90°, go 1 step, then turn 90° back toward where you came from.
            // Example: East → South (1 step) → West creates a U-shape
            // We need to look at the direction BEFORE the previous segment to detect this.
            if (prevDir && prevSegmentLength < 2 && path.points.length >= 3) {
                const newDir = [nr - r, nc - c];

                // Get the direction from 2 segments ago
                // If we're at the start (index 0), look at points[2] -> points[1]
                // If we're at the end, look at points[N-3] -> points[N-2]
                let dirBeforePrev = null;
                if (isStart && path.points.length >= 3) {
                    const p0 = path.points[0];  // current tip
                    const p1 = path.points[1];  // 1 back
                    const p2 = path.points[2];  // 2 back
                    dirBeforePrev = [p1[0] - p2[0], p1[1] - p2[1]];
                } else if (!isStart && path.points.length >= 3) {
                    const pN = path.points[path.points.length - 1];  // current tip
                    const pN1 = path.points[path.points.length - 2]; // 1 back
                    const pN2 = path.points[path.points.length - 3]; // 2 back
                    dirBeforePrev = [pN1[0] - pN2[0], pN1[1] - pN2[1]];
                }

                // If the new direction is OPPOSITE to the direction from 2 segments ago, it's a U-shape
                if (dirBeforePrev) {
                    const isUShape = (newDir[0] === -dirBeforePrev[0] && newDir[1] === -dirBeforePrev[1]);

                    if (isUShape) {
                        const dirMap = { '0,1': 'East', '0,-1': 'West', '1,0': 'South', '-1,0': 'North' };
                        const attemptedDir = dirMap[`${newDir[0]},${newDir[1]}`] || 'Unknown';
                        const prevDirStr = dirMap[`${prevDir[0]},${prevDir[1]}`] || 'Unknown';
                        const beforePrevStr = dirMap[`${dirBeforePrev[0]},${dirBeforePrev[1]}`] || 'Unknown';
                        console.log(`[SKIP] Color: ${path.color}, Pos: (${r},${c}), Neighbor: (${nr},${nc}) - U-shape blocked (${beforePrevStr} → ${prevDirStr} → ${attemptedDir})`);
                        continue;
                    }
                }
            }

            // If we got here, this neighbor is valid. Execute.
            let currR = nr;
            let currC = nc;

            const type = isExtension ? 1 : 0;

            this.grid.setCell(currR, currC, path.id);

            if (isStart) {
                path.points.unshift([currR, currC]);
                path.pointTypes.unshift(type);
            } else {
                path.points.push([currR, currC]);
                path.pointTypes.push(type);
            }

            // Debug logging for extensions
            const dirMap = { '0,1': 'East', '0,-1': 'West', '1,0': 'South', '-1,0': 'North' };
            const direction = dirMap[`${currR - r},${currC - c}`] || 'Unknown';
            const emptyNeighbors = this.getNeighbors(currR, currC).filter(([tnr, tnc]) => this.grid.isEmpty(tnr, tnc)).length;
            console.log(`[EXTENSION] Color: ${path.color}, Old End: (${r},${c}), New End: (${currR},${currC}), Direction: ${direction}, Empty Neighbors: ${emptyNeighbors}`);

            return true; // Made a move, exit
        }

        // No valid neighbors found
        return false;
    }

    measureStraightSegment(path, index, tipDir) {
        const isStart = (index === 0);
        let count = 0;

        if (isStart) {
            // Tip is at 0. Direction tipDir is vector pointing 1->0 (e.g. Up).
            // We scan 0->1, 1->2, ...
            // Segment 0->1 must match tipDir.
            for (let i = 0; i < path.points.length - 1; i++) {
                const curr = path.points[i];
                const next = path.points[i + 1];
                // Vector from next to curr: curr - next
                if (curr[0] - next[0] === tipDir[0] && curr[1] - next[1] === tipDir[1]) {
                    count++;
                } else {
                    break;
                }
            }
        } else {
            // Tip is at End. Direction tipDir is vector pointing N-1 -> N.
            // We scan N->N-1, N-1->N-2...
            for (let i = path.points.length - 1; i > 0; i--) {
                const curr = path.points[i];
                const prev = path.points[i - 1];
                // Vector from prev to curr: curr - prev
                if (curr[0] - prev[0] === tipDir[0] && curr[1] - prev[1] === tipDir[1]) {
                    count++;
                } else {
                    break;
                }
            }
        }
        return count;
    }

    areNeighbors(r1, c1, r2, c2) {
        return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
    }

    getDistinctColor(index) {
        // Use golden ratio (137.5 degrees) for maximum color distinction
        // This ensures every path gets a unique, maximally separated color
        const hue = ((index - 1) * 137.5) % 360;
        return `hsl(${hue}, 85%, 60%)`;
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
