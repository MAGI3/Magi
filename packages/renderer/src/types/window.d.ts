import type { BrowserAction, BrowserFleetState } from '@magi/ipc-schema'

declare global {
  interface Window {
    magiApi: {
      invokeBrowserAction: (action: BrowserAction) => Promise<void>
      invoke: (command: string, payload?: unknown) => Promise<unknown>
      onBrowserState: (listener: (state: BrowserFleetState) => void) => () => void
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void
    }
  }
}

export {}
