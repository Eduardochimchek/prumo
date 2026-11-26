// Cálculos dos relatórios por módulo (puros, sem efeitos). As telas ficam em src/pages/relatorios.
// Dinheiro sempre em centavos; meses como 'YYYY-MM'.

import { addMesesChave, diffDias, hoje, mesChave, type ISODate } from '../lib/dates';
import { normalizarDocumento } from '../lib/br';
import { emAberto, indices } from './selectors';
import type { Centavos, Database, ID, NotaFiscal, TipoLancamento } from './types';

/** Os últimos `n` meses (por padrão, só os fechados; com `comAtual`, termina no mês em andamento). */
export function ultimosMeses(n: number, comAtual: boolean, ref: ISODate = hoje()): string[] {
  const fim = comAtual ? 0 : -1;
  return Array.from({ length: n }, (_, i) => addMesesChave(mesChave(ref), fim - n + 1 + i));
}

const somaNotas = (ns: NotaFiscal[]) => ns.reduce((a, n) => a + n.totais.nota, 0);
const impostosDa = (n: NotaFiscal) => n.totais.icms + n.totais.ipi + n.totais.st + n.totais.pis + n.totais.cofins;

// ---------- Contas em aberto por prazo (a pagar / a receber) ----------

export type Faixa = 'semana' | 'mes' | 'depois' | 'v30' | 'v60' | 'v90' | 'v90mais';

export const ROTULO_FAIXA: Record<Faixa, string> = {
  semana: 'Vence em até 7 dias',
  mes: 'Vence de 8 a 30 dias',
  depois: 'Vence depois de 30 dias',
  v30: 'Atrasado até 30 dias',
  v60: 'Atrasado de 31 a 60 dias',
  v90: 'Atrasado de 61 a 90 dias',
  v90mais: 'Atrasado há mais de 90 dias',
};

export const FAIXAS: Faixa[] = ['v90mais', 'v90', 'v60', 'v30', 'semana', 'mes', 'depois'];
export const faixaVencida = (f: Faixa): boolean => f.startsWith('v');

/** Faixa de prazo de um vencimento em relação a `ref` (vence hoje conta como "até 7 dias"). */
export function faixaDe(vencimento: ISODate, ref: ISODate): Faixa {
  const dias = diffDias(vencimento, ref); // positivo = no futuro
  if (dias >= 0) return dias <= 7 ? 'semana' : dias <= 30 ? 'mes' : 'depois';
  const atraso = -dias;
  return atraso <= 30 ? 'v30' : atraso <= 60 ? 'v60' : atraso <= 90 ? 'v90' : 'v90mais';
}

export interface LinhaContato {
  contatoId?: ID;
  nome: string;
  qtd: number;
  total: Centavos;
  vencido: Centavos;
  /** vencimento mais antigo em aberto */
  maisAntigo: ISODate;
}

export interface RelatorioTitulos {
  total: Centavos;
  qtd: number;
  vencido: Centavos;
  qtdVencido: number;
  proximos7: Centavos;
  faixas: { faixa: Faixa; qtd: number; total: Centavos }[];
  porContato: LinhaContato[];
}

