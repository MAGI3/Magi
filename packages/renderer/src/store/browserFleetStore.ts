import { create } from 'zustand'
import type { BrowserFleetState, ManagedBrowser, ManagedPage } from '@magi/ipc-schema'
import { ipcClient } from '../ipc/client'

// 分离状态和方法，避免 Zustand 类型推断问题
interface BrowserFleetStoreState {
  browsers: BrowserFleetState['browsers']
  statistics: BrowserFleetState['statistics']
}

interface BrowserFleetStoreActions {
  // Actions
  createBrowser: (options?: { userAgent?: string }) => Promise<void>
  destroyBrowser: (browserId: string) => Promise<void>
  navigatePage: (browserId: string, pageId: string, url: string) => Promise<void>
  selectPage: (browserId: string, pageId: string) => Promise<void>
  closePage: (browserId: string, pageId: string) => Promise<void>

  // Selectors
  getBrowser: (browserId: string) => ManagedBrowser | undefined
  getPage: (browserId: string, pageId: string) => ManagedPage | undefined
  getActivePage: (browserId: string) => ManagedPage | undefined
}

type BrowserFleetStore = BrowserFleetStoreState & BrowserFleetStoreActions

export const useBrowserFleetStore = create<BrowserFleetStore>((set, get) => {
  // 订阅主进程状态更新
  const unsubscribe = ipcClient.onStateUpdate((state) => {
    set({
      browsers: state.browsers,
      statistics: state.statistics,
    })
  })

  // 在应用卸载时清理订阅（虽然在 Electron 应用中很少发生）
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', unsubscribe)
  }

  return {
    // 初始状态
    browsers: [],
    statistics: {
      totalBrowsers: 0,
      totalPages: 0,
      totalContexts: 0,
    },

    // Actions
    createBrowser: async (options) => {
      await ipcClient.createBrowser(options)
    },

    destroyBrowser: async (browserId) => {
      await ipcClient.destroyBrowser(browserId)
    },

    navigatePage: async (browserId, pageId, url) => {
      await ipcClient.navigatePage(browserId, pageId, url)
    },

    selectPage: async (browserId, pageId) => {
      await ipcClient.selectPage(browserId, pageId)
    },

    closePage: async (browserId, pageId) => {
      await ipcClient.closePage(browserId, pageId)
    },

    // Selectors
    getBrowser: (browserId) => {
      const state = get()
      return state.browsers.find((b: ManagedBrowser) => b.browserId === browserId)
    },

    getPage: (browserId, pageId) => {
      const state = get()
      const browser = state.browsers.find((b: ManagedBrowser) => b.browserId === browserId)
      return browser?.pages.find((p: ManagedPage) => p.pageId === pageId)
    },

    getActivePage: (browserId) => {
      const state = get()
      const browser = state.browsers.find((b: ManagedBrowser) => b.browserId === browserId)
      if (!browser) return undefined
      return browser.pages.find((p: ManagedPage) => p.pageId === browser.activePageId)
    },
  }
})

// 便捷选择器 hooks
export const useBrowsers = () => useBrowserFleetStore((state) => state.browsers)
export const useStatistics = () => useBrowserFleetStore((state) => state.statistics)
export const useBrowser = (browserId: string) =>
  useBrowserFleetStore((state) => state.getBrowser(browserId))
export const usePage = (browserId: string, pageId: string) =>
  useBrowserFleetStore((state) => state.getPage(browserId, pageId))
export const useActivePage = (browserId: string) =>
  useBrowserFleetStore((state) => state.getActivePage(browserId))
