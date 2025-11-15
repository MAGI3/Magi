import { spawn, exec, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

const CDP_BASE_URL = 'http://localhost:9222';
const PID_FILE = join(process.cwd(), '.electron-test-pid');
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
    env: { 
      ...process.env,
      DISABLE_FILE_LOG: 'true',  // 禁用文件日志，仅输出到控制台
      LOG_LEVEL: 'debug'         // 设置为 debug 级别以输出所有调试信息
    },
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

  // 查找并保存真正的 Electron 主进程 PID
  try {
    // 在 macOS 上，查找包含 Electron.app 的主进程
    const { stdout } = await execAsync('pgrep -f "Electron.app/Contents/MacOS/Electron"');
    const pids = stdout.trim().split('\n').filter(pid => pid);
    
    if (pids.length > 0) {
      // 通常第一个是主进程
      const electronPid = pids[0];
      writeFileSync(PID_FILE, electronPid, 'utf-8');
      console.log(`Found Electron main process PID: ${electronPid}`);
      console.log(`All Electron PIDs: ${pids.join(', ')}`);
    } else {
      throw new Error('No Electron process found');
    }
  } catch (error) {
    console.error('Failed to find Electron PID:', error);
    // 回退到使用 spawn 返回的 PID
    if (electronProcess.pid) {
      writeFileSync(PID_FILE, electronProcess.pid.toString(), 'utf-8');
      console.log(`Fallback: using spawn PID ${electronProcess.pid}`);
    }
  }

  console.log('Electron application is ready for testing');
}

export default globalSetup;