export function titulosEmAberto(db: Database, tipo: TipoLancamento, ref: ISODate = hoje()): RelatorioTitulos {
  const idx = indices(db);
  const abertos = db.lancamentos.filter((l) => l.tipo === tipo && emAberto(l));
  const faixas = new Map<Faixa, { qtd: number; total: number }>(FAIXAS.map((f) => [f, { qtd: 0, total: 0 }]));
  const contatos = new Map<string, LinhaContato>();
  let vencido = 0;
  let qtdVencido = 0;
  let proximos7 = 0;
  for (const l of abertos) {
    const f = faixaDe(l.vencimento, ref);
    const fx = faixas.get(f)!;
    fx.qtd++;
    fx.total += l.valor;
    if (faixaVencida(f)) {
      vencido += l.valor;
      qtdVencido++;
    }
    if (f === 'semana') proximos7 += l.valor;
    const chave = l.contatoId ?? '-';
    const c = contatos.get(chave) ?? {
      contatoId: l.contatoId,
      nome: l.contatoId ? (idx.contatos.get(l.contatoId)?.fantasia || idx.contatos.get(l.contatoId)?.nome || 'Contato removido') : 'Sem contato',
      qtd: 0,
      total: 0,
      vencido: 0,
      maisAntigo: l.vencimento,
    };
    c.qtd++;
    c.total += l.valor;
    if (faixaVencida(f)) c.vencido += l.valor;
    if (l.vencimento < c.maisAntigo) c.maisAntigo = l.vencimento;
    contatos.set(chave, c);
  }
  return {
    total: abertos.reduce((a, l) => a + l.valor, 0),
    qtd: abertos.length,
    vencido,
    qtdVencido,
    proximos7,
    faixas: FAIXAS.map((f) => ({ faixa: f, ...faixas.get(f)! })),
    // quem tem atraso primeiro, depois o maior valor
    porContato: [...contatos.values()].sort((a, b) => b.vencido - a.vencido || b.total - a.total),
  };
}

// ---------- Vendas (Comercial) ----------

export interface RelatorioVendas {
  meses: { mes: string; total: Centavos; notas: number }[];
  total: Centavos;
  notas: number;
  ticketMedio: Centavos;
  porCliente: { chave: string; nome: string; total: Centavos; notas: number }[];
  porProduto: { codigo: string; descricao: string; quantidade: number; unidade: string; total: Centavos }[];
  /** orçamentos criados no período e o que aconteceu com eles */
  orcamentos: { criados: number; aprovados: number; recusados: number; emAberto: number; valorAprovado: Centavos };
  porVendedor: { usuarioId: ID; nome: string; vendas: number; total: Centavos }[];
}

/** Vendido = notas de saída autorizadas (emitidas pelo Prumo ou importadas), pelo mês de emissão. */
export function relatorioVendas(db: Database, meses: string[]): RelatorioVendas {
  const idx = indices(db);
  const noPeriodo = new Set(meses);
  const saidas = db.notas.filter((n) => n.direcao === 'saida' && n.situacao === 'autorizada' && noPeriodo.has(n.emissao.slice(0, 7)));
  const total = somaNotas(saidas);

  const clientes = new Map<string, { chave: string; nome: string; total: number; notas: number }>();
  const produtos = new Map<string, { codigo: string; descricao: string; quantidade: number; unidade: string; total: number }>();
  for (const n of saidas) {
    const chave = n.contatoId || normalizarDocumento(n.destinatario.documento) || n.destinatario.nome;
    const nome = (n.contatoId && (idx.contatos.get(n.contatoId)?.fantasia || idx.contatos.get(n.contatoId)?.nome)) || n.destinatario.fantasia || n.destinatario.nome;
    const c = clientes.get(chave) ?? { chave, nome, total: 0, notas: 0 };
    c.total += n.totais.nota;
    c.notas++;
    clientes.set(chave, c);
    for (const it of n.itens) {
      const p = produtos.get(it.codigo) ?? { codigo: it.codigo, descricao: it.descricao, quantidade: 0, unidade: it.unidade ?? 'UN', total: 0 };
      p.quantidade += it.quantidade;
      p.total += it.valorTotal;
      produtos.set(it.codigo, p);
    }
  }

  const criados = db.vendas.filter((v) => noPeriodo.has(v.criadoEm.slice(0, 7)));
  const aprovadas = criados.filter((v) => v.etapa === 'pedido' || v.etapa === 'faturada');
  const somaVenda = (v: (typeof criados)[number]) => v.itens.reduce((a, i) => a + i.total, 0) - v.desconto + v.frete;

  const vendedores = new Map<ID, { usuarioId: ID; nome: string; vendas: number; total: number }>();
  for (const v of aprovadas) {
    const u = vendedores.get(v.criadoPor) ?? { usuarioId: v.criadoPor, nome: idx.usuarios.get(v.criadoPor)?.nome ?? 'Usuário removido', vendas: 0, total: 0 };
    u.vendas++;
    u.total += somaVenda(v);
    vendedores.set(v.criadoPor, u);
  }

  return {
    meses: meses.map((mes) => {
      const ns = saidas.filter((n) => n.emissao.slice(0, 7) === mes);
      return { mes, total: somaNotas(ns), notas: ns.length };
    }),
    total,
    notas: saidas.length,
    ticketMedio: saidas.length ? Math.round(total / saidas.length) : 0,
    porCliente: [...clientes.values()].sort((a, b) => b.total - a.total),
    porProduto: [...produtos.values()].sort((a, b) => b.total - a.total),
    orcamentos: {
      criados: criados.length,
      aprovados: aprovadas.length,
      recusados: criados.filter((v) => v.etapa === 'recusada').length,
      emAberto: criados.filter((v) => v.etapa === 'orcamento').length,
      valorAprovado: aprovadas.reduce((a, v) => a + somaVenda(v), 0),
    },
    porVendedor: [...vendedores.values()].sort((a, b) => b.total - a.total),
  };
}

