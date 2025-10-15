// ../../electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
var __electron_vite_injected_dirname = "/Users/zero/Project/Magi";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__electron_vite_injected_dirname, "packages/main/src/main.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__electron_vite_injected_dirname, "packages/main/src/preload.ts")
      }
    }
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "packages/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "packages/renderer/src"),
        "@magi/ipc-schema": resolve(__electron_vite_injected_dirname, "packages/shared/ipc-schema/src"),
        "@magi/shared-state": resolve(__electron_vite_injected_dirname, "packages/shared/shared-state/src")
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__electron_vite_injected_dirname, "packages/renderer/index.html")
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
