import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MBFD Tactical Scene Simulator',
        short_name: 'MBFD Tactical',
        description: 'Multi-user tactical fireground training for Miami Beach Fire Department.',
        theme_color: '#111a1f',
        background_color: '#111a1f',
        display: 'standalone',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/scenario-assets/'),
          handler: 'CacheFirst',
          options: { cacheName: 'scenario-assets-v2', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 } },
        }],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000' },
      '/scenario-assets': { target: 'http://127.0.0.1:3000' },
      '/collab': { target: 'ws://127.0.0.1:1234', ws: true, rewrite: () => '/' },
    },
  },
})
