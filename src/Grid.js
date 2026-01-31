export class Grid {
    constructor(size) {
        this.size = size;
        // 0: empty, >0: path id
        this.cells = Array.from({ length: size }, () => Array(size).fill(0));
        this.paths = []; // { id, color, points: [[r,c], ...] }
    }

    isValid(r, c) {
        return r >= 0 && r < this.size && c >= 0 && c < this.size;
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
