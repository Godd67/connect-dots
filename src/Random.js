export class Random {
    constructor(seed) {
        if (typeof seed === 'string') {
            this.seed = this.hashString(seed);
        } else {
            this.seed = seed || Math.floor(Math.random() * 2147483647);
        }
    }

    // Mulberry32 algorithm
    next() {
        let t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Range [min, max)
    range(min, max) {
        return Math.floor(this.next() * (max - min) + min);
    }

    // Fisher-Yates Shuffle
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Simple hash function to convert string seed to number
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        return hash >>> 0;
    }
}
