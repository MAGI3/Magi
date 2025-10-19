import { spawn, type ChildProcess } from 'child_process';
import { chromium } from '@playwright/test';

const CDP_BASE_URL = 'http://localhost:9222';
let electronProcess: ChildProcess | null = null;

async function waitForCdpEndpoint(url: string, timeout = 30000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.ok) {
        console.log('CDP endpoint is ready');
        return true;
      }
    } catch (error) {
      // 端点尚未就绪，继续等待
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`CDP endpoint not available after ${timeout}ms`);
}

async function globalSetup() {
  console.log('Starting Electron application for all test workers...');
  
  // 启动 Electron 应用
  electronProcess = spawn('pnpm', ['dev'], {
    cwd: process.cwd(),
    env: { ...process.env },
    shell: true,
  });

  // 捕获标准输出
  if (electronProcess.stdout) {
    electronProcess.stdout.on('data', (data) => {
      console.log(`[Electron stdout] ${data.toString().trim()}`);
    });
  }

  // 捕获标准错误
  if (electronProcess.stderr) {
    electronProcess.stderr.on('data', (data) => {
      console.error(`[Electron stderr] ${data.toString().trim()}`);
    });
  }

  // 监听进程错误和退出
  electronProcess.on('error', (error) => {
    console.error('Failed to start Electron process:', error);
  });

  electronProcess.on('close', (code) => {
    console.log(`Electron process exited with code ${code}`);
  });

  // 等待 CDP 端点可用
  console.log('Waiting for CDP endpoint to be ready...');
  await waitForCdpEndpoint(CDP_BASE_URL);

  // 将进程 PID 保存到环境变量，供 teardown 使用
  if (electronProcess.pid) {
    process.env.ELECTRON_PID = electronProcess.pid.toString();
  }

  console.log('Electron application is ready for testing');
}

export default globalSetup;
