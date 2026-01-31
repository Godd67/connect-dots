import { Grid } from '../src/Grid.js';
import { Generator } from '../src/Generator.js';

function testGenerator(size, runs = 10) {
    console.log(`Testing ${size}x${size} Generator (${runs} runs)...`);
    const grid = new Grid(size);
    const generator = new Generator(grid);
    let successCount = 0;
    let totalPairs = 0;

    for (let i = 0; i < runs; i++) {
        const start = performance.now();
        const result = generator.generate();
        const end = performance.now();

        if (result && grid.paths.length > 1) {
            successCount++;
            totalPairs += grid.paths.length;
        } else {
            console.log(`Run ${i}: Failed to generate at least 2 pairs.`);
        }
    }

    console.log(`Success Rate: ${successCount}/${runs}`);
    console.log(`Avg Pairs: ${(totalPairs / runs).toFixed(1)}`);
    return successCount;
}

console.log('--- Starting Greedy Verification ---');
const runs5 = testGenerator(5, 20);
const runs10 = testGenerator(10, 20);

if (runs5 > 0 && runs10 > 0) {
    console.log('PASSED: Generator produces multi-pair puzzles.');
    process.exit(0);
} else {
    console.log('FAILED: Generator could not consistently produce valid puzzles.');
    process.exit(1);
}
