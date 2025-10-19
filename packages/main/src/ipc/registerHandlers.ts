import { BrowserWindow, type IpcMain } from 'electron';
import { BrowserActionSchema } from '@magi/ipc-schema';
import { BrowserFleetManager } from '../fleet/BrowserFleetManager.js';
import { logger } from '../utils/logger.js';

const broadcastState = (state: unknown) => {
  const windows = BrowserWindow.getAllWindows();
  for (const window of windows) {
    window.webContents.send('browser:state', state);
  }
};

export const registerIpcHandlers = (ipcMain: IpcMain, fleetManager: BrowserFleetManager) => {
  const handleState = () => {
    const state = fleetManager.getState();
    broadcastState(state);
  };

  fleetManager.on('state', handleState);

  ipcMain.handle('browser:action', async (_event, rawAction) => {
    const action = BrowserActionSchema.parse(rawAction);

    switch (action.type) {
      case 'browser:create': {
        const browser = fleetManager.createBrowser(action.payload);
        const activePage = browser.getActivePage();
        if (activePage) {
          return { ok: true, browserId: browser.browserId, pageId: activePage.pageId };
        }
        break;
      }
      case 'browser:destroy': {
        fleetManager.destroyBrowser(action.browserId);
        break;
      }
      case 'page:create': {
        const page = fleetManager.createPage({
          browserId: action.browserId,
          url: action.payload?.url ?? null,
          activate: action.payload?.activate ?? true,
          afterPageId: action.payload?.afterPageId
        });
        if (page) {
          return { ok: true, pageId: page.pageId };
        }
        break;
      }
      case 'page:navigate': {
        fleetManager.navigatePage({
          browserId: action.browserId,
          pageId: action.pageId,
          url: action.url
        });
        break;
      }
      case 'page:select': {
        fleetManager.selectPage({
          browserId: action.browserId,
          pageId: action.pageId
        });
        break;
      }
      case 'page:close': {
        fleetManager.closePage({
          browserId: action.browserId,
          pageId: action.pageId
        });
        break;
      }
      case 'page:reload': {
        const browser = fleetManager.getBrowser(action.browserId);
        const page = browser?.pagesList.find((p) => p.pageId === action.pageId);
        if (page) {
          page.reload(action.bypassCache ?? false).catch((error) => {
            logger.error('Failed to reload page', {
              browserId: action.browserId,
              pageId: action.pageId,
              error
            });
          });
        }
        break;
      }
      case 'page:navigation': {
        const browser = fleetManager.getBrowser(action.browserId);
        const page = browser?.pagesList.find((p) => p.pageId === action.pageId);
        if (page) {
          if (action.direction === 'back') {
            page.goBack().catch((error) => {
              logger.error('Failed to navigate back', {
                browserId: action.browserId,
                pageId: action.pageId,
                error
              });
            });
          } else {
            page.goForward().catch((error) => {
              logger.error('Failed to navigate forward', {
                browserId: action.browserId,
                pageId: action.pageId,
                error
              });
            });
          }
        }
        break;
      }
      case 'download:cancel': {
        logger.warn('Download cancel not yet implemented', action);
        break;
      }
      case 'layout:update': {
        // Update content bounds and reattach view to ensure proper display
        fleetManager.updateContentBounds(action.bounds);
        fleetManager.attachActiveView(action.browserId);
        break;
      }
      case 'devtools:toggle': {
        const browser = fleetManager.getBrowser(action.browserId);
        const page = browser?.pagesList.find((p) => p.pageId === action.pageId);
        if (page) {
          const webContents = page.view.webContents;
          if (webContents.isDevToolsOpened()) {
            webContents.closeDevTools();
          } else {
            webContents.openDevTools();
          }
        }
        break;
      }
      case 'browserview:detach': {
        fleetManager.detachView();
        break;
      }
      default: {
        logger.warn('Unhandled browser action', action);
      }
    }

    return { ok: true };
  });

  ipcMain.handle('browser:getState', async () => {
    return fleetManager.getState();
  });
};
