// Gera os PNGs do PWA a partir dos SVGs em public/icons. Rodar: node scripts/icons.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { abrirNavegador } from './browser.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(raiz, 'public', 'icons');

const alvos = [
  { svg: 'prumo.svg', png: 'icon-192.png', tam: 192 },
  { svg: 'prumo.svg', png: 'icon-512.png', tam: 512 },
  { svg: 'prumo-maskable.svg', png: 'icon-maskable-512.png', tam: 512 },
  { svg: 'prumo-maskable.svg', png: 'apple-touch-icon.png', tam: 180 },
];

const navegador = await abrirNavegador();
for (const a of alvos) {
  const svg = await readFile(path.join(pasta, a.svg), 'utf8');
  const pagina = await navegador.newPage({ viewport: { width: a.tam, height: a.tam } });
  await pagina.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${a.tam}" height="${a.tam}" `)}</body></html>`,
  );
  await pagina.screenshot({ path: path.join(pasta, a.png), omitBackground: true });
  await pagina.close();
  console.log('gerado', a.png);
}
await navegador.close();
