import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';
import './styles/pages.css';
import { App } from './App';
import { aplicarTema, lerTema } from './lib/tema';

aplicarTema(lerTema());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: instala no celular e abre sem internet (só no build de produção).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* sem service worker: o app funciona normalmente, só não fica offline */
    });
  });
}
