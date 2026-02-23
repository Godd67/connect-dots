import { Grid } from './Grid.js';

export class Generator {
    constructor(grid, options = {}) {
        this.grid = grid;
        this.hardMode = options.hardMode || false;
        this.random = options.random;
        this.maxSymmetryAttempts = 5;
        this.totalAttemptCount = 0;
        this.MAX_SOLVE_TIME = 2000; // ms
        this.startTime = 0;
    }

    generate() {
        this.startTime = Date.now();
        this.totalAttemptCount = 0;

        // Try multiple times if recursion hits a time limit or fails
        for (let i = 0; i < 50; i++) {
            this.grid.reset();
            if (this.solve()) {
                this.shufflePathIds();
                console.log(`Puzzles generated successfully in ${Date.now() - this.startTime}ms`);
                return true;
            }
        }
        return false;
    }

    solve() {
        // Safety timeout to prevent browser hang
        if (Date.now() - this.startTime > this.MAX_SOLVE_TIME) return false;

        const start = this.findNextEmpty();
        if (!start) {
            // Check if we have enough paths to be a good puzzle
            return this.grid.paths.length >= Math.floor((this.grid.cols * this.grid.rows) / 8);
        }

        const [r, c] = start;
        const potentialPaths = this.findPossiblePaths(r, c);

        // Shuffle paths for variety
        this.random.shuffle(potentialPaths);

        for (const pathPoints of potentialPaths) {
            const pathId = this.grid.paths.length + 1;

            // Mark grid
            for (const [pr, pc] of pathPoints) {
                this.grid.setCell(pr, pc, pathId);
            }

            const pathObj = {
                id: pathId,
                points: pathPoints,
                color: this.getDistinctColor(pathId)
            };
            this.grid.paths.push(pathObj);

            // Heuristic check: Ensure no isolated cells are created
            if (this.isBoardStillSolvable()) {
                if (this.solve()) return true;
            }

            // Backtrack
            this.grid.paths.pop();
            for (const [pr, pc] of pathPoints) {
                this.grid.setCell(pr, pc, 0);
            }
        }

        // Sometimes we can't find a path from this start cell.
        // In "Connect the Dots", every cell should be part of a path.
        // However, we can also place "stones" (obstacles) if we want to allow empty-ish boards.
        // Let's try skipping this cell as a "stone" if we are stuck.

        this.grid.setCell(r, c, -1); // Temporary stone
        if (this.isBoardStillSolvable()) {
            if (this.solve()) return true;
        }
        this.grid.setCell(r, c, 0); // Backtrack stone

        return false;
    }

    findNextEmpty() {
        for (let r = 0; r < this.grid.rows; r++) {
            for (let c = 0; c < this.grid.cols; c++) {
                if (this.grid.isEmpty(r, c)) return [r, c];
            }
        }
        return null;
    }

    findPossiblePaths(r, c) {
        const paths = [];
        // DFS search for potential paths starting at (r, c)
        // We limit path length to prevent too much complexity
        const maxPathLen = Math.min(10, Math.floor(Math.max(this.grid.cols, this.grid.rows) * 1.5));

        const dfs = (currR, currC, currentPath) => {
            if (currentPath.length >= 3) {
                // Potential path found. Check Hard Mode constraints.
                const start = currentPath[0];
                const end = currentPath[currentPath.length - 1];

                let valid = true;
                if (this.hardMode) {
                    // Start and End must not be in same row or column
                    if (start[0] === end[0] || start[1] === end[1]) valid = false;
                }

                if (valid) {
                    paths.push([...currentPath]);
                }
            }

            if (currentPath.length >= maxPathLen) return;

            const neighbors = this.getNeighbors(currR, currC);
            // Randomize neighbor order
            this.random.shuffle(neighbors);

            for (const [nr, nc] of neighbors) {
                if (this.grid.isEmpty(nr, nc) && !this.isInPath(nr, nc, currentPath)) {
                    // Check for self-touching (maintain thin paths)
                    if (this.countPathNeighbors(nr, nc, currentPath) === 1) {
                        currentPath.push([nr, nc]);
                        dfs(nr, nc, currentPath);
                        currentPath.pop();
                    }
                }
            }
        };

        dfs(r, c, [[r, c]]);
        // Only return a subset of paths to keep branching factor sane
        return paths.slice(0, 15);
    }

    isInPath(r, c, path) {
        return path.some(([pr, pc]) => pr === r && pc === c);
    }

    countPathNeighbors(r, c, path) {
        let count = 0;
        const neighbors = this.getNeighbors(r, c);
        for (const [nr, nc] of neighbors) {
            if (this.isInPath(nr, nc, path)) count++;
        }
        return count;
    }

    getNeighbors(r, c) {
        const res = [];
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (this.grid.isValid(nr, nc)) res.push([nr, nc]);
        }
        return res;
    }

    isBoardStillSolvable() {
        // Check for isolated empty cells (no empty neighbors)
        for (let r = 0; r < this.grid.rows; r++) {
            for (let c = 0; c < this.grid.cols; c++) {
                if (this.grid.isEmpty(r, c)) {
                    const neighbors = this.getNeighbors(r, c);
                    const emptyNeighbors = neighbors.filter(([nr, nc]) => this.grid.isEmpty(nr, nc));
                    if (emptyNeighbors.length === 0) return false;
                }
            }
        }
        return true;
    }

    getDistinctColor(index) {
        const hue = ((index - 1) * 137.5) % 360;
        return `hsl(${hue}, 85%, 60%)`;
    }

    shufflePathIds() {
        const paths = this.grid.paths;
        this.random.shuffle(paths);

        // Re-calculate grid matrix based on new order
        for (let r = 0; r < this.grid.rows; r++) {
            for (let c = 0; c < this.grid.cols; c++) {
                const val = this.grid.cells[r][c];
                if (val > 0) this.grid.cells[r][c] = 0;
            }
        }

        paths.forEach((path, i) => {
            const newId = i + 1;
            path.id = newId;
            path.color = this.getDistinctColor(newId);
            for (const [r, c] of path.points) {
                this.grid.setCell(r, c, newId);
            }
        });
    }
}
