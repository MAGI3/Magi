import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
// @ts-ignore - tree-kill doesn't have official type definitions
import kill from 'tree-kill';

const PID_FILE = join(process.cwd(), '.electron-test-pid');

async function globalTeardown() {
  console.log('Stopping Electron application...');
  
  // 从文件读取 PID
  if (!existsSync(PID_FILE)) {
    console.log('No Electron PID file found, skipping cleanup');
    return;
  }

  const electronPid = readFileSync(PID_FILE, 'utf-8').trim();
  
  if (!electronPid) {
    console.log('PID file is empty, skipping cleanup');
    return;
  }

  const pid = parseInt(electronPid, 10);
  
  if (isNaN(pid)) {
    console.error('Invalid Electron PID:', electronPid);
    return;
  }

  try {
    // 检查进程是否存在
    process.kill(pid, 0);
    
    console.log(`Sending SIGTERM to entire Electron process tree (PID: ${pid})...`);
    
    // 使用 tree-kill 杀死整个进程树，先尝试优雅退出
    await new Promise<void>((resolve, reject) => {
      kill(pid, 'SIGTERM', (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          console.log('SIGTERM sent to process tree');
          resolve();
        }
      });
    });
    
    // 等待进程树优雅退出
    const maxWaitTime = 5000; // 5秒
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // 检查主进程是否还在运行
        process.kill(pid, 0);
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        // 进程已退出
        console.log('Electron process tree terminated gracefully');
        // 删除 PID 文件
        if (existsSync(PID_FILE)) {
          unlinkSync(PID_FILE);
          console.log('PID file cleaned up');
        }
        return;
      }
    }
    
    // 如果进程树还在运行，强制终止
    console.log('Electron process tree did not exit gracefully, sending SIGKILL...');
    await new Promise<void>((resolve, reject) => {
      kill(pid, 'SIGKILL', (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          console.log('SIGKILL sent to process tree');
          resolve();
        }
      });
    });
    console.log('Electron process tree force killed');
    
  } catch (error: any) {
    if (error.code === 'ESRCH') {
      console.log('Electron process tree already terminated');
    } else {
      console.error('Error stopping Electron process tree:', error);
    }
  } finally {
    // 清理 PID 文件
    if (existsSync(PID_FILE)) {
      try {
        unlinkSync(PID_FILE);
        console.log('PID file cleaned up in finally block');
      } catch (error) {
        console.error('Error cleaning up PID file:', error);
      }
    }
  }
}

export default globalTeardown;
