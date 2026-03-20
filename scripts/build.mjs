import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

function getBuildNumber() {
  const fromEnv = process.env.VITE_BUILD_NUMBER?.trim() || process.env.BUILD_NUMBER?.trim();
  if (fromEnv) return fromEnv;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}`;
}

function prepareServiceWorker(buildNumber) {
  const templatePath = resolve('public', 'sw-template.js');
  const outputPath = resolve('public', 'sw.js');
  const template = readFileSync(templatePath, 'utf8');
  const rendered = template.replace(/__BUILD_NUMBER__/g, buildNumber);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered, 'utf8');
}

async function run() {
  const buildNumber = getBuildNumber();
  prepareServiceWorker(buildNumber);
  console.log(`Prepared service worker for build ${buildNumber}`);

  const command = process.platform === 'win32' ? 'cmd' : 'npx';
  const args = process.platform === 'win32' ? ['/c', 'npx', 'vite', 'build'] : ['vite', 'build'];
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, VITE_BUILD_NUMBER: buildNumber }
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

run();
