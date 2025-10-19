import type {
  BrowserAction,
  BrowserFleetState,
  PageUpdatedEvent,
  DownloadProgressEvent,
  EndpointChangedEvent,
} from '@magi/ipc-schema'

/**
 * IPC 客户端封装
 * 提供类型安全的主进程通信接口
 */
export class IpcClient {
  /**
   * 调用浏览器操作
   */
  async invoke(action: BrowserAction): Promise<any> {
    return await window.magiApi.invokeBrowserAction(action)
  }

  /**
   * 订阅浏览器舰队状态更新
   */
  onStateUpdate(callback: (state: BrowserFleetState) => void): () => void {
    // onBrowserState 返回清理函数，直接返回给调用方
    return window.magiApi.onBrowserState(callback)
  }

  /**
   * 订阅页面更新事件
   */
  onPageUpdated(callback: (event: PageUpdatedEvent) => void): () => void {
    // on 返回清理函数,直接返回给调用方
    return window.magiApi.on('page:updated', (...args: unknown[]) => {
      callback(args[0] as PageUpdatedEvent)
    })
  }

  /**
   * 订阅下载进度事件
   */
  onDownloadProgress(callback: (event: DownloadProgressEvent) => void): () => void {
    return window.magiApi.on('download:progress', (...args: unknown[]) => {
      callback(args[0] as DownloadProgressEvent)
    })
  }

  /**
   * 订阅浏览器端点变更事件
   */
  onBrowserEndpointChanged(callback: (event: EndpointChangedEvent) => void): () => void {
    return window.magiApi.on('browser:endpointChanged', (...args: unknown[]) => {
      callback(args[0] as EndpointChangedEvent)
    })
  }

  /**
   * 创建新浏览器
   */
  async createBrowser(options?: { name?: string; userAgent?: string }): Promise<{ browserId: string; pageId: string }> {
    const result = await this.invoke({
      type: 'browser:create',
      payload: {
        name: options?.name || `Browser ${Date.now()}`,
        headless: false,
        ...(options?.userAgent && { userAgent: options.userAgent }),
      },
    })
    return { browserId: result.browserId, pageId: result.pageId }
  }

  /**
   * 销毁浏览器
   */
  async destroyBrowser(browserId: string): Promise<void> {
    await this.invoke({
      type: 'browser:destroy',
      browserId,
    })
  }

  /**
   * 导航到指定 URL
   */
  async navigatePage(browserId: string, pageId: string, url: string): Promise<void> {
    await this.invoke({
      type: 'page:navigate',
      browserId,
      pageId,
      url,
    })
  }

  /**
   * 选择页面
   */
  async selectPage(browserId: string, pageId: string): Promise<void> {
    await this.invoke({
      type: 'page:select',
      browserId,
      pageId,
    })
  }

  /**
   * 关闭页面
   */
  async closePage(browserId: string, pageId: string): Promise<void> {
    await this.invoke({
      type: 'page:close',
      browserId,
      pageId
    })
  }

  async createPage(
    browserId: string,
    options?: { url?: string; activate?: boolean; afterPageId?: string }
  ): Promise<{ pageId: string }> {
    const result = await this.invoke({
      type: 'page:create',
      browserId,
      payload: {
        activate: options?.activate ?? true,
        ...(options?.url && { url: options.url }),
        ...(options?.afterPageId && { afterPageId: options.afterPageId }),
      }
    })
    return { pageId: result.pageId }
  }

  async reloadPage(
    browserId: string,
    pageId: string,
    bypassCache?: boolean
  ): Promise<void> {
    await this.invoke({
      type: 'page:reload',
      browserId,
      pageId,
      bypassCache: bypassCache ?? false
    })
  }

  async goBack(browserId: string, pageId: string): Promise<void> {
    await this.invoke({
      type: 'page:navigation',
      browserId,
      pageId,
      direction: 'back'
    })
  }

  async goForward(browserId: string, pageId: string): Promise<void> {
    await this.invoke({
      type: 'page:navigation',
      browserId,
      pageId,
      direction: 'forward'
    })
  }
}

// 导出单例实例
export const ipcClient = new IpcClient()
