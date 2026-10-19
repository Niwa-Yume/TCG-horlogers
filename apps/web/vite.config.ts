import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cadrans et sons : public/dials → assets/dials, public/sounds → assets/sounds/mp3 (liens symboliques)
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', ws: true }, // ws : Socket.IO du duel
      // pages de partage (balises Open Graph) servies par l'API, comme derrière Caddy
      '/partage': { target: 'http://localhost:3000', rewrite: (p) => `/api${p}` },
    },
  },
});
