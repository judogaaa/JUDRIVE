import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.JUDRIVE_BACKEND_PORT || process.env.JUDRIVE_BACKEND_PORT || '8090'
  return {
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          // Static servers may serve .mjs as octet-stream, which browsers reject for module workers.
          assetFileNames(asset) {
            return asset.names.includes('pdf.worker.min.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]'
          },
          manualChunks(id: string) {
            if (id.includes('pdfjs-dist')) return undefined
            if (id.includes('node_modules')) return 'vendor'
            if (id.includes('/i18n/locales/')) return 'locales'
            return undefined
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})