// ---------- Notas fiscais (Faturamento) ----------

export interface MesNotas {
  mes: string;
  emitidas: number;
  valorEmitido: Centavos;
  impostos: Centavos;
  recebidas: number;
  valorRecebido: Centavos;
  canceladas: number;
}

export interface RelatorioNotas {
  meses: MesNotas[];
  emitidas: number;
  valorEmitido: Centavos;
  impostos: Centavos;
  recebidas: number;
  valorRecebido: Centavos;
  canceladas: number;
  fornecedores: { chave: string; nome: string; total: Centavos; notas: number }[];
}

export function relatorioNotas(db: Database, meses: string[]): RelatorioNotas {
  const noPeriodo = new Set(meses);
  const doPeriodo = db.notas.filter((n) => noPeriodo.has(n.emissao.slice(0, 7)));
  const ok = doPeriodo.filter((n) => n.situacao === 'autorizada');
  const linhas = meses.map((mes): MesNotas => {
    const doMes = ok.filter((n) => n.emissao.slice(0, 7) === mes);
    const saidas = doMes.filter((n) => n.direcao === 'saida');
    const entradas = doMes.filter((n) => n.direcao === 'entrada');
    return {
      mes,
      emitidas: saidas.length,
      valorEmitido: somaNotas(saidas),
      impostos: saidas.reduce((a, n) => a + impostosDa(n), 0),
      recebidas: entradas.length,
      valorRecebido: somaNotas(entradas),
      canceladas: doPeriodo.filter((n) => n.situacao === 'cancelada' && n.emissao.slice(0, 7) === mes).length,
    };
  });
  const fornecedores = new Map<string, { chave: string; nome: string; total: number; notas: number }>();
  for (const n of ok.filter((x) => x.direcao === 'entrada')) {
    const chave = normalizarDocumento(n.emitente.documento) || n.emitente.nome;
    const f = fornecedores.get(chave) ?? { chave, nome: n.emitente.fantasia || n.emitente.nome, total: 0, notas: 0 };
    f.total += n.totais.nota;
    f.notas++;
    fornecedores.set(chave, f);
  }
  const soma = (k: keyof Omit<MesNotas, 'mes'>) => linhas.reduce((a, l) => a + l[k], 0);
  return {
    meses: linhas,
    emitidas: soma('emitidas'),
    valorEmitido: soma('valorEmitido'),
    impostos: soma('impostos'),
    recebidas: soma('recebidas'),
    valorRecebido: soma('valorRecebido'),
    canceladas: soma('canceladas'),
    fornecedores: [...fornecedores.values()].sort((a, b) => b.total - a.total),
  };
}
