export class Grid {
    constructor(cols, rows) {
        this.cols = cols;
        this.rows = rows || cols;
        // 0: empty, >0: path id
        this.cells = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
        this.paths = []; // { id, color, points: [[r,c], ...] }
    }

    isValid(r, c) {
        return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
    }

    isEmpty(r, c) {
        return this.isValid(r, c) && this.cells[r][c] === 0;
    }

    setCell(r, c, value) {
        if (this.isValid(r, c)) {
            this.cells[r][c] = value;
        }
    }

    reset() {
        this.cells = this.cells.map(row => row.fill(0));
        this.paths = [];
    }
}
