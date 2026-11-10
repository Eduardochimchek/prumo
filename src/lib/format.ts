// Dinheiro é SEMPRE inteiro em centavos dentro do sistema (nunca float).
// R$ 1.234,56 => 123456. Converta só na borda (formatação e entrada do usuário).

export type Centavos = number;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** R$ 1.234,56 (espaço normal no lugar do NBSP para não quebrar layout de busca/CSV). */
export function moeda(c: Centavos, opts: { sinal?: boolean } = {}): string {
  const s = brl.format(Math.abs(c) / 100).replace(/ /g, ' ');
  if (c < 0) return `−${s}`;
  if (opts.sinal && c > 0) return `+${s}`;
  return s;
}

/** Só o número: 1.234,56 */
export const valorSemSimbolo = (c: Centavos): string => num2.format(c / 100);

/** R$ 12,4 mil · R$ 1,2 mi · R$ 980, para eixos e rótulos curtos. */
export function moedaCompacta(c: Centavos): string {
  const v = Math.abs(c) / 100;
  const sinal = c < 0 ? '−' : '';
  if (v >= 1_000_000) return `${sinal}R$ ${num1.format(v / 1_000_000)} mi`;
  if (v >= 10_000) return `${sinal}R$ ${num0.format(v / 1000)} mil`;
  if (v >= 1000) return `${sinal}R$ ${num1.format(v / 1000)} mil`;
  return `${sinal}R$ ${num0.format(v)}`;
}

/** Eixo: 0 · 10 mil · 20 mil */
export function eixoCompacto(c: Centavos): string {
  const v = Math.abs(c) / 100;
  const sinal = c < 0 ? '−' : '';
  if (v === 0) return '0';
  if (v >= 1_000_000) return `${sinal}${num1.format(v / 1_000_000)} mi`;
  if (v >= 1000) return `${sinal}${num0.format(v / 1000)} mil`;
  return `${sinal}${num0.format(v)}`;
}

/** Aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234,56" e devolve centavos. */
export function parseMoeda(entrada: string | number): Centavos {
  if (typeof entrada === 'number') return Math.round(entrada * 100);
  let s = entrada.replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const negativo = s.startsWith('-');
  s = s.replace(/-/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  const v = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(v)) return 0;
  return negativo ? -v : v;
}

/** "12.34" (formato XML da NF-e) -> 1234 */
export const decimalParaCentavos = (s: string | null | undefined): Centavos =>
  s ? Math.round(parseFloat(s) * 100) || 0 : 0;

export const numero = (n: number, casas = 0): string =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);

export function percentual(parte: number, todo: number, casas = 0): string {
  if (!todo) return '0%';
  return `${numero((parte / todo) * 100, casas)}%`;
}

/** plural(3, 'conta', 'contas') => '3 contas' */
export function plural(n: number, um: string, varios: string, mostrarNumero = true): string {
  const palavra = n === 1 ? um : varios;
  return mostrarNumero ? `${numero(n)} ${palavra}` : palavra;
}

const EXTENSO_M = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const EXTENSO_F = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];

/** Para começar frase: extenso(2, 'f') => 'Duas'. Acima de dez, algarismos. */
export function extenso(n: number, genero: 'm' | 'f', maiuscula = true): string {
  const s = n >= 0 && n <= 10 ? (genero === 'f' ? EXTENSO_F : EXTENSO_M)[n] : numero(n);
  return maiuscula ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => !/^(da|de|do|das|dos|e)$/i.test(p));
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Remove acentos e baixa a caixa, para buscas tolerantes ("agua" acha "Água"). */
export const normalizarBusca = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function contem(alvo: string | undefined | null, termo: string): boolean {
  if (!alvo) return false;
  return normalizarBusca(alvo).includes(normalizarBusca(termo));
}

export const soma = (valores: number[]): number => valores.reduce((a, b) => a + b, 0);
