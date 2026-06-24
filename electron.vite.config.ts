import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Two preloads: the main window bridge, and the one injected into the
        // previewed app's WebContentsView for element selection.
        input: {
          index: resolve('src/preload/index.ts'),
          preview: resolve('src/preview/preload.ts')
        }
      }
    }
  },
  renderer: {
    // Off 5173 on purpose: that's the Vite/SvelteKit default, so sharing it
    // collides with (and gets confused for) the previewed project's dev server.
    server: { port: 5180, strictPort: false },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
