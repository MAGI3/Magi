import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'packages/main/src/main.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'packages/main/src/preload.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'packages/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'packages/renderer/src'),
        '@magi/ipc-schema': resolve(__dirname, 'packages/shared/ipc-schema/src'),
        '@magi/shared-state': resolve(__dirname, 'packages/shared/shared-state/src')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'packages/renderer/index.html')
      }
    }
  }
})
