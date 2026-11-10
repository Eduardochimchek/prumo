// Leituras derivadas (sem efeitos colaterais). Tudo que é "calculado" mora aqui:
// status de título, saldos, agenda, fluxo de caixa, DRE gerencial, busca.

import { addDias, addMesesChave, fimMes, hoje, mesChave, type ISODate } from '../lib/dates';
import { contem, moeda, normalizarBusca } from '../lib/format';
import { formatarChave } from '../lib/nfe/chave';
import type {
  Categoria,
  ContaBancaria,
  Contato,
  Database,
  Lancamento,
  NotaFiscal,
  TipoLancamento,
  Usuario,
} from './types';

export type Status = 'pago' | 'vencido' | 'hoje' | 'aberto' | 'cancelado';

export function statusDe(l: Lancamento, ref: ISODate = hoje()): Status {
  if (l.cancelado) return 'cancelado';
  if (l.baixa) return 'pago';
  if (l.vencimento < ref) return 'vencido';
  if (l.vencimento === ref) return 'hoje';
  return 'aberto';
}

export const emAberto = (l: Lancamento): boolean => !l.cancelado && !l.baixa;

// ---------- Índices (memoizados por versão do banco) ----------

export interface Indices {
  contatos: Map<string, Contato>;
  categorias: Map<string, Categoria>;
  contas: Map<string, ContaBancaria>;
  usuarios: Map<string, Usuario>;
  notas: Map<string, NotaFiscal>;
  lancamentosPorNota: Map<string, Lancamento[]>;
}

const cacheIndices = new WeakMap<Database, Indices>();

export function indices(db: Database): Indices {
  let i = cacheIndices.get(db);
  if (!i) {
    const porNota = new Map<string, Lancamento[]>();
    for (const l of db.lancamentos) {
      if (!l.notaId) continue;
      const lista = porNota.get(l.notaId) ?? [];
      lista.push(l);
      porNota.set(l.notaId, lista);
    }
    i = {
      contatos: new Map(db.contatos.map((c) => [c.id, c])),
      categorias: new Map(db.categorias.map((c) => [c.id, c])),
      contas: new Map(db.contas.map((c) => [c.id, c])),
      usuarios: new Map(db.usuarios.map((u) => [u.id, u])),
      notas: new Map(db.notas.map((n) => [n.id, n])),
      lancamentosPorNota: porNota,
    };
    cacheIndices.set(db, i);
  }
  return i;
}

export function nomeContato(db: Database, id?: string): string {
  if (!id) return '';
  const c = indices(db).contatos.get(id);
  return c ? c.fantasia || c.nome : '';
}

// ---------- Saldos ----------

export function saldoConta(db: Database, conta: ContaBancaria, ate: ISODate = hoje()): number {
  let s = conta.saldoInicialEm <= ate ? conta.saldoInicial : 0;
  for (const l of db.lancamentos) {
    if (!l.baixa || l.cancelado || l.baixa.contaId !== conta.id || l.baixa.data > ate) continue;
    s += l.tipo === 'receber' ? l.baixa.valorPago : -l.baixa.valorPago;
  }
  return s;
}

export function saldoTotal(db: Database, ate: ISODate = hoje()): number {
  return db.contas.filter((c) => c.ativa).reduce((a, c) => a + saldoConta(db, c, ate), 0);
}

// ---------- Resumos ----------

export interface Total {
  total: number;
  qtd: number;
}

const vazio = (): Total => ({ total: 0, qtd: 0 });
const somar = (t: Total, v: number) => {
  t.total += v;
  t.qtd += 1;
};

export interface ResumoTipo {
  aberto: Total;
  vencido: Total;
  hoje: Total;
  semana: Total;
  mes: Total;
  quitadoMes: Total;
}

export function resumoTipo(db: Database, tipo: TipoLancamento, ref: ISODate = hoje()): ResumoTipo {
  const r: ResumoTipo = { aberto: vazio(), vencido: vazio(), hoje: vazio(), semana: vazio(), mes: vazio(), quitadoMes: vazio() };
  const fimSemana = addDias(ref, 6);
  const mes = mesChave(ref);
  for (const l of db.lancamentos) {
    if (l.tipo !== tipo || l.cancelado) continue;
    if (l.baixa) {
      if (mesChave(l.baixa.data) === mes) somar(r.quitadoMes, l.baixa.valorPago);
      continue;
    }
    somar(r.aberto, l.valor);
    if (l.vencimento < ref) somar(r.vencido, l.valor);
    if (l.vencimento === ref) somar(r.hoje, l.valor);
    if (l.vencimento >= ref && l.vencimento <= fimSemana) somar(r.semana, l.valor);
    if (mesChave(l.vencimento) === mes) somar(r.mes, l.valor);
  }
  return r;
}

// ---------- Agenda dos próximos dias ----------

export interface DiaAgenda {
  data: ISODate;
  receber: number;
  pagar: number;
  itens: Lancamento[];
}

