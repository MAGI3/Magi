import type { NativeImage } from 'electron';
import { logger } from '../utils/logger.js';
import type { BrowserFleetManager } from './BrowserFleetManager.js';

export interface ThumbnailSchedulerOptions {
  /**
   * Interval in milliseconds between thumbnail captures
   * @default 5000 (5 seconds)
   */
  intervalMs?: number;

  /**
   * Maximum width of the thumbnail
   * @default 320
   */
  thumbnailWidth?: number;

  /**
   * Maximum height of the thumbnail
   * @default 180
   */
  thumbnailHeight?: number;

  /**
   * JPEG quality (0-100)
   * @default 80
   */
  quality?: number;
}

/**
 * ThumbnailScheduler periodically captures page thumbnails
 * and updates the fleet state store with base64-encoded images.
 */
export class ThumbnailScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly thumbnailWidth: number;
  private readonly thumbnailHeight: number;
  private readonly quality: number;
  private isRunning = false;

  constructor(
    private readonly fleetManager: BrowserFleetManager,
    options: ThumbnailSchedulerOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 5000;
    this.thumbnailWidth = options.thumbnailWidth ?? 320;
    this.thumbnailHeight = options.thumbnailHeight ?? 180;
    this.quality = options.quality ?? 80;
  }

  /**
   * Start capturing thumbnails on a scheduled interval
   */
  start() {
    if (this.isRunning) {
      logger.warn('ThumbnailScheduler is already running');
      return;
    }

    logger.info('Starting ThumbnailScheduler', {
      intervalMs: this.intervalMs,
      thumbnailSize: `${this.thumbnailWidth}x${this.thumbnailHeight}`,
      quality: this.quality
    });

    this.isRunning = true;

    // Capture initial thumbnails immediately
    this.captureAllThumbnails().catch((error) => {
      logger.error('Initial thumbnail capture failed', error);
    });

    // Schedule periodic captures
    this.intervalId = setInterval(() => {
      this.captureAllThumbnails().catch((error) => {
        logger.error('Periodic thumbnail capture failed', error);
      });
    }, this.intervalMs);
  }

  /**
   * Stop capturing thumbnails
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping ThumbnailScheduler');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Capture thumbnails for all active pages across all browsers
   */
  private async captureAllThumbnails() {
    const state = this.fleetManager.getState();

    for (const browserState of state.browsers) {
      const browser = this.fleetManager.getBrowser(browserState.browserId);
      if (!browser) {
        continue;
      }

      for (const page of browser.pagesList) {
        try {
          await this.captureThumbnail(browserState.browserId, page.pageId, page.view);
        } catch (error) {
          logger.error('Failed to capture thumbnail', {
            browserId: browserState.browserId,
            pageId: page.pageId,
            error
          });
        }
      }
    }

    // Emit updated state after all thumbnails are captured
    this.fleetManager.emitState();
  }

  /**
   * Capture a single page thumbnail and update the store
   */
  private async captureThumbnail(
    browserId: string,
    pageId: string,
    view: Electron.WebContentsView
  ) {
    try {
      const webContents = view.webContents;

      // Skip if webContents is destroyed or not ready
      if (!webContents || webContents.isDestroyed()) {
        return;
      }

      // Capture the page as a NativeImage
      const image: NativeImage = await webContents.capturePage();

      // Resize to thumbnail dimensions while maintaining aspect ratio
      const size = image.getSize();
      const aspectRatio = size.width / size.height;
      let targetWidth = this.thumbnailWidth;
      let targetHeight = this.thumbnailHeight;

      if (aspectRatio > targetWidth / targetHeight) {
        // Width is the limiting factor
        targetHeight = Math.round(targetWidth / aspectRatio);
      } else {
        // Height is the limiting factor
        targetWidth = Math.round(targetHeight * aspectRatio);
      }

      const thumbnail = image.resize({
        width: targetWidth,
        height: targetHeight,
        quality: 'best'
      });

      // Convert to JPEG base64
      const jpegBuffer = thumbnail.toJPEG(this.quality);
      const base64 = jpegBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      // Update the store with the thumbnail
      const browser = this.fleetManager.getBrowser(browserId);
      if (browser) {
        browser.updatePageThumbnail(pageId, dataUrl);
      }
    } catch (error) {
      // Log errors but don't throw - we want to continue with other pages
      logger.error('Thumbnail capture error', {
        browserId,
        pageId,
        error
      });
    }
  }

  /**
   * Check if the scheduler is currently running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
