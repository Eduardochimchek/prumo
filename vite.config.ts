/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Política de segurança de conteúdo (CSP): só roda script do próprio site, só conversa com a
// BrasilAPI, sem objetos/plugins e sem envio de formulário para fora. Entra só no build
// (o servidor de desenvolvimento precisa de scripts inline para o recarregamento rápido).
// Obs.: GitHub Pages não permite cabeçalhos HTTP próprios; por isso vai como <meta>.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://brasilapi.com.br",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function politicaDeSeguranca(): Plugin {
  return {
    name: 'prumo-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// base relativa: o mesmo build funciona em localhost e no GitHub Pages (/prumo/).
export default defineConfig({
  base: './',
  plugins: [react(), politicaDeSeguranca()],
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
