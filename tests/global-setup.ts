import { _electron } from 'playwright';

import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, exec } from 'node:child_process';
const CDP_BASE_URL = 'http://localhost:9222';
const PID_FILE = join(process.cwd(), '.electron-test-pid');

async function waitForCdpEndpoint(url: string, timeout = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.ok) {
        return true;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`CDP endpoint not available after ${timeout}ms`);
}

async function ensureBuilt() {
  await new Promise<void>((resolvePromise, reject) => {
    const p = spawn('pnpm', ['exec', 'electron-vite', 'build', '--config', 'electron.vite.config.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'development', TEST_ELECTRON_FORCE_DEV: '1' },
      shell: true,
    });
    p.on('error', reject);
    p.on('exit', code => {
      if (code === 0) resolvePromise(); else reject(new Error(`electron-vite build failed: ${code}`));
    });
  });
}

async function findElectronPid(): Promise<number | null> {
  return new Promise<number | null>((resolvePid) => {
    const child = exec('pgrep -f "Electron.app/Contents/MacOS/Electron"', { shell: true }, (error, stdout) => {
      if (error) {
        resolvePid(null);
        return;
      }
      const pids = stdout.trim().split('\n').filter(Boolean);
      resolvePid(pids.length ? parseInt(pids[0], 10) : null);
    });
    child.on('error', () => resolvePid(null));
  });
}

async function globalSetup() {
  const mode = process.env.TEST_ELECTRON_MODE ?? 'build';
  if (mode === 'hot') {
    const dev = spawn('pnpm', ['dev'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DISABLE_FILE_LOG: 'true',
        LOG_LEVEL: 'debug'
      },
      shell: true
    });
    dev.stdout?.on('data', (data) => process.stdout.write(`[Electron stdout] ${data}`));
    dev.stderr?.on('data', (data) => process.stderr.write(`[Electron stderr] ${data}`));
    await waitForCdpEndpoint(CDP_BASE_URL);
    const pid = await findElectronPid();
    if (pid) writeFileSync(PID_FILE, String(pid), 'utf-8');
    return;
  }

  await ensureBuilt();
  const rendererIndex = resolve(process.cwd(), 'dist/renderer/index.html');
  const electronApp = await _electron.launch({
    args: [process.cwd()],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_START_URL: `file://${rendererIndex}`,
      DISABLE_FILE_LOG: 'true',
      LOG_LEVEL: 'debug'
    }
  });
  electronApp.process().stdout?.on('data', (data) => process.stdout.write(`[Electron STDOUT] ${data}`));
  electronApp.process().stderr?.on('data', (data) => process.stderr.write(`[Electron STDERR] ${data}`));
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await waitForCdpEndpoint(CDP_BASE_URL);
  const pid = electronApp.process().pid;
  if (pid) writeFileSync(PID_FILE, String(pid), 'utf-8');
}

export default globalSetup;
