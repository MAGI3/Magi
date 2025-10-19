async function globalTeardown() {
  console.log('Stopping Electron application...');
  
  const electronPid = process.env.ELECTRON_PID;
  
  if (!electronPid) {
    console.log('No Electron PID found in environment, skipping cleanup');
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
    
    console.log(`Sending SIGTERM to Electron process (PID: ${pid})...`);
    process.kill(pid, 'SIGTERM');
    
    // 等待进程优雅退出
    const maxWaitTime = 5000; // 5秒
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        // 检查进程是否还在运行
        process.kill(pid, 0);
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        // 进程已退出
        console.log('Electron process terminated gracefully');
        delete process.env.ELECTRON_PID;
        return;
      }
    }
    
    // 如果进程还在运行，强制终止
    console.log('Electron process did not exit gracefully, sending SIGKILL...');
    process.kill(pid, 'SIGKILL');
    console.log('Electron process force killed');
    
  } catch (error: any) {
    if (error.code === 'ESRCH') {
      console.log('Electron process already terminated');
    } else {
      console.error('Error stopping Electron process:', error);
    }
  } finally {
    delete process.env.ELECTRON_PID;
  }
}

export default globalTeardown;
