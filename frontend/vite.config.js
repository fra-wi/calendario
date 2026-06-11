import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend su :5173, con proxy di /api verso il backend Express su :3001.
// Così dal browser le chiamate sono same-origin e le chiavi restano nel backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
