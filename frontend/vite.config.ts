import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

const isTauri = !!(
  process.env.TAURI_ENV_PLATFORM ||
  process.env.TAURI_ENV_ARCH ||
  process.env.TAURI_ENV_FAMILY
);

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
  plugins: [
    react(),
    basicSsl(),
    ...(isTauri
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            manifest: {
              name: 'AI 销售助手',
              short_name: '销售助手',
              description: '陪跑助手 + 仿真培训 — 智能销售辅助平台',
              theme_color: '#0d1117',
              background_color: '#0d1117',
              display: 'standalone',
              orientation: 'portrait-primary',
              start_url: '/',
              icons: [
                {
                  src: 'favicon.svg',
                  sizes: '48x46',
                  type: 'image/svg+xml',
                  purpose: 'any',
                },
                {
                  src: 'pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
                {
                  src: 'pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              runtimeCaching: [
                {
                  urlPattern: /^https:\/\/api\./i,
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'api-cache',
                    expiration: { maxEntries: 50, maxAgeSeconds: 300 },
                  },
                },
              ],
            },
          }),
        ]),
  ],
})