export function agenda(db: Database, de: ISODate, dias: number): DiaAgenda[] {
  const mapa = new Map<ISODate, DiaAgenda>();
  for (let i = 0; i < dias; i++) {
    const data = addDias(de, i);
    mapa.set(data, { data, receber: 0, pagar: 0, itens: [] });
  }
  for (const l of db.lancamentos) {
    if (!emAberto(l)) continue;
    const dia = mapa.get(l.vencimento);
    if (!dia) continue;
    dia[l.tipo] += l.valor;
    dia.itens.push(l);
  }
  for (const d of mapa.values()) d.itens.sort((a, b) => b.valor - a.valor);
  return [...mapa.values()];
}

// ---------- Fluxo de caixa ----------

export interface MesFluxo {
  mes: string;
  entradas: number;
  saidas: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  saldoFinal: number;
  tempo: 'passado' | 'atual' | 'futuro';
}

export function fluxoMensal(db: Database, mesesAtras = 5, mesesFrente = 2, ref: ISODate = hoje()): MesFluxo[] {
  const atual = mesChave(ref);
  const lista: MesFluxo[] = [];
  for (let i = -mesesAtras; i <= mesesFrente; i++) {
    const mes = addMesesChave(atual, i);
    lista.push({
      mes,
      entradas: 0,
      saidas: 0,
      entradasPrevistas: 0,
      saidasPrevistas: 0,
      saldoFinal: 0,
      tempo: i < 0 ? 'passado' : i === 0 ? 'atual' : 'futuro',
    });
  }
  const porMes = new Map(lista.map((m) => [m.mes, m]));
  for (const l of db.lancamentos) {
    if (l.cancelado) continue;
    if (l.baixa) {
      const m = porMes.get(mesChave(l.baixa.data));
      if (m) {
        if (l.tipo === 'receber') m.entradas += l.baixa.valorPago;
        else m.saidas += l.baixa.valorPago;
      }
    } else {
      // vencidos em aberto são projetados no mês atual
      const m = porMes.get(l.vencimento < ref ? atual : mesChave(l.vencimento));
      if (m) {
        if (l.tipo === 'receber') m.entradasPrevistas += l.valor;
        else m.saidasPrevistas += l.valor;
      }
    }
  }
  let saldo = saldoTotal(db, ref);
  for (const m of lista) {
    if (m.tempo === 'passado') m.saldoFinal = saldoTotal(db, fimMes(`${m.mes}-01`));
    else {
      saldo += m.entradasPrevistas - m.saidasPrevistas;
      m.saldoFinal = saldo;
    }
  }
  return lista;
}

export interface DiaFluxo {
  data: ISODate;
  entradas: number;
  saidas: number;
  saldo: number;
}

/** Projeção dia a dia a partir do saldo de hoje. Vencidos em aberto entram no dia de hoje. */
export function projecaoDiaria(db: Database, dias = 60, ref: ISODate = hoje()) {
  const inicial = saldoTotal(db, ref);
  const pontos: DiaFluxo[] = [];
  const mov = new Map<ISODate, { e: number; s: number }>();
  for (const l of db.lancamentos) {
    if (!emAberto(l)) continue;
    const d = l.vencimento < ref ? ref : l.vencimento;
    const m = mov.get(d) ?? { e: 0, s: 0 };
    if (l.tipo === 'receber') m.e += l.valor;
    else m.s += l.valor;
    mov.set(d, m);
  }
  let saldo = inicial;
  for (let i = 0; i < dias; i++) {
    const data = addDias(ref, i);
    const m = mov.get(data) ?? { e: 0, s: 0 };
    saldo += m.e - m.s;
    pontos.push({ data, entradas: m.e, saidas: m.s, saldo });
  }
  const menor = pontos.reduce((a, b) => (b.saldo < a.saldo ? b : a), pontos[0]);
  return { inicial, pontos, menor };
}

// ---------- Categorias e DRE gerencial ----------

export type Regime = 'competencia' | 'caixa';

export interface LinhaCategoria {
  categoriaId: string;
  nome: string;
  total: number;
}

export function porCategoria(db: Database, tipo: TipoLancamento, mes: string, regime: Regime = 'competencia'): LinhaCategoria[] {
  const cats = indices(db).categorias;
  const mapa = new Map<string, number>();
  for (const l of db.lancamentos) {
    if (l.tipo !== tipo || l.cancelado) continue;
    let valor = 0;
    if (regime === 'competencia') {
      if (l.competencia !== mes) continue;
      valor = l.baixa?.valorPago ?? l.valor;
    } else {
      if (!l.baixa || mesChave(l.baixa.data) !== mes) continue;
      valor = l.baixa.valorPago;
    }
    const chave = l.categoriaId ?? 'sem';
    mapa.set(chave, (mapa.get(chave) ?? 0) + valor);
  }
  return [...mapa.entries()]
    .map(([categoriaId, total]) => ({ categoriaId, nome: cats.get(categoriaId)?.nome ?? 'Sem categoria', total }))
    .sort((a, b) => b.total - a.total);
}

export interface LinhaDre {
  categoriaId: string;
  nome: string;
  valores: number[];
  total: number;
}

