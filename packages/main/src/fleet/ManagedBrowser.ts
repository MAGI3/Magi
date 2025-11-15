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
  onCreatePageFromWindowOpen?: (url: string, afterPageId: string) => Promise<string>;
}

export interface CreateManagedPageOptions {
  url?: string | null;
  isActive?: boolean;
  afterPageId?: string; // Insert new page after this page
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

    // Log page creation details
    const currentPageIds = Array.from(this.pages.keys());
    logger.info('Creating new page', {
      browserId: this.browserId,
      pageId,
      url: options.url,
      isActive: options.isActive,
      afterPageId: options.afterPageId,
      currentPageCount: this.pages.size,
      currentPageIds,
      hasAfterPageId: options.afterPageId ? this.pages.has(options.afterPageId) : false
    });

    const page = new ManagedPage({
      browserId: this.browserId,
      pageId,
      session: this.session,
      store: this.store,
      wsEndpoint,
      initialUrl: options.url ?? null,
      isActive: options.isActive ?? false,
      onStateChange: this.options.onStateChange,
      onCreatePage: async (url: string, afterPageId: string) => {
        // Handle window.open by delegating to BrowserFleetManager
        logger.info('Handling window.open event', { url, afterPageId });
        if (this.options.onCreatePageFromWindowOpen) {
          return await this.options.onCreatePageFromWindowOpen(url, afterPageId);
        }
        // Fallback: create page locally (should not happen)
        logger.warn('No onCreatePageFromWindowOpen handler, creating page locally');
        const newPage = this.createPage({ url, afterPageId, isActive: true });
        return newPage.pageId;
      }
    });

    // Insert page at the correct position
    logger.info('Checking insert position conditions', {
      pageId,
      afterPageId: options.afterPageId,
      hasAfterPageId: !!options.afterPageId,
      afterPageIdType: typeof options.afterPageId,
      afterPageIdExists: options.afterPageId ? this.pages.has(options.afterPageId) : false,
      currentPageIds: Array.from(this.pages.keys())
    });
    
    if (options.afterPageId && this.pages.has(options.afterPageId)) {
      logger.info('Inserting page after specified page', {
        pageId,
        afterPageId: options.afterPageId
      });
      
      // Insert after the specified page by rebuilding the Map
      const newPages = new Map<string, ManagedPage>();
      for (const [id, p] of this.pages) {
        newPages.set(id, p);
        if (id === options.afterPageId) {
          newPages.set(pageId, page);
          logger.info('Inserted page after', { afterPageId: id, newPageId: pageId });
        }
      }
      this.pages.clear();
      for (const [id, p] of newPages) {
        this.pages.set(id, p);
      }
      
      const finalPageIds = Array.from(this.pages.keys());
      logger.info('Page insertion complete', {
        finalPageCount: this.pages.size,
        finalPageIds
      });
    } else {
      logger.info('Adding page to end', {
        pageId,
        reason: options.afterPageId
          ? 'afterPageId not found in pages'
          : 'no afterPageId specified'
      });
      // Add to the end (default behavior)
      this.pages.set(pageId, page);
    }

    // Sync the page order to the store
    this.syncPageOrder();

    // Note: Navigation should be deferred until BrowserView is attached to window
    // This is now handled by BrowserFleetManager after attachActiveView()

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

    // Sync the updated page order to the store
    this.syncPageOrder();

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
    const resolved = this.options.pageEndpointTemplate
      .replace('{browserId}', this.browserId)
      .replace('{pageId}', pageId);
    
    logger.info('[ManagedBrowser] Resolving page endpoint', {
      browserId: this.browserId,
      pageId,
      template: this.options.pageEndpointTemplate,
      resolved
    });
    
    return resolved;
  }

  private syncPageOrder(): void {
    // Sync the internal page order to the store's pageIds array
    const pageIds = Array.from(this.pages.keys());
    this.store.setPageOrder(this.browserId, pageIds);
    
    logger.info('Synced page order to store', {
      browserId: this.browserId,
      pageIds,
      pageCount: pageIds.length
    });
  }

  private notifyState() {
    this.options.onStateChange();
  }
}
