/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relativa: o mesmo build funciona em localhost e no GitHub Pages (/prumo/).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
