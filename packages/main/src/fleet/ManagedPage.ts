import { BrowserView, type Rectangle, type Session } from 'electron';
import type { Event as ElectronEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  BrowserFleetStateStore,
  createManagedPage,
  type ManagedPageModel
} from '@magi/shared-state';
import { logger } from '../utils/logger.js';

export interface ManagedPageOptions {
  browserId: string;
  session: Session;
  store: BrowserFleetStateStore;
  wsEndpoint: string;
  pageId?: string;
  initialUrl?: string | null;
  title?: string | null;
  favicon?: string | null;
  isActive?: boolean;
  onStateChange?: () => void;
}

export class ManagedPage {
  readonly pageId: string;
  readonly browserId: string;
  readonly view: BrowserView;
  readonly session: Session;
  readonly store: BrowserFleetStateStore;
  wsEndpoint: string;

  private readonly notifyState: () => void;
  private readonly listeners = new Map<string, (...args: any[]) => void>();

  constructor(private readonly options: ManagedPageOptions) {
    this.browserId = options.browserId;
    this.pageId = options.pageId ?? randomUUID();
    this.session = options.session;
    this.wsEndpoint = options.wsEndpoint;
    this.store = options.store;
    this.notifyState = options.onStateChange ?? (() => {});

    this.view = new BrowserView({
      webPreferences: {
        session: this.session,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.registerListeners();

    const pageModel = createManagedPage({
      browserId: this.browserId,
      pageId: this.pageId,
      wsEndpoint: this.wsEndpoint,
      title: options.title ?? null,
      url: options.initialUrl ?? null,
      favicon: options.favicon ?? null,
      isActive: options.isActive ?? false
    });

    this.store.upsertPage(pageModel);
    this.notifyState();
  }

  private registerListeners() {
    const { webContents } = this.view;

    const onPageTitleUpdated = (_event: ElectronEvent, title: string) => {
      this.updatePage((page) => {
        page.title = title;
      });
    };
    webContents.on('page-title-updated', onPageTitleUpdated);
    this.listeners.set('page-title-updated', onPageTitleUpdated);

    const onPageFaviconUpdated = (_event: ElectronEvent, favicons: string[]) => {
      this.updatePage((page) => {
        page.favicon = favicons[0] ?? null;
      });
    };
    webContents.on('page-favicon-updated', onPageFaviconUpdated);
    this.listeners.set('page-favicon-updated', onPageFaviconUpdated);

    const onDidStartNavigation = (
      _event: ElectronEvent,
      url: string,
      isInPlace: boolean
    ) => {
      logger.debug('Page navigation started', { url, pageId: this.pageId, isInPlace });
      this.updatePage((page) => {
        page.url = url;
        page.navigationState = {
          ...page.navigationState,
          isLoading: true
        };
      });
    };
    webContents.on('did-start-navigation', onDidStartNavigation);
    this.listeners.set('did-start-navigation', onDidStartNavigation);

    const onDidNavigate = (_event: ElectronEvent, url: string) => {
      this.updateNavigationState(url);
    };
    webContents.on('did-navigate', onDidNavigate);
    this.listeners.set('did-navigate', onDidNavigate);

    const onDidStopLoading = () => {
      this.updateNavigationState();
    };
    webContents.on('did-stop-loading', onDidStopLoading);
    this.listeners.set('did-stop-loading', onDidStopLoading);

    const onDidStartLoading = () => {
      this.updatePage((page) => {
        page.navigationState = {
          ...page.navigationState,
          isLoading: true
        };
      });
    };
    webContents.on('did-start-loading', onDidStartLoading);
    this.listeners.set('did-start-loading', onDidStartLoading);

    const onDestroyed = () => {
      logger.info('WebContents destroyed for page', this.pageId);
    };
    webContents.on('destroyed', onDestroyed);
    this.listeners.set('destroyed', onDestroyed);
  }

  private updatePage(mutator: (page: ManagedPageModel) => void) {
    const page = this.store.getPage(this.pageId);
    if (!page) return;
    mutator(page);
    this.store.upsertPage(page);
    this.notifyState();
  }

  private updateNavigationState(url?: string) {
    const { webContents } = this.view;
    this.updatePage((page) => {
      if (url) {
        page.url = url;
      }
      page.navigationState = {
        canGoBack: webContents.canGoBack(),
        canGoForward: webContents.canGoForward(),
        isLoading: webContents.isLoadingMainFrame()
      };
    });
  }

  async navigate(url: string) {
    await this.view.webContents.loadURL(url);
  }

  async reload(bypassCache = false) {
    if (bypassCache) {
      this.view.webContents.reloadIgnoringCache();
    } else {
      this.view.webContents.reload();
    }
  }

  async goBack() {
    if (this.view.webContents.canGoBack()) {
      this.view.webContents.goBack();
    }
  }

  async goForward() {
    if (this.view.webContents.canGoForward()) {
      this.view.webContents.goForward();
    }
  }

  setActive(isActive: boolean) {
    this.updatePage((page) => {
      page.isActive = isActive;
    });
  }

  setBounds(bounds: Rectangle) {
    this.view.setBounds(bounds);
  }

  destroy() {
    const { webContents } = this.view;
    
    // Remove all event listeners before destroying
    if (!webContents.isDestroyed()) {
      this.listeners.forEach((listener, eventName) => {
        webContents.removeListener(eventName as any, listener);
      });
      this.listeners.clear();
    }
  }
}
