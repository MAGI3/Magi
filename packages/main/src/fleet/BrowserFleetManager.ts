import { WebContentsView, BrowserWindow, type Rectangle, app } from 'electron';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import { BrowserFleetStateStore } from '@magi/shared-state';
import type { BrowserFleetState } from '@magi/ipc-schema';
import { logger } from '../utils/logger.js';
import { ManagedBrowser } from './ManagedBrowser.js';
import { ManagedPage } from './ManagedPage.js';
import type { CdpSessionManager } from '../cdp/CdpSessionManager.js';
import type { CdpGateway } from '../cdp/CdpGateway.js';

export interface CreateBrowserOptions {
  name?: string;
  partition?: string | null;
  userAgent?: string;
  headless?: boolean;
  initialUrl?: string;
}

export interface NavigatePageOptions {
  browserId: string;
  pageId: string;
  url: string;
}

export interface SelectPageOptions {
  browserId: string;
  pageId: string;
}

export interface CreatePageOptions {
  browserId: string;
  url?: string | null;
  activate?: boolean;
  afterPageId?: string; // Insert new page after this page
}

export interface ClosePageOptions {
  browserId: string;
  pageId: string;
}

export interface FleetManagerEvents {
  state: (state: BrowserFleetState) => void;
}

type FleetManagerEventKeys = keyof FleetManagerEvents;

export class BrowserFleetManager {
  private readonly browsers = new Map<string, ManagedBrowser>();
  private readonly store = new BrowserFleetStateStore();
  private readonly emitter = new EventEmitter();
  private contentBounds: Rectangle;
  private attachedView: WebContentsView | null = null;
  private browserEndpointTemplate =
    'ws://localhost:9222/devtools/browser/{browserId}';
  private pageEndpointTemplate =
    'ws://localhost:9222/devtools/page/{pageId}';

  constructor(
    private readonly window: BrowserWindow,
    private readonly cdpSessionManager?: CdpSessionManager,
    private cdpGateway?: CdpGateway
  ) {
    this.contentBounds = window.getContentBounds();
    
    // Listen to CDP events from CdpSessionManager for CDP → UI synchronization
    if (this.cdpSessionManager) {
      this.cdpSessionManager.on('cdp-event', this.handleCdpEvent.bind(this));
      logger.info('BrowserFleetManager: Listening to CDP events from CdpSessionManager');
    }
  }

  /**
   * Set the CDP gateway instance (used for delayed injection to break circular dependency)
   */
  setCdpGateway(gateway: CdpGateway) {
    this.cdpGateway = gateway;
    logger.info('BrowserFleetManager: CDP Gateway injected');
  }

  /**
   * Handle CDP events from CdpSessionManager to update UI state (CDP → UI sync)
   */
  private handleCdpEvent(event: {
    pageId: string;
    method: string;
    params: Record<string, unknown>;
  }) {
    logger.debug('BrowserFleetManager: Received CDP event', {
      pageId: event.pageId,
      method: event.method
    });

    const page = this.getPage(event.pageId);
    if (!page) {
      logger.warn('BrowserFleetManager: Page not found for CDP event', {
        pageId: event.pageId,
        method: event.method
      });
      return;
    }

    // Update page state based on CDP events
    switch (event.method) {
      case 'Page.frameNavigated':
        if (event.params.frame && typeof event.params.frame === 'object') {
          const frame = event.params.frame as { url?: string };
          if (frame.url && typeof frame.url === 'string') {
            logger.info('BrowserFleetManager: Updating page URL from CDP event', {
              pageId: event.pageId,
              url: frame.url
            });
            // The ManagedPage already handles navigation events through webContents listeners
            // This is just for additional synchronization if needed
          }
        }
        break;

      case 'Page.loadEventFired':
        logger.debug('BrowserFleetManager: Page load event fired', {
          pageId: event.pageId
        });
        // ManagedPage handles this through did-finish-load
        break;

      case 'Page.domContentEventFired':
        logger.debug('BrowserFleetManager: DOM content loaded', {
          pageId: event.pageId
        });
        // ManagedPage handles this through dom-ready
        break;

      default:
        // Other CDP events can be handled here as needed
        break;
    }

    // Emit state update to keep UI in sync
    this.emitState();
  }

