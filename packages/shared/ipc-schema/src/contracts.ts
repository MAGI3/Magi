import { z } from 'zod';

export const BrowserIdSchema = z.string().min(1).describe('Unique browser identifier');
export const BrowserContextIdSchema = z.string().min(1).describe('Unique browser context identifier');
export const PageIdSchema = z.string().min(1).describe('Unique page identifier');
export const SessionIdSchema = z.string().min(1).describe('CDP session identifier');
export const UrlSchema = z.string().url().describe('Valid URL string');

export const ThumbnailStateSchema = z.object({
  dataUrl: z.string().nullable(),
  lastUpdatedAt: z.number().int().nullable()
});

export const NavigationStateSchema = z.object({
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  isLoading: z.boolean()
});

export const DownloadItemSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  receivedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative().nullable(),
  state: z.enum(['progressing', 'completed', 'cancelled', 'interrupted'])
});

export const DownloadStateSchema = z.object({
  items: z.array(DownloadItemSchema),
  activeCount: z.number().nonnegative()
});

export const ManagedPageSchema = z.object({
  pageId: PageIdSchema,
  title: z.string().optional().nullable(),
  url: UrlSchema.optional().nullable(),
  favicon: z.string().url().optional().nullable(),
  isActive: z.boolean(),
  wsEndpoint: z.string().min(1),
  sessionId: SessionIdSchema.optional().nullable(),
  navigationState: NavigationStateSchema,
  downloadState: DownloadStateSchema,
  thumbnail: ThumbnailStateSchema
});

export const BrowserEndpointSchema = z.object({
  browserWSEndpoint: z.string().url(),
  pageWSEndpointTemplate: z.string().url()
});

export const BrowserStatisticsSchema = z.object({
  pageCount: z.number().nonnegative(),
  contextCount: z.number().nonnegative(),
  uptimeMs: z.number().nonnegative()
});

export const BrowserStatusSchema = z.enum(['ready', 'starting', 'closing', 'error']);

export const ManagedBrowserSchema = z.object({
  browserId: BrowserIdSchema,
  name: z.string(),
  profilePartition: z.string().optional().nullable(),
  status: BrowserStatusSchema,
  endpoints: BrowserEndpointSchema,
  statistics: BrowserStatisticsSchema,
  version: z.string().optional(),
  userAgent: z.string().optional(),
  activePageId: PageIdSchema.optional().nullable(),
  pages: z.array(ManagedPageSchema)
});

export const BrowserFleetStateSchema = z.object({
  browsers: z.array(ManagedBrowserSchema)
});

export const CreateBrowserOptionsSchema = z.object({
  name: z.string().min(1),
  partition: z.string().optional(),
  userAgent: z.string().optional(),
  headless: z.boolean().optional().default(false)
});

export const CreatePageOptionsSchema = z.object({
  url: UrlSchema.optional(),
  activate: z.boolean().optional().default(true)
});

export const RectangleSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number()
});

export const BrowserActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('browser:create'),
    payload: CreateBrowserOptionsSchema
  }),
  z.object({
    type: z.literal('browser:destroy'),
    browserId: BrowserIdSchema
  }),
  z.object({
    type: z.literal('page:create'),
    browserId: BrowserIdSchema,
    payload: CreatePageOptionsSchema.optional()
  }),
  z.object({
    type: z.literal('page:navigate'),
    browserId: BrowserIdSchema,
    pageId: PageIdSchema,
    url: UrlSchema
  }),
  z.object({
    type: z.literal('page:select'),
    browserId: BrowserIdSchema,
    pageId: PageIdSchema
  }),
  z.object({
    type: z.literal('page:close'),
    browserId: BrowserIdSchema,
    pageId: PageIdSchema
  }),
  z.object({
    type: z.literal('page:reload'),
    browserId: BrowserIdSchema,
    pageId: PageIdSchema,
    bypassCache: z.boolean().optional().default(false)
  }),
  z.object({
    type: z.literal('page:navigation'),
    browserId: BrowserIdSchema,
    pageId: PageIdSchema,
    direction: z.enum(['back', 'forward'])
  }),
  z.object({
    type: z.literal('download:cancel'),
    browserId: BrowserIdSchema,
    pageId: PageIdSchema,
    downloadId: z.string()
  }),
  z.object({
    type: z.literal('layout:update'),
    browserId: BrowserIdSchema,
    pageId: PageIdSchema,
    bounds: RectangleSchema
  }),
  z.object({
    type: z.literal('devtools:toggle'),
    browserId: BrowserIdSchema,
    pageId: PageIdSchema
  }),
  z.object({
    type: z.literal('browserview:detach'),
    browserId: BrowserIdSchema
  })
]);

export const BrowserStateEventSchema = z.object({
  type: z.literal('browser:state'),
  payload: BrowserFleetStateSchema
});

export const PageUpdatedEventSchema = z.object({
  type: z.literal('page:updated'),
  browserId: BrowserIdSchema,
  page: ManagedPageSchema
});

export const DownloadProgressEventSchema = z.object({
  type: z.literal('download:progress'),
  browserId: BrowserIdSchema,
  pageId: PageIdSchema,
  download: DownloadItemSchema
});

export const EndpointChangedEventSchema = z.object({
  type: z.literal('browser:endpointChanged'),
  browserId: BrowserIdSchema,
  endpoints: BrowserEndpointSchema
});

export const IpcOutboundEventSchema = z.union([
  BrowserStateEventSchema,
  PageUpdatedEventSchema,
  DownloadProgressEventSchema,
  EndpointChangedEventSchema
]);

export type BrowserId = z.infer<typeof BrowserIdSchema>;
export type BrowserContextId = z.infer<typeof BrowserContextIdSchema>;
export type PageId = z.infer<typeof PageIdSchema>;
export type SessionId = z.infer<typeof SessionIdSchema>;
export type ManagedPage = z.infer<typeof ManagedPageSchema>;
export type ManagedBrowser = z.infer<typeof ManagedBrowserSchema>;
export type BrowserFleetState = z.infer<typeof BrowserFleetStateSchema>;
export type BrowserAction = z.infer<typeof BrowserActionSchema>;
export type BrowserStateEvent = z.infer<typeof BrowserStateEventSchema>;
export type PageUpdatedEvent = z.infer<typeof PageUpdatedEventSchema>;
export type DownloadProgressEvent = z.infer<typeof DownloadProgressEventSchema>;
export type EndpointChangedEvent = z.infer<typeof EndpointChangedEventSchema>;
export type IpcOutboundEvent = z.infer<typeof IpcOutboundEventSchema>;
