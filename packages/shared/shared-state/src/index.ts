import {
  BrowserFleetState,
  BrowserFleetStateSchema,
  BrowserId,
  BrowserStatusSchema,
  ManagedBrowser,
  ManagedPage,
  PageId
} from '@magi/ipc-schema';
import { z } from 'zod';

// Re-export types from ipc-schema for convenience
export type { ManagedBrowser, ManagedPage, BrowserId, PageId } from '@magi/ipc-schema';

export type ManagedBrowserModel = ManagedBrowser & {
  createdAt: number;
  updatedAt: number;
};

export type ManagedPageModel = ManagedPage & {
  createdAt: number;
  updatedAt: number;
  browserId: BrowserId;
};

const FleetStateSchema = z.object({
  browsers: z.map(z.string(), z.custom<ManagedBrowserModel>()),
  pages: z.map(z.string(), z.custom<ManagedPageModel>())
});

type InternalFleetState = z.infer<typeof FleetStateSchema>;

export interface CreateManagedBrowserInput {
  browserId: BrowserId;
  name: string;
  browserWSEndpoint: string;
  pageWSEndpointTemplate: string;
  profilePartition?: string | null;
  version?: string;
  userAgent?: string;
}

export interface CreateManagedPageInput {
  browserId: BrowserId;
  pageId: PageId;
  wsEndpoint: string;
  title?: string | null;
  url?: string | null;
  favicon?: string | null;
  isActive?: boolean;
}

const now = () => Date.now();

const createEmptyNavigationState = () => ({
  canGoBack: false,
  canGoForward: false,
  isLoading: false
});

const createEmptyDownloadState = () => ({
  items: [],
  activeCount: 0
});

const createEmptyThumbnailState = () => ({
  dataUrl: null,
  lastUpdatedAt: null
});

