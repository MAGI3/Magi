import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserAction, BrowserFleetState } from '@magi/ipc-schema';

type Listener<T> = (payload: T) => void;

const browserStateListeners = new Set<Listener<BrowserFleetState>>();

ipcRenderer.on('browser:state', (_event, state: BrowserFleetState) => {
  for (const listener of browserStateListeners) {
    listener(state);
  }
});

contextBridge.exposeInMainWorld('magiApi', {
  invokeBrowserAction(action: BrowserAction) {
    return ipcRenderer.invoke('browser:action', action);
  },
  invoke(command: string, payload?: unknown) {
    return ipcRenderer.invoke(command, payload);
  },
  onBrowserState(listener: Listener<BrowserFleetState>) {
    browserStateListeners.add(listener);
    return () => browserStateListeners.delete(listener);
  },
  on(channel: string, listener: (...args: unknown[]) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
