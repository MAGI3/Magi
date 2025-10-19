import { useBrowserFleetStore } from '../store/browserFleetStore'
import { ipcClient } from '../ipc/client'
import type { ManagedBrowser, ManagedPage } from '@magi/shared-state'

export function usePageActions(browserId: string) {
  const browsers = useBrowserFleetStore((state) => state.browsers)

  const browser = browsers.find((b: ManagedBrowser) => b.browserId === browserId)

  const createPage = async (url?: string, afterPageId?: string) => {
    try {
      const result = await ipcClient.createPage(browserId, { url, afterPageId })
      return result.pageId
    } catch (error) {
      console.error('Failed to create page:', error)
      throw error
    }
  }

  const navigateToUrl = async (pageId: string, url: string) => {
    try {
      await ipcClient.navigatePage(browserId, pageId, url)
    } catch (error) {
      console.error('Failed to navigate:', error)
      throw error
    }
  }

  const selectPage = async (pageId: string) => {
    try {
      await ipcClient.selectPage(browserId, pageId)
    } catch (error) {
      console.error('Failed to select page:', error)
      throw error
    }
  }

  const closePage = async (pageId: string) => {
    try {
      await ipcClient.closePage(browserId, pageId)
    } catch (error) {
      console.error('Failed to close page:', error)
      throw error
    }
  }

  const reloadPage = async (pageId: string) => {
    try {
      await ipcClient.reloadPage(browserId, pageId)
    } catch (error) {
      console.error('Failed to reload page:', error)
      throw error
    }
  }

  const goBack = async (pageId: string) => {
    try {
      await ipcClient.goBack(browserId, pageId)
    } catch (error) {
      console.error('Failed to go back:', error)
      throw error
    }
  }

  const goForward = async (pageId: string) => {
    try {
      await ipcClient.goForward(browserId, pageId)
    } catch (error) {
      console.error('Failed to go forward:', error)
      throw error
    }
  }

  const getPage = (pageId: string) => {
    return browser?.pages.find((p: ManagedPage) => p.pageId === pageId)
  }

  const getActivePage = () => {
    return browser?.pages.find((p: ManagedPage) => p.pageId === browser.activePageId)
  }

  return {
    browser,
    pages: browser?.pages ?? [],
    createPage,
    navigateToUrl,
    selectPage,
    closePage,
    reloadPage,
    goBack,
    goForward,
    getPage,
    getActivePage,
  }
}
