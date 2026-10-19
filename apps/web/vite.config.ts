import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cadrans et sons : public/dials → assets/dials, public/sounds → assets/sounds/mp3 (liens symboliques)
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
