import { BrowserWindow, session, type Rectangle } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  BrowserFleetStateStore,
  createManagedBrowser,
  type ManagedBrowserModel
} from '@magi/shared-state';
import { ManagedPage } from './ManagedPage.js';
import { logger } from '../utils/logger.js';

export interface ManagedBrowserOptions {
  window: BrowserWindow;
  store: BrowserFleetStateStore;
  name?: string;
  partition?: string | null;
  userAgent?: string;
  headless?: boolean;
  initialUrl?: string | null;
  browserEndpointTemplate: string;
  pageEndpointTemplate: string;
  onStateChange: () => void;
}

export interface CreateManagedPageOptions {
  url?: string | null;
  isActive?: boolean;
}

export class ManagedBrowser {
  readonly browserId: string;
  readonly store: BrowserFleetStateStore;
  readonly window: BrowserWindow;
  readonly createdAt: number;
  readonly session: Electron.Session;
  readonly name: string;

  private readonly pages = new Map<string, ManagedPage>();
  private activePageId: string | null = null;
  private disposed = false;

  constructor(private readonly options: ManagedBrowserOptions) {
    this.browserId = randomUUID();
    this.store = options.store;
    this.window = options.window;
    this.name = options.name ?? `Browser ${this.browserId.slice(0, 4).toUpperCase()}`;
    this.createdAt = Date.now();

    const partition = options.partition ?? `persist:magi-${this.browserId}`;
    this.session = session.fromPartition(partition, {
      cache: true
    });

    if (options.userAgent) {
      this.session.setUserAgent(options.userAgent);
    }

    const model = createManagedBrowser({
      browserId: this.browserId,
      name: this.name,
      profilePartition: partition,
      browserWSEndpoint: this.resolveBrowserEndpoint(),
      pageWSEndpointTemplate: this.resolvePageEndpoint('{pageId}'),
      version: undefined,
      userAgent: options.userAgent
    });

    this.store.upsertBrowser(model);
    this.notifyState();
  }

  get model(): ManagedBrowserModel | undefined {
    return this.store.getBrowser(this.browserId);
  }

  get pagesList(): ManagedPage[] {
    return Array.from(this.pages.values());
  }

  createPage(options: CreateManagedPageOptions = {}): ManagedPage {
    const pageId = randomUUID();
    const wsEndpoint = this.resolvePageEndpoint(pageId);

    const page = new ManagedPage({
      browserId: this.browserId,
      pageId,
      session: this.session,
      store: this.store,
      wsEndpoint,
      initialUrl: options.url ?? null,
      isActive: options.isActive ?? false,
      onStateChange: this.options.onStateChange
    });

    this.pages.set(pageId, page);

    if (options.url) {
      page
        .navigate(options.url)
        .catch((error) => logger.error('Failed to navigate new page', { error, pageId }));
    }

    if (options.isActive ?? false) {
      this.setActivePage(pageId);
    } else {
      this.notifyState();
    }

    return page;
  }

  setActivePage(pageId: string | null): void {
    if (pageId === this.activePageId) {
      return;
    }

    if (this.activePageId) {
      const current = this.pages.get(this.activePageId);
      current?.setActive(false);
    }

    if (pageId) {
      const next = this.pages.get(pageId);
      if (!next) return;

      next.setActive(true);
      this.activePageId = pageId;
      this.store.setActivePage(this.browserId, pageId);
      this.notifyState();
      return;
    }

    this.activePageId = null;
    this.store.setActivePage(this.browserId, null);
    this.notifyState();
  }

  removePage(pageId: string): void {
    const page = this.pages.get(pageId);
    if (!page) return;

    page.destroy();
    this.pages.delete(pageId);

    const shouldActivate =
      this.activePageId === pageId ? this.pages.keys().next().value ?? null : this.activePageId;

    this.store.removePage(this.browserId, pageId);

    if (shouldActivate) {
      this.setActivePage(shouldActivate);
    } else {
      this.setActivePage(null);
    }
  }

  setBounds(bounds: Rectangle) {
    if (!this.activePageId) return;

    const page = this.pages.get(this.activePageId);
    page?.setBounds(bounds);
  }

  updatePageThumbnail(pageId: string, dataUrl: string): void {
    this.store.setPageThumbnail(pageId, dataUrl);
    this.notifyState();
  }

  toJSON(): ManagedBrowserModel | undefined {
    return this.store.getBrowser(this.browserId);
  }

  getActivePage(): ManagedPage | undefined {
    if (!this.activePageId) return undefined;
    return this.pages.get(this.activePageId);
  }

  getPage(pageId: string): ManagedPage | undefined {
    return this.pages.get(pageId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const page of this.pages.values()) {
      page.destroy();
    }

    this.pages.clear();
    this.activePageId = null;
    this.store.removeBrowser(this.browserId);
    this.notifyState();
  }

  private resolveBrowserEndpoint(): string {
    return this.options.browserEndpointTemplate.replace('{browserId}', this.browserId);
  }

  private resolvePageEndpoint(pageId: string): string {
    return this.options.pageEndpointTemplate
      .replace('{browserId}', this.browserId)
      .replace('{pageId}', pageId);
  }

  private notifyState() {
    this.options.onStateChange();
  }
}
