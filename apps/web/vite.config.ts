import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The same /sw.js path the V2 app registered, so installed clients pick
      // up this release automatically and drop the V2 caches.
      registerType: 'autoUpdate',
      manifest: {
        name: 'MBFD Tactical Scene Simulator',
        short_name: 'MBFD Tactical',
        description: 'Fireground tactical training board for Miami Beach Fire Department.',
        theme_color: '#0f1519',
        background_color: '#0f1519',
        display: 'standalone',
        icons: [
          { src: '/mbfd-seal-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/mbfd-seal-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/sync/, /^\/media\//],
        globIgnores: ['**/*cyrillic*', '**/*greek*', '**/*vietnamese*'],
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'mbfd-seal-96.webp', 'scenario-assets/seed/apparatus/*.webp', 'scenario-assets/seed/background.webp'],
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/scenario-assets/'),
          handler: 'CacheFirst',
          options: { cacheName: 'scenario-assets-v3', expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 60 }, rangeRequests: true },
        }],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/sync-api': 'http://127.0.0.1:8090',
      '/media': 'http://127.0.0.1:8090',
      '/sync': { target: 'ws://127.0.0.1:8090', ws: true },
    },
  },
})
