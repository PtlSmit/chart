import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020'
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    port: 5173
  }
});
