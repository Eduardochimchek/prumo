// Código de barras do boleto (Intercalado 2 de 5, padrão FEBRABAN) e QR code do PIX, em SVG.

import qrcode from 'qrcode-generator';

const PADROES = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];

/** Código de barras ITF a partir dos 44 dígitos. */
export function CodigoBarras({ codigo, altura = 52 }: { codigo: string; altura?: number }) {
  const digitos = codigo.replace(/\D/g, '');
  if (digitos.length % 2 !== 0) return null;
  const larguras: number[] = [1, 1, 1, 1]; // início: barra, espaço, barra, espaço estreitos
  for (let i = 0; i < digitos.length; i += 2) {
    const barras = PADROES[Number(digitos[i])];
    const espacos = PADROES[Number(digitos[i + 1])];
    for (let k = 0; k < 5; k++) larguras.push(barras[k] === 'w' ? 3 : 1, espacos[k] === 'w' ? 3 : 1);
  }
  larguras.push(3, 1, 1); // fim: barra larga, espaço, barra
  const total = larguras.reduce((a, b) => a + b, 0);
  let x = 0;
  const retangulos = larguras.map((w, i) => {
    const r = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={altura} /> : null;
    x += w;
    return r;
  });
  return (
    <svg className="codigo-barras" viewBox={`0 0 ${total} ${altura}`} preserveAspectRatio="none" role="img" aria-label="Código de barras do boleto">
      <g fill="currentColor">{retangulos}</g>
    </svg>
  );
}

export function QRCode({ texto, tam = 184 }: { texto: string; tam?: number }) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return (
    <svg className="qrcode" viewBox={`0 0 ${n + 8} ${n + 8}`} width={tam} height={tam} role="img" aria-label="QR code do PIX" shapeRendering="crispEdges">
      <rect width={n + 8} height={n + 8} fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  );
}