export interface Dre {
  meses: string[];
  receitas: LinhaDre[];
  despesas: LinhaDre[];
  totalReceitas: number[];
  totalDespesas: number[];
  resultado: number[];
}

export function dre(db: Database, meses: string[], regime: Regime): Dre {
  const montar = (tipo: TipoLancamento) => {
    const linhas = new Map<string, LinhaDre>();
    meses.forEach((mes, i) => {
      for (const c of porCategoria(db, tipo, mes, regime)) {
        const linha = linhas.get(c.categoriaId) ?? { categoriaId: c.categoriaId, nome: c.nome, valores: meses.map(() => 0), total: 0 };
        linha.valores[i] += c.total;
        linha.total += c.total;
        linhas.set(c.categoriaId, linha);
      }
    });
    return [...linhas.values()].sort((a, b) => b.total - a.total);
  };
  const receitas = montar('receber');
  const despesas = montar('pagar');
  const totalReceitas = meses.map((_, i) => receitas.reduce((a, l) => a + l.valores[i], 0));
  const totalDespesas = meses.map((_, i) => despesas.reduce((a, l) => a + l.valores[i], 0));
  return { meses, receitas, despesas, totalReceitas, totalDespesas, resultado: meses.map((_, i) => totalReceitas[i] - totalDespesas[i]) };
}

// ---------- Painel "Hoje" ----------

export function briefing(db: Database, ref: ISODate = hoje()) {
  const pagar = resumoTipo(db, 'pagar', ref);
  const receber = resumoTipo(db, 'receber', ref);
  const projecao = projecaoDiaria(db, 45, ref);
  const fim = fimMes(ref);
  const saldoFimMes = projecao.pontos.find((p) => p.data === fim)?.saldo ?? projecao.pontos[projecao.pontos.length - 1].saldo;
  const idx = indices(db);
  const notasSemTitulo = db.notas.filter((n) => n.situacao === 'autorizada' && !idx.lancamentosPorNota.has(n.id));
  const sefazPendentes = db.sefaz.filter((s) => s.manifestacao === 'pendente');
  const vencidos = db.lancamentos
    .filter((l) => emAberto(l) && l.vencimento < ref)
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
  return { pagar, receber, saldo: projecao.inicial, projecao, saldoFimMes, notasSemTitulo, sefazPendentes, vencidos };
}

// ---------- Busca global (paleta de comandos) ----------

export interface ResultadoBusca {
  tipo: 'lancamento' | 'contato' | 'nota';
  id: string;
  titulo: string;
  detalhe: string;
  valor?: number;
  rota: string;
}

export function buscar(db: Database, termoBruto: string, limite = 8): ResultadoBusca[] {
  const termo = termoBruto.trim();
  if (termo.length < 2) return [];
  const t = normalizarBusca(termo);
  const soNumeros = termo.replace(/\D/g, '');
  const res: ResultadoBusca[] = [];
  const idx = indices(db);

  for (const c of db.contatos) {
    if (contem(c.nome, t) || contem(c.fantasia, t) || (soNumeros.length >= 4 && c.documento.includes(soNumeros))) {
      res.push({ tipo: 'contato', id: c.id, titulo: c.fantasia || c.nome, detalhe: c.tipo === 'cliente' ? 'Cliente' : c.tipo === 'fornecedor' ? 'Fornecedor' : 'Cliente e fornecedor', rota: `/contatos?id=${c.id}` });
    }
  }
  for (const n of db.notas) {
    const outro = n.direcao === 'entrada' ? n.emitente.nome : n.destinatario.nome;
    if (n.numero === soNumeros || (soNumeros.length >= 8 && n.chave.includes(soNumeros)) || contem(outro, t)) {
      res.push({ tipo: 'nota', id: n.id, titulo: `NF ${n.numero} · ${outro}`, detalhe: `${n.direcao === 'entrada' ? 'Entrada' : 'Saída'} · ${formatarChave(n.chave).slice(0, 14)}…`, valor: n.totais.nota, rota: `/notas/${n.id}` });
    }
  }
  const lancs = db.lancamentos
    .filter((l) => !l.cancelado)
    .filter((l) => contem(l.descricao, t) || contem(l.documento, t) || contem(idx.contatos.get(l.contatoId ?? '')?.nome, t) || (soNumeros.length >= 3 && moeda(l.valor).replace(/\D/g, '').startsWith(soNumeros)))
    .sort((a, b) => (emAberto(a) === emAberto(b) ? (a.vencimento < b.vencimento ? 1 : -1) : emAberto(a) ? -1 : 1));
  for (const l of lancs.slice(0, limite)) {
    res.push({ tipo: 'lancamento', id: l.id, titulo: l.descricao, detalhe: `${l.tipo === 'pagar' ? 'A pagar' : 'A receber'} · vence ${l.vencimento.split('-').reverse().join('/')}`, valor: l.valor, rota: `/contas/${l.tipo}?id=${l.id}` });
  }
  return res.slice(0, limite * 2);
}
