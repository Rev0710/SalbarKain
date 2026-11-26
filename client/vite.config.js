import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        name: 'SalbarKain — Local Surplus Food Rescue',
        short_name: 'SalbarKain',
        description: 'Discover and rescue local surplus food in communities across the Philippines.',
        theme_color: '#15803D',
        background_color: '#F8FAFC',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*\/image\/upload\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'salbarkain-food-photos', expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 } },
          },
          {
            urlPattern: /^https:\/\/(?:[a-z0-9-]+\.)?tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: { cacheName: 'salbarkain-map-tiles', expiration: { maxEntries: 120, maxAgeSeconds: 24 * 60 * 60 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/leaflet/')) return 'leaflet';
          if (id.includes('/node_modules/react-leaflet/')) return 'react-leaflet';
          if (id.includes('/node_modules/html5-qrcode/')) return 'qr-scanner';
          if (id.includes('/node_modules/qrcode.react/')) return 'qr-pass';
          if (id.includes('/node_modules/browser-image-compression/')) return 'image-compression';
          if (id.includes('/node_modules/animejs/')) return 'text-motion';
          if (id.includes('/node_modules/react-router') || id.includes('/node_modules/@remix-run/router/')) return 'router';
          if (id.includes('/node_modules/axios/')) return 'api-client';
          if (id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react/')) return 'react';
        },
      },
    },
  },
});
