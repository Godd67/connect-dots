import { Grid } from './Grid.js';

export class Generator {
    constructor(grid, options = {}) {
        this.grid = grid;
        this.hardMode = options.hardMode || false;
        this.random = options.random;
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

                // Phase 5: Fill residual bundles (user request)
                this.fillSmallVoids();

                // Phase 5.5: Expand Fillers
                // Allow the newly added filler paths (and existing ones) to grow into remaining space
                this.expandPathsRandom(true);

                // Phase 5.6: Final Pruning (User Request)
                // Prune any sub-optimal loops formed during expansion/filling phases
                this.tightenPaths();

                // Phase 5.7: Final Polish Expansion
                // Last ditch effort to fill any holes created by final tightening
                this.expandPathsRandom(true);

                // Phase 5.75: Final Clump Cleanup (User Request)
                // One last check to catch any 3+ clumps that appeared after tightening
                this.fillSmallVoids();

                // Phase 5.8: Merge Collinear Paths (user request)
                // Combine adjacent straight segments into one
                this.mergeCollinearPaths();

                // Phase 6: Shuffle Path IDs (user request)
                this.shufflePathIds();

                // Phase 7: Final Validation
                if (this.validateGrid()) {
                    console.log(`Generated valid grid on attempt ${attempt + 1} (Hard Mode: ${this.hardMode})`);
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

            // In Hard Mode, check if any path still share a row/column
            // EXEMPTION: Filter paths (added to fill 1x3 gaps) are allowed to be straight
            if (this.hardMode && !path.isFiller) {
                if (start[0] === end[0] || start[1] === end[1]) return false;
            }

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
        const idxA = this.random.range(0, empties.length);
        const start = empties[idxA];

        // Remove A from list to pick B
        empties.splice(idxA, 1);

        // Filter B candidates
        let candidateList = empties;

        // Constraint 1: Hard Mode (No same row or column)
        if (this.hardMode) {
            candidateList = candidateList.filter(([r, c]) => {
                return r !== start[0] && c !== start[1];
            });

            // Experimental: For first 3 pairs, force opposite quadrant
            if (this.grid.paths.length < 3) {
                const half = Math.floor(this.grid.size / 2);
                const startR = start[0] < half ? 0 : 1; // 0=Top, 1=Bottom
                const startC = start[1] < half ? 0 : 1; // 0=Left, 1=Right

                // Target strictly opposite (Top-Left -> Bottom-Right, etc.)
                const targetR = 1 - startR;
                const targetC = 1 - startC;

                const spreadCandidates = candidateList.filter(([r, c]) => {
                    const rQuad = r < half ? 0 : 1;
                    const cQuad = c < half ? 0 : 1;
                    return rQuad === targetR && cQuad === targetC;
                });

                // Only apply if it doesn't kill all candidates
                if (spreadCandidates.length > 0) {
                    candidateList = spreadCandidates;
                }
            }
        }

        // Constraint 2: First pair distance rule
        if (this.grid.paths.length === 0) {
            const minDistance = Math.floor(this.grid.size * 2 / 3);
            candidateList = candidateList.filter(([r, c]) => {
                const distance = Math.abs(r - start[0]) + Math.abs(c - start[1]);
                return distance >= minDistance;
            });
        }

        if (candidateList.length === 0) return false;

        const idxB = this.random.range(0, candidateList.length);
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

    fillSmallVoids() {
        const size = this.grid.size;

        // Greedy Longest Path Filling
        // For every empty cell, try to find the longest simple path we can form starting there.
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (!this.grid.isEmpty(r, c)) continue;

                // Try to find the longest linear path possible in the current empty space
                let path = this.findLongestPathFrom(r, c, 6); // Limit depth to keep it fast

                if (path && path.length >= 3) {
                    this.addTargetedPath(path);
                }
            }
        }

        // Keep 2x2 L-shape checks as a fallback for clusters where DFS didn't find a long path
        for (let r = 0; r < size - 1; r++) {
            for (let c = 0; c < size - 1; c++) {
                if (this.grid.isEmpty(r, c) && this.grid.isEmpty(r, c + 1) && this.grid.isEmpty(r + 1, c)) {
                    this.addTargetedPath([[r, c + 1], [r, c], [r + 1, c]]);
                } else if (this.grid.isEmpty(r, c) && this.grid.isEmpty(r, c + 1) && this.grid.isEmpty(r + 1, c + 1)) {
                    this.addTargetedPath([[r, c], [r, c + 1], [r + 1, c + 1]]);
                } else if (this.grid.isEmpty(r, c) && this.grid.isEmpty(r + 1, c) && this.grid.isEmpty(r + 1, c + 1)) {
                    this.addTargetedPath([[r, c], [r + 1, c], [r + 1, c + 1]]);
                } else if (this.grid.isEmpty(r, c + 1) && this.grid.isEmpty(r + 1, c) && this.grid.isEmpty(r + 1, c + 1)) {
                    this.addTargetedPath([[r, c + 1], [r + 1, c + 1], [r + 1, c]]);
                }
            }
        }
    }

