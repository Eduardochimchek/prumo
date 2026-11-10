// PIX "copia e cola" no formato BR Code (EMV) do Banco Central, com CRC16 conferível.
// Na demonstração a chave é fictícia: um app de banco lê o código, mas não acha o recebedor.

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, '0')}${valor}`;

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), como pede o manual do BR Code. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase();

export function pixCopiaECola(p: { chave: string; nome: string; cidade: string; valor: number; txid: string }): string {
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', p.chave);
  const corpo =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', (p.valor / 100).toFixed(2)) +
    campo('58', 'BR') +
    campo('59', semAcento(p.nome).slice(0, 25)) +
    campo('60', semAcento(p.cidade).slice(0, 15)) +
    campo('62', campo('05', p.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***')) +
    '6304';
  return corpo + crc16(corpo);
}

export function pixValido(codigo: string): boolean {
  return codigo.length > 8 && crc16(codigo.slice(0, -4)) === codigo.slice(-4);
}
