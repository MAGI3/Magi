import { useBrowserFleetStore } from '../store/browserFleetStore'
import { ipcClient } from '../ipc/client'
import type { ManagedBrowser } from '@magi/shared-state'

/**
 * 自定义 hook，封装浏览器相关操作
 */
export function useBrowserActions() {
  const browsers = useBrowserFleetStore((state) => state.browsers)

  /**
   * 创建新浏览器
   */
  const createBrowser = async () => {
    try {
      await ipcClient.createBrowser({})
    } catch (error) {
      console.error('Failed to create browser:', error)
      throw error
    }
  }

  /**
   * 销毁浏览器
   */
  const destroyBrowser = async (browserId: string) => {
    try {
      await ipcClient.destroyBrowser(browserId)
    } catch (error) {
      console.error('Failed to destroy browser:', error)
      throw error
    }
  }

  /**
   * 获取指定浏览器
   */
  const getBrowser = (browserId: string) => {
    return browsers.find((b: ManagedBrowser) => b.browserId === browserId)
  }

  /**
   * 获取浏览器统计信息
   */
  const getBrowserStats = () => {
    return {
      totalBrowsers: browsers.length,
      totalPages: browsers.reduce((sum: number, b: ManagedBrowser) => sum + b.pages.length, 0),
      activeBrowsers: browsers.filter((b: ManagedBrowser) => b.pages.length > 0).length,
    }
  }

  return {
    browsers,
    createBrowser,
    destroyBrowser,
    getBrowser,
    getBrowserStats,
  }
}
