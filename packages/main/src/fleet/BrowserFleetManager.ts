import { BrowserView, BrowserWindow, type Rectangle } from 'electron';
import { EventEmitter } from 'node:events';
import { BrowserFleetStateStore } from '@magi/shared-state';
import type { BrowserFleetState } from '@magi/ipc-schema';
import { logger } from '../utils/logger.js';
import { ManagedBrowser } from './ManagedBrowser.js';
import { ManagedPage } from './ManagedPage.js';

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
  private attachedView: BrowserView | null = null;
  private browserEndpointTemplate =
    'ws://localhost:9222/devtools/browser/{browserId}';
  private pageEndpointTemplate =
    'ws://localhost:9222/devtools/page/{pageId}';

  constructor(private readonly window: BrowserWindow) {
    this.contentBounds = window.getContentBounds();
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
      onStateChange: () => this.emitState()
    });

    this.browsers.set(browser.browserId, browser);

    browser.createPage({
      url: options.initialUrl ?? 'https://www.electronjs.org',
      isActive: true
    });

    this.attachActiveView(browser.browserId);

    return browser;
  }

  destroyBrowser(browserId: string) {
    logger.info('Destroying browser', browserId);
    const browser = this.browsers.get(browserId);
    if (!browser) return;

    if (this.attachedView) {
      const currentView = this.attachedView;
      if (this.window.getBrowserViews().includes(currentView)) {
        this.window.removeBrowserView(currentView);
      }
      this.attachedView = null;
    }

    browser.dispose();
    this.browsers.delete(browserId);
    this.emitState();
  }

  createPage(options: CreatePageOptions) {
    const browser = this.browsers.get(options.browserId);
    if (!browser) {
      logger.warn('Browser not found when creating page', options.browserId);
      return;
    }

    const page = browser.createPage({
      url: options.url ?? null,
      isActive: options.activate ?? true
    });

    if (options.activate ?? true) {
      this.attachActiveView(options.browserId);
    }

    this.emitState();
    return page;
  }

  closePage(options: ClosePageOptions) {
    const browser = this.browsers.get(options.browserId);
    if (!browser) return;

    browser.removePage(options.pageId);

    this.attachActiveView(options.browserId);
    this.emitState();
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

    if (this.attachedView && this.window.getBrowserViews().includes(this.attachedView)) {
      this.window.removeBrowserView(this.attachedView);
    }

    this.attachedView = page.view;
    this.window.addBrowserView(page.view);
    this.applyBounds();
  }

  detachView() {
    if (this.attachedView && this.window.getBrowserViews().includes(this.attachedView)) {
      this.window.removeBrowserView(this.attachedView);
    }
    this.attachedView = null;
  }

  private applyBounds() {
    if (!this.attachedView) return;

    this.attachedView.setAutoResize({
      width: true,
      height: true
    });

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
