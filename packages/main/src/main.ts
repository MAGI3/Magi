import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './ipc/registerHandlers.js';
import { MainWindow } from './app/MainWindow.js';
import { BrowserFleetManager } from './fleet/BrowserFleetManager.js';
import { CdpGateway } from './cdp/CdpGateway.js';
import { ThumbnailScheduler } from './fleet/ThumbnailScheduler.js';
import { logger } from './utils/logger.js';

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

app.disableHardwareAcceleration();

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: MainWindow | null = null;
let fleetManager: BrowserFleetManager | null = null;
let cdpGateway: CdpGateway | null = null;
let thumbnailScheduler: ThumbnailScheduler | null = null;

const createServiceInstances = async (window: BrowserWindow) => {
  fleetManager = new BrowserFleetManager(window);
  cdpGateway = new CdpGateway(fleetManager, { port: 9222 });
  thumbnailScheduler = new ThumbnailScheduler(fleetManager);

  await cdpGateway.start();
  thumbnailScheduler.start();

  registerIpcHandlers(ipcMain, fleetManager);
};

const createWindow = async () => {
  const preloadPath = path.join(__dirname, 'preload.js');
  mainWindow = new MainWindow({
    isDev,
    preloadPath
  });

  await mainWindow.initialize();

  await createServiceInstances(mainWindow.browserWindow);

  const url = isDev
    ? process.env.ELECTRON_START_URL ?? 'http://localhost:5173'
    : `file://${path.join(app.getAppPath(), 'packages/renderer/dist/index.html')}`;

  await mainWindow.load(url);
};

app.on('second-instance', async () => {
  if (!mainWindow) return;
  const { browserWindow } = mainWindow;
  if (browserWindow.isMinimized()) browserWindow.restore();
  browserWindow.focus();
});

app.on('ready', async () => {
  try {
    await createWindow();
  } catch (error) {
    logger.error('Failed to create window', error);
    app.exit(1);
  }
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

app.on('before-quit', async () => {
  thumbnailScheduler?.stop();
  await cdpGateway?.stop();
  await fleetManager?.dispose();

  thumbnailScheduler = null;
  cdpGateway = null;
  fleetManager = null;
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
});
