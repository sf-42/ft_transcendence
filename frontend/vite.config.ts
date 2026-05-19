import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    hmr: {
      // HMR à travers le proxy HTTPS Nginx
      // Le client utilisera automatiquement l'hôte de la page (localhost ou IP externe)
      protocol: 'wss',
      clientPort: 8443
    }
  },
  appType: 'spa',  // Enable SPA fallback - all routes serve index.html
  optimizeDeps: {
    include: [
      '@babylonjs/core',
      '@babylonjs/inspector',
      '@babylonjs/addons',
      '@babylonjs/materials'
    ]
  }
});