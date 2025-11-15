import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      'process.env.NODE_ENV': JSON.stringify(
        process.env.TEST_ELECTRON_FORCE_DEV === '1' ? 'development' : process.env.NODE_ENV
      )
    },
    build: {
      outDir: 'dist/main',
      lib: {
        entry: resolve(__dirname, 'packages/main/src/main.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
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
      outDir: resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'packages/renderer/index.html')
      }
    }
  }
})