    findLongestPathFrom(r, c, maxDepth) {
        let bestPath = [];

        const dfs = (currR, currC, visited, path) => {
            if (path.length > bestPath.length) {
                bestPath = [...path];
            }
            if (path.length >= maxDepth) return;

            const neighbors = this.getNeighbors(currR, currC);
            for (const [nr, nc] of neighbors) {
                const key = `${nr},${nc}`;
                if (this.grid.isEmpty(nr, nc) && !visited.has(key)) {
                    // Self-Touch check: Ensure the new cell doesn't touch the path body (excluding the current tip)
                    // This maintains "thin" paths.
                    const samePathNeighbors = this.getNeighbors(nr, nc).filter(([tnr, tnc]) => {
                        return visited.has(`${tnr},${tnc}`);
                    });

                    if (samePathNeighbors.length <= 1) {
                        visited.add(key);
                        path.push([nr, nc]);
                        dfs(nr, nc, visited, path);
                        path.pop();
                        visited.delete(key);
                    }
                }
            }
        };

        dfs(r, c, new Set([`${r},${c}`]), [[r, c]]);
        return bestPath;
    }

    addTargetedPath(points) {
        if (!points.every(([r, c]) => this.grid.isEmpty(r, c))) return false;

        const pathId = this.grid.paths.length + 1;
        for (const [r, c] of points) {
            this.grid.setCell(r, c, pathId);
        }

        this.grid.paths.push({
            id: pathId,
            points: points,
            pointTypes: new Array(points.length).fill(0),
            color: this.getDistinctColor(pathId),
            isFiller: true
        });
        return true;
    }

    mergeCollinearPaths() {
        let changed = true;
        while (changed) {
            changed = false;
            const paths = this.grid.paths;

            // O(N^2) loop to find mergeable pairs
            // We iterate backwards to safely splice if needed, or better, just restart on change
            outerLoop:
            for (let i = 0; i < paths.length; i++) {
                for (let j = 0; j < paths.length; j++) {
                    if (i === j) continue;

                    const p1 = paths[i];
                    const p2 = paths[j];

                    // Check if p1 tail is connected to p2 head
                    // or p1 tail to p2 tail
                    // or p1 head to p2 head...

                    // We only need to check one direction for p1 (Tail) against P2 (Head/Tail) 
                    // because the loop will cover the other combinations when i/j swap or in next iters.
                    // Actually, checking all 4 combos ensures we catch it now.

                    const p1Start = p1.points[0];
                    const p1End = p1.points[p1.points.length - 1];
                    const p2Start = p2.points[0];
                    const p2End = p2.points[p2.points.length - 1];

                    // Helper to get direction vector
                    const getDir = (a, b) => [b[0] - a[0], b[1] - a[1]];
                    const isSameDir = (d1, d2) => d1[0] === d2[0] && d1[1] === d2[1];

                    let merged = false;

                    // Case 1: P1 End -> P2 Start
                    if (this.areNeighbors(p1End[0], p1End[1], p2Start[0], p2Start[1])) {
                        // Check collinearity
                        // Dir of P1 last segment
                        const d1 = getDir(p1.points[p1.points.length - 2], p1End);
                        // Dir of connection
                        const dConnect = getDir(p1End, p2Start);
                        // Dir of P2 first segment
                        const d2 = getDir(p2Start, p2.points[1]);

                        if (isSameDir(d1, dConnect) && isSameDir(dConnect, d2)) {
                            // MERGE: Append P2 to P1
                            p1.points = p1.points.concat(p2.points);
                            p1.pointTypes = p1.pointTypes.concat(p2.pointTypes);
                            merged = true;
                        }
                    }
                    // Case 2: P1 End -> P2 End (P2 reversed)
                    else if (this.areNeighbors(p1End[0], p1End[1], p2End[0], p2End[1])) {
                        const d1 = getDir(p1.points[p1.points.length - 2], p1End);
                        const dConnect = getDir(p1End, p2End);
                        const d2 = getDir(p2.points[p2.points.length - 1], p2.points[p2.points.length - 2]); // P2 backwards start

                        if (isSameDir(d1, dConnect) && isSameDir(dConnect, d2)) {
                            // MERGE: Append reversed P2 to P1
                            p1.points = p1.points.concat(p2.points.reverse());
                            p1.pointTypes = p1.pointTypes.concat(p2.pointTypes.reverse());
                            merged = true;
                        }
                    }
                    // We don't need to check P1 Start because P1 End of another path will catch it, or i/j swap.

                    if (merged) {
                        // Update grid cells for the consumed path P2
                        for (const [r, c] of p2.points) {
                            this.grid.setCell(r, c, p1.id);
                        }
                        // Remove P2 from paths
                        paths.splice(j, 1);
                        // Inherit filler status if either was filler? 
                        // Or straight paths are allowed in hard mode if filler.
                        // Ideally checking straightness later. 
                        // But let's set isFiller = true to be safe for hard mode.
                        p1.isFiller = true;

                        changed = true;
                        break outerLoop;
                    }
                }
            }
        }
    }

