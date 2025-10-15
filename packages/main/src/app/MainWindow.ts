import { BrowserWindow, type BrowserWindowConstructorOptions, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MainWindowOptions {
  preloadPath: string;
  isDev: boolean;
}

const createWindowOptions = (options: MainWindowOptions): BrowserWindowConstructorOptions => {
  return {
    title: 'Magi Browser Orchestrator',
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    show: false,
    backgroundColor: '#0f1115',
    icon: path.join(__dirname, '../../resources/icons/icon.png'),
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      sandbox: false,
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: options.isDev
    }
  };
};

export class MainWindow {
  readonly browserWindow: BrowserWindow;

  constructor(private readonly options: MainWindowOptions) {
    this.browserWindow = new BrowserWindow(createWindowOptions(options));
    this.registerEventListeners();
  }

  private registerEventListeners() {
    this.browserWindow.once('ready-to-show', () => {
      this.browserWindow.show();
      if (this.options.isDev) {
        this.browserWindow.webContents.openDevTools({ mode: 'detach' });
      }
    });

    this.browserWindow.webContents.setWindowOpenHandler(({ url }) => {
      logger.debug('Opening external url', url);
      shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  async initialize() {
    if (!this.options.isDev) {
      const extensionPath = path.join(
        __dirname,
        '../../resources/extensions/react-devtools/shells/chrome'
      );
      this.browserWindow.webContents.session.loadExtension(extensionPath, {
        allowFileAccess: true
      }).catch((error) => {
        logger.warn('Failed to load React DevTools extension', error);
      });
    }
  }

  async load(url: string) {
    if (url.startsWith('http')) {
      await this.browserWindow.loadURL(url);
    } else {
      await this.browserWindow.loadFile(url.replace('file://', ''));
    }
  }

  dispose() {
    if (!this.browserWindow.isDestroyed()) {
      this.browserWindow.destroy();
    }
  }
}