  private getDefaultHomeUrl(): string {
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      return 'http://localhost:5173/default-home.html';
    } else {
      return `file://${path.join(app.getAppPath(), 'packages/renderer/dist/default-home.html')}`;
    }
  }

  setEndpointTemplates(options: { browser: string; page: string }) {
    this.browserEndpointTemplate = options.browser;
    this.pageEndpointTemplate = options.page;
  }

  on<TEvent extends FleetManagerEventKeys>(
    event: TEvent,
    listener: FleetManagerEvents[TEvent]
  ) {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  off<TEvent extends FleetManagerEventKeys>(
    event: TEvent,
    listener: FleetManagerEvents[TEvent]
  ) {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  emitState() {
    for (const browser of this.browsers.values()) {
      const model = browser.model;
      if (model) {
        const uptime = Date.now() - browser.createdAt;
        this.store.setBrowserStatistics(browser.browserId, {
          ...model.statistics,
          uptimeMs: uptime,
          pageCount: browser.pagesList.length,
          contextCount: 1
        });
      }
    }

    this.emitter.emit('state', this.store.toJSON());
  }

  getState(): BrowserFleetState {
    return this.store.toJSON();
  }

  createBrowser(options: CreateBrowserOptions = {}): ManagedBrowser {
    logger.info('Creating browser', options);

    const browser = new ManagedBrowser({
      window: this.window,
      store: this.store,
      initialUrl: options.initialUrl,
      name: options.name,
      partition: options.partition ?? null,
      userAgent: options.userAgent,
      headless: options.headless,
      browserEndpointTemplate: this.browserEndpointTemplate,
      pageEndpointTemplate: this.pageEndpointTemplate.replace(
        '{browserId}',
        '{browserId}'
      ),
      onStateChange: () => this.emitState(),
      onCreatePageFromWindowOpen: async (url: string, afterPageId: string) => {
        logger.info('Creating page from window.open via BrowserFleetManager', {
          browserId: browser.browserId,
          url,
          afterPageId
        });
        const page = this.createPage({
          browserId: browser.browserId,
          url: url,
          activate: true,
          afterPageId: afterPageId
        });
        return page?.pageId || '';
      }
    });

    this.browsers.set(browser.browserId, browser);

    // Create initial page with default home or specified URL
    const initialUrl = options.initialUrl ?? this.getDefaultHomeUrl();
    const page = browser.createPage({
      url: initialUrl,
      isActive: true
    });

    // Attach view first, then navigate
    this.attachActiveView(browser.browserId);

    // Navigate after BrowserView is attached to window
    if (page) {
      page.navigate(initialUrl).catch((error) => {
        logger.error('Failed to navigate initial page', {
          browserId: browser.browserId,
          pageId: page.pageId,
          url: initialUrl,
          error
        });
      });
    }

    return browser;
  }

  destroyBrowser(browserId: string) {
    logger.info('Destroying browser', browserId);
    const browser = this.browsers.get(browserId);
    if (!browser) return;

    if (this.attachedView) {
      const currentView = this.attachedView;
      if (this.window.contentView.children.includes(currentView)) {
        this.window.contentView.removeChildView(currentView);
      }
      this.attachedView = null;
    }

    browser.dispose();
    this.browsers.delete(browserId);
    this.emitState();
  }

  createPage(options: CreatePageOptions) {
    logger.info('BrowserFleetManager.createPage called', {
      browserId: options.browserId,
      url: options.url,
      activate: options.activate,
      afterPageId: options.afterPageId,
      hasAfterPageId: !!options.afterPageId
    });

    const browser = this.browsers.get(options.browserId);
    if (!browser) {
      logger.warn('Browser not found when creating page', options.browserId);
      return;
    }

    // Use default home URL if no URL provided (like createBrowser does)
    const pageUrl = options.url ?? this.getDefaultHomeUrl();

    logger.info('Calling browser.createPage with options', {
      browserId: options.browserId,
      url: pageUrl,
      isActive: options.activate ?? true,
      afterPageId: options.afterPageId,
      currentPageCount: browser.pagesList.length
    });

    const page = browser.createPage({
      url: pageUrl,
      isActive: options.activate ?? true,
      afterPageId: options.afterPageId
    });

    if (options.activate ?? true) {
      this.attachActiveView(options.browserId);
      
      // Navigate after BrowserView is attached to window
      if (page) {
        page.navigate(pageUrl).catch((error) => {
          logger.error('Failed to navigate new page', {
            browserId: options.browserId,
            pageId: page.pageId,
            url: pageUrl,
            error
          });
        });
      }
    }

    this.emitState();

    // UI → CDP sync: Broadcast Target.targetCreated event to CDP clients
    if (page && this.cdpGateway) {
      const model = this.store.getPage(page.pageId);
      if (model) {
        this.cdpGateway.broadcastTargetCreated(options.browserId, {
          pageId: page.pageId,
          url: model.url ?? 'about:blank',
          title: model.title ?? ''
        });
        logger.info('BrowserFleetManager: Broadcasted Target.targetCreated', {
          browserId: options.browserId,
          pageId: page.pageId
        });
      }
    }

    return page;
  }

  closePage(options: ClosePageOptions) {
    const browser = this.browsers.get(options.browserId);
    if (!browser) return;

    browser.removePage(options.pageId);

    this.attachActiveView(options.browserId);
    this.emitState();

    // UI → CDP sync: Broadcast Target.targetDestroyed event to CDP clients
    if (this.cdpGateway) {
      this.cdpGateway.broadcastTargetDestroyed(options.browserId, options.pageId);
      logger.info('BrowserFleetManager: Broadcasted Target.targetDestroyed', {
        browserId: options.browserId,
        pageId: options.pageId
      });
    }
  }

  selectPage(options: SelectPageOptions) {
    const browser = this.browsers.get(options.browserId);
    if (!browser) return;

    browser.setActivePage(options.pageId);
    this.attachActiveView(options.browserId);
    this.emitState();
  }

  navigatePage(options: NavigatePageOptions) {
    const browser = this.browsers.get(options.browserId);
    if (!browser) return;

    const page = browser.pagesList.find((p) => p.pageId === options.pageId);
    if (!page) return;

    page.navigate(options.url).catch((error) => {
      logger.error('Failed to navigate page', {
        browserId: options.browserId,
        pageId: options.pageId,
        error
      });
    });
  }

  updateContentBounds(bounds: Rectangle) {
    this.contentBounds = bounds;
    this.applyBounds();
  }

  getBrowser(browserId: string): ManagedBrowser | undefined {
    return this.browsers.get(browserId);
  }

  getPage(pageId: string): ManagedPage | undefined {
    for (const browser of this.browsers.values()) {
      const page = browser.getPage(pageId);
      if (page) return page;
    }
    return undefined;
  }

  attachActiveView(browserId: string) {
    const browser = this.browsers.get(browserId);
    if (!browser) return;

    const model = browser.model;
    const activePageId = model?.activePageId ?? browser.pagesList[0]?.pageId;
    if (!activePageId) {
      this.detachView();
      return;
    }

    const page = browser.pagesList.find((p) => p.pageId === activePageId);
    if (!page) {
      this.detachView();
      return;
    }

    if (this.attachedView && this.window.contentView.children.includes(this.attachedView)) {
      this.window.contentView.removeChildView(this.attachedView);
    }

    this.attachedView = page.view;
    this.window.contentView.addChildView(page.view);
    this.applyBounds();
  }

  detachView() {
    if (this.attachedView && this.window.contentView.children.includes(this.attachedView)) {
      this.window.contentView.removeChildView(this.attachedView);
    }
    this.attachedView = null;
  }

  private applyBounds() {
    if (!this.attachedView) return;

    const bounds: Rectangle = {
      x: this.contentBounds.x,
      y: this.contentBounds.y,
      width: Math.max(0, this.contentBounds.width),
      height: Math.max(0, this.contentBounds.height)
    };

    this.attachedView.setBounds(bounds);
  }

  dispose() {
    for (const browser of this.browsers.values()) {
      browser.dispose();
    }
    this.browsers.clear();
    this.detachView();
  }
}
