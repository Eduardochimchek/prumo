// Regras de venda (orçamento → pedido → nota) e de cobrança. Funções puras, testáveis.

import { addDias } from '../lib/dates';
import type { CondicaoPagamento, Venda } from './types';

export function totaisDaVenda(v: Pick<Venda, 'itens' | 'desconto' | 'frete'>) {
  const subtotal = v.itens.reduce((a, i) => a + i.total, 0);
  return { subtotal, total: Math.max(0, subtotal - v.desconto + v.frete) };
}

/** Divide o total nas parcelas sem perder centavo (a diferença vai na última). */
export function vencimentosDaCondicao(c: CondicaoPagamento, emissao: string, total: number) {
  const n = Math.max(1, Math.min(12, Math.round(c.parcelas)));
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    vencimento: addDias(emissao, c.primeiroEm + i * c.intervalo),
    valor: i === n - 1 ? total - base * (n - 1) : base,
  }));
}

export function descreverCondicao(c: CondicaoPagamento): string {
  if (c.parcelas <= 1 && c.primeiroEm === 0) return c.forma === 'pix' ? 'PIX à vista' : 'Boleto à vista';
  const dias = Array.from({ length: c.parcelas }, (_, i) => c.primeiroEm + i * c.intervalo).join('/');
  return `${c.forma === 'pix' ? 'PIX' : 'Boleto'} ${c.parcelas}x (${dias} dias)`;
}

export const CONDICOES: { rotulo: string; condicao: CondicaoPagamento }[] = [
  { rotulo: 'PIX à vista', condicao: { forma: 'pix', parcelas: 1, primeiroEm: 0, intervalo: 30 } },
  { rotulo: 'Boleto 30 dias', condicao: { forma: 'boleto', parcelas: 1, primeiroEm: 30, intervalo: 30 } },
  { rotulo: 'Boleto 2x (30/60)', condicao: { forma: 'boleto', parcelas: 2, primeiroEm: 30, intervalo: 30 } },
  { rotulo: 'Boleto 3x (30/60/90)', condicao: { forma: 'boleto', parcelas: 3, primeiroEm: 30, intervalo: 30 } },
  { rotulo: 'Boleto 2x (28/56)', condicao: { forma: 'boleto', parcelas: 2, primeiroEm: 28, intervalo: 28 } },
];

export const NOME_ETAPA: Record<Venda['etapa'], string> = {
  orcamento: 'Orçamento',
  pedido: 'Pedido',
  faturada: 'Faturada',
  recusada: 'Recusada',
};