export const createManagedBrowser = (input: CreateManagedBrowserInput): ManagedBrowserModel => {
  const timestamp = now();

  return {
    browserId: input.browserId,
    name: input.name,
    profilePartition: input.profilePartition ?? null,
    status: 'ready',
    endpoints: {
      browserWSEndpoint: input.browserWSEndpoint,
      pageWSEndpointTemplate: input.pageWSEndpointTemplate
    },
    statistics: {
      pageCount: 0,
      contextCount: 0,
      uptimeMs: 0
    },
    version: input.version,
    userAgent: input.userAgent,
    activePageId: null,
    pages: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const createManagedPage = (input: CreateManagedPageInput): ManagedPageModel => {
  const timestamp = now();

  return {
    pageId: input.pageId,
    title: input.title ?? null,
    url: input.url ?? null,
    favicon: input.favicon ?? null,
    isActive: input.isActive ?? false,
    wsEndpoint: input.wsEndpoint,
    sessionId: null,
    navigationState: createEmptyNavigationState(),
    downloadState: createEmptyDownloadState(),
    thumbnail: createEmptyThumbnailState(),
    createdAt: timestamp,
    updatedAt: timestamp,
    browserId: input.browserId
  };
};

export class BrowserFleetStateStore {
  readonly browsers = new Map<BrowserId, ManagedBrowserModel>();
  readonly pages = new Map<PageId, ManagedPageModel>();

  static fromJSON(state: BrowserFleetState): BrowserFleetStateStore {
    BrowserFleetStateSchema.parse(state);
    const store = new BrowserFleetStateStore();

    state.browsers.forEach((browser: ManagedBrowser) => {
      const browserModel: ManagedBrowserModel = {
        ...browser,
        createdAt: now(),
        updatedAt: now()
      };

      store.browsers.set(browser.browserId, browserModel);

      browser.pages.forEach((page: ManagedPage) => {
        const pageModel: ManagedPageModel = {
          ...page,
          browserId: browser.browserId,
          createdAt: now(),
          updatedAt: now()
        };
        store.pages.set(page.pageId, pageModel);
      });
    });

    return store;
  }

  toJSON(): BrowserFleetState {
    const browsers: ManagedBrowser[] = [];

    for (const browser of this.browsers.values()) {
      browsers.push({
        browserId: browser.browserId,
        name: browser.name,
        profilePartition: browser.profilePartition,
        status: browser.status,
        endpoints: browser.endpoints,
        statistics: browser.statistics,
        version: browser.version,
        userAgent: browser.userAgent,
        activePageId: browser.activePageId ?? null,
        pages: this.getPagesForBrowser(browser.browserId).map((page) => ({
          pageId: page.pageId,
          title: page.title,
          url: page.url,
          favicon: page.favicon,
          isActive: page.isActive,
          wsEndpoint: page.wsEndpoint,
          sessionId: page.sessionId,
          navigationState: page.navigationState,
          downloadState: page.downloadState,
          thumbnail: page.thumbnail
        }))
      });
    }

    return { browsers };
  }

  getBrowser(browserId: BrowserId): ManagedBrowserModel | undefined {
    return this.browsers.get(browserId);
  }

  getPage(pageId: PageId): ManagedPageModel | undefined {
    return this.pages.get(pageId);
  }

  getPagesForBrowser(browserId: BrowserId): ManagedPageModel[] {
    return Array.from(this.pages.values()).filter((page) => page.browserId === browserId);
  }

  upsertBrowser(browser: ManagedBrowserModel): void {
    BrowserStatusSchema.parse(browser.status);
    this.browsers.set(browser.browserId, { ...browser, updatedAt: now() });
  }

  removeBrowser(browserId: BrowserId): void {
    const pageIds = Array.from(this.pages.entries())
      .filter(([, page]) => page.browserId === browserId)
      .map(([pageId]) => pageId);

    pageIds.forEach((pageId) => this.pages.delete(pageId));
    this.browsers.delete(browserId);
  }

  upsertPage(page: ManagedPageModel): void {
    this.pages.set(page.pageId, { ...page, updatedAt: now() });

    const browser = this.browsers.get(page.browserId);
    if (browser) {
      browser.updatedAt = now();
      browser.statistics.pageCount = this.getPagesForBrowser(page.browserId).length;
      if (page.isActive) {
        browser.activePageId = page.pageId;
      }
      this.browsers.set(page.browserId, browser);
    }
  }

  removePage(browserId: BrowserId, pageId: PageId): void {
    const page = this.pages.get(pageId);
    if (!page) return;

    this.pages.delete(pageId);

    const browser = this.browsers.get(browserId);
    if (!browser) return;

    const remainingPages = this.getPagesForBrowser(browserId);
    browser.statistics.pageCount = remainingPages.length;
    if (browser.activePageId === pageId) {
      browser.activePageId = remainingPages[0]?.pageId ?? null;
      if (browser.activePageId) {
        const newActive = this.pages.get(browser.activePageId);
        if (newActive) {
          newActive.isActive = true;
          newActive.updatedAt = now();
          this.pages.set(newActive.pageId, newActive);
        }
      }
    }

    browser.updatedAt = now();
    this.browsers.set(browserId, browser);
  }

  setBrowserStatus(browserId: BrowserId, status: ManagedBrowserModel['status']): void {
    const browser = this.browsers.get(browserId);
    if (!browser) return;

    browser.status = status;
    browser.updatedAt = now();
    this.browsers.set(browserId, browser);
  }

  setBrowserStatistics(
    browserId: BrowserId,
    statistics: ManagedBrowserModel['statistics']
  ): void {
    const browser = this.browsers.get(browserId);
    if (!browser) return;

    browser.statistics = statistics;
    browser.updatedAt = now();
    this.browsers.set(browserId, browser);
  }

  setPageSession(pageId: PageId, sessionId: ManagedPageModel['sessionId']): void {
    const page = this.pages.get(pageId);
    if (!page) return;

    page.sessionId = sessionId;
    page.updatedAt = now();
    this.pages.set(pageId, page);
  }

  setPageNavigationState(
    pageId: PageId,
    navigationState: ManagedPageModel['navigationState']
  ): void {
    const page = this.pages.get(pageId);
    if (!page) return;

    page.navigationState = navigationState;
    page.updatedAt = now();
    this.pages.set(pageId, page);
  }

  setPageDownloadState(pageId: PageId, downloadState: ManagedPageModel['downloadState']): void {
    const page = this.pages.get(pageId);
    if (!page) return;

    page.downloadState = downloadState;
    page.updatedAt = now();
    this.pages.set(pageId, page);
  }

  setPageThumbnail(pageId: PageId, dataUrl: string | null): void {
    const page = this.pages.get(pageId);
    if (!page) return;

    page.thumbnail = {
      dataUrl,
      lastUpdatedAt: now()
    };
    page.updatedAt = now();
    this.pages.set(pageId, page);
  }

  setActivePage(browserId: BrowserId, pageId: PageId | null): void {
    const browser = this.browsers.get(browserId);
    if (!browser) return;

    const pages = this.getPagesForBrowser(browserId);
    pages.forEach((page) => {
      const isActive = page.pageId === pageId;
      if (page.isActive !== isActive) {
        page.isActive = isActive;
        page.updatedAt = now();
        this.pages.set(page.pageId, page);
      }
    });

    browser.activePageId = pageId ?? null;
    browser.updatedAt = now();
    this.browsers.set(browserId, browser);
  }

  clear(): void {
    this.browsers.clear();
    this.pages.clear();
  }

  clone(): BrowserFleetStateStore {
    const snapshot: InternalFleetState = {
      browsers: new Map(this.browsers),
      pages: new Map(this.pages)
    };

    FleetStateSchema.parse(snapshot);

    const clone = new BrowserFleetStateStore();

    snapshot.browsers.forEach((browser) => clone.browsers.set(browser.browserId, { ...browser }));
    snapshot.pages.forEach((page) => clone.pages.set(page.pageId, { ...page }));

    return clone;
  }
}