    shufflePathIds() {
        const paths = this.grid.paths;
        if (paths.length === 0) return;

        // 1. Shuffle the paths array
        this.random.shuffle(paths);

        // 2. Re-assign IDs and update grid matrix
        // Reset matrix first
        for (let r = 0; r < this.grid.size; r++) {
            for (let c = 0; c < this.grid.size; c++) {
                this.grid.setCell(r, c, 0);
            }
        }

        paths.forEach((path, index) => {
            const newId = index + 1;
            path.id = newId;
            path.color = this.getDistinctColor(newId);

            // Re-mark cells
            for (const [r, c] of path.points) {
                this.grid.setCell(r, c, newId);
            }
        });
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
            this.random.shuffle(this.grid.paths);

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
        this.random.shuffle(neighbors);

        for (const [nr, nc] of neighbors) {
            // Check Constraint 1: Don't touch other endpoint
            // Relax this rule for extensions (Phase 4+) to avoid sub-optimal "spare loops"
            if (!isExtension && this.areNeighbors(nr, nc, otherR, otherC)) {
                // console.log(`[SKIP] Color: ${path.color}, Pos: (${r},${c}), Neighbor: (${nr},${nc}) - Would touch other endpoint`);
                continue;
            }

            // Check Constraint 1.5: Hard Mode (Endpoints must never share row/col)
            if (this.hardMode && (nr === otherR || nc === otherC)) {
                continue;
            }

            // Check Constraint 2: No U-Shaped Turns
            if (prevDir && prevSegmentLength < 2 && path.points.length >= 3) {
                const newDir = [nr - r, nc - c];

                let dirBeforePrev = null;
                if (isStart && path.points.length >= 3) {
                    const p1 = path.points[1];
                    const p2 = path.points[2];
                    dirBeforePrev = [p1[0] - p2[0], p1[1] - p2[1]];
                } else if (!isStart && path.points.length >= 3) {
                    const pN1 = path.points[path.points.length - 2];
                    const pN2 = path.points[path.points.length - 3];
                    dirBeforePrev = [pN1[0] - pN2[0], pN1[1] - pN2[1]];
                }

                if (dirBeforePrev) {
                    const isUShape = (newDir[0] === -dirBeforePrev[0] && newDir[1] === -dirBeforePrev[1]);

                    if (isUShape) {
                        continue;
                    }
                }
            }

            // Check Constraint 3: Self-Touch
            const samePathNeighbors = this.getNeighbors(nr, nc).filter(([tr, tc]) => {
                return this.grid.cells[tr][tc] === path.id;
            });

            if (samePathNeighbors.length > 1) {
                continue;
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

            return true; // Made a move, exit
        }

        // No valid neighbors found
        return false;
    }

    measureStraightSegment(path, index, tipDir) {
        const isStart = (index === 0);
        let count = 0;

        if (isStart) {
            for (let i = 0; i < path.points.length - 1; i++) {
                const curr = path.points[i];
                const next = path.points[i + 1];
                if (curr[0] - next[0] === tipDir[0] && curr[1] - next[1] === tipDir[1]) {
                    count++;
                } else {
                    break;
                }
            }
        } else {
            for (let i = path.points.length - 1; i > 0; i--) {
                const curr = path.points[i];
                const prev = path.points[i - 1];
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
}
