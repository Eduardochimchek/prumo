// Leitura de planilhas para importar contas: aceita o que vem COLADO do Excel/Google Planilhas
// (separado por tabulação) ou um arquivo CSV (";" do Excel brasileiro, ou ","). Entende valores
// e datas no jeito brasileiro ("R$ 1.234,56", "05/12/2026") e sugere qual coluna é o quê.
// Dinheiro sai em centavos inteiros, sem passar por float.

import { addDias, type ISODate } from './dates';
import { normalizarBusca } from './format';

export const LIMITE_PLANILHA_BYTES = 5 * 1024 * 1024;
export const LIMITE_PLANILHA_LINHAS = 2000;

/** Divide o texto em linhas e células, respeitando aspas ("Silva; Souza" é uma célula só). */
export function lerTabela(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const primeira = limpo.split('\n').find((l) => l.trim()) ?? '';
  const sep = escolherSeparador(primeira);
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          celula += '"';
          i++;
        } else aspas = false;
      } else celula += c;
    } else if (c === '"' && celula.trim() === '') {
      aspas = true;
      celula = '';
    } else if (c === sep) {
      linha.push(celula.trim());
      celula = '';
    } else if (c === '\n') {
      linha.push(celula.trim());
      linhas.push(linha);
      linha = [];
      celula = '';
    } else celula += c;
  }
  if (celula !== '' || linha.length) {
    linha.push(celula.trim());
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c !== ''));
}

function escolherSeparador(linha: string): string {
  const fora = linha.replace(/"[^"]*"/g, '');
  const conta = (ch: string) => fora.split(ch).length - 1;
  if (conta('\t') > 0) return '\t';
  return conta(';') >= conta(',') && conta(';') > 0 ? ';' : ',';
}

/**
 * "R$ 1.234,56" → 123456; "1234.56" → 123456; "-80,00" e "(80,00)" → -8000; "1.500" → 150000.
 * Devolve null quando não é um valor.
 */
export function lerValor(entrada: string): number | null {
  let s = (entrada ?? '').replace(/[\s\u00a0]/g, '').replace(/R\$/gi, '');
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negativo = !negativo;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negativo = !negativo;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const ultimoPonto = s.lastIndexOf('.');
  const ultimaVirgula = s.lastIndexOf(',');
  let inteiro: string;
  let fracao = '';
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // os dois aparecem: o que vier por último é o separador decimal
    const dec = Math.max(ultimaVirgula, ultimoPonto);
    inteiro = s.slice(0, dec).replace(/[.,]/g, '');
    fracao = s.slice(dec + 1);
  } else if (ultimaVirgula >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) {
      inteiro = s.replace(/,/g, ''); // 1,234,567 (milhar com vírgula)
    } else {
      inteiro = s.slice(0, ultimaVirgula);
      fracao = s.slice(ultimaVirgula + 1);
    }
  } else if (ultimoPonto >= 0) {
    // "1.500" e "12.345.678" são milhar; "1500.5" e "12.34" são decimal
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) inteiro = s.replace(/\./g, '');
    else if ((s.match(/\./g) ?? []).length === 1) {
      inteiro = s.slice(0, ultimoPonto);
      fracao = s.slice(ultimoPonto + 1);
    } else return null;
  } else inteiro = s;
  if (!/^\d*$/.test(inteiro) || !/^\d*$/.test(fracao)) return null;
  // arredonda a partir da 3ª casa decimal (0,005 → 0,01)
  const duas = (fracao + '00').slice(0, 2);
  let centavos = Number(inteiro || '0') * 100 + Number(duas);
  if (fracao.length > 2 && Number(fracao[2]) >= 5) centavos += 1;
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo ? -centavos : centavos;
}

const pad = (n: number) => String(n).padStart(2, '0');

function dataValida(a: number, m: number, d: number): ISODate | null {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1) return null;
  const dias = new Date(a, m, 0).getDate();
  if (d > dias) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}

/** "05/12/2026", "5/12/26", "2026-12-05", "05-12-2026", "05.12.2026" ou número de série do Excel. */
export function lerData(entrada: string): ISODate | null {
  const s = (entrada ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return dataValida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return dataValida(ano, Number(m[2]), Number(m[1]));
  }
  // Excel guarda datas como dias desde 30/12/1899 (45992 = 01/12/2025)
  if (/^\d{5}$/.test(s)) {
    const n = Number(s);
    if (n >= 20000 && n <= 80000) return addDias('1899-12-30', n);
  }
  return null;
}

export type CampoPlanilha = 'descricao' | 'valor' | 'vencimento' | 'tipo' | 'contato' | 'categoria' | 'documento' | 'pagoEm' | 'observacoes';

export const CAMPOS_PLANILHA: { campo: CampoPlanilha; rotulo: string; obrigatorio?: boolean }[] = [
  { campo: 'descricao', rotulo: 'Descrição', obrigatorio: true },
  { campo: 'valor', rotulo: 'Valor', obrigatorio: true },
  { campo: 'vencimento', rotulo: 'Vencimento', obrigatorio: true },
  { campo: 'contato', rotulo: 'Fornecedor ou cliente' },
  { campo: 'categoria', rotulo: 'Categoria' },
  { campo: 'tipo', rotulo: 'Tipo (a pagar ou a receber)' },
  { campo: 'pagoEm', rotulo: 'Pago em' },
  { campo: 'documento', rotulo: 'Documento' },
  { campo: 'observacoes', rotulo: 'Observações' },
];

/** índice da coluna de cada campo (-1 = não usar) */
export type Mapeamento = Record<CampoPlanilha, number>;

const SINONIMOS: Record<CampoPlanilha, string[]> = {
  descricao: ['descricao', 'historico', 'discriminacao', 'referente', 'item', 'conta', 'despesa', 'lancamento'],
  valor: ['valor', 'valor total', 'valor r$', 'total', 'montante', 'quantia', 'preco'],
  vencimento: ['vencimento', 'data de vencimento', 'data vencimento', 'venc', 'vence', 'vencto', 'data'],
  tipo: ['tipo', 'natureza', 'entrada/saida', 'e/s', 'operacao', 'pagar/receber'],
  contato: ['fornecedor', 'cliente', 'favorecido', 'contato', 'pagador', 'beneficiario', 'empresa', 'nome', 'fornecedor/cliente'],
  categoria: ['categoria', 'plano de contas', 'classificacao', 'grupo', 'centro de custo'],
  documento: ['documento', 'doc', 'nf', 'nota', 'nota fiscal', 'numero', 'n', 'no', 'num'],
  pagoEm: ['pago em', 'data de pagamento', 'data pagamento', 'data pgto', 'pagamento', 'pago', 'pago?', 'quitado', 'quitado em', 'baixa', 'data da baixa', 'situacao', 'status'],
  observacoes: ['observacoes', 'observacao', 'obs', 'anotacoes', 'comentario'],
};

const limparTitulo = (s: string) => normalizarBusca(s).replace(/[º°.:]/g, '').replace(/\s+/g, ' ').trim();

/** Olha a linha de títulos e sugere qual coluna é cada campo. */
export function sugerirMapeamento(cabecalho: string[]): Mapeamento {
  const titulos = cabecalho.map(limparTitulo);
  const usado = new Set<number>();
  const m = Object.fromEntries(CAMPOS_PLANILHA.map((c) => [c.campo, -1])) as Mapeamento;
  // primeiro os nomes exatos, depois os que começam com o sinônimo (ex.: "Valor (R$)")
  for (const exato of [true, false]) {
    for (const { campo } of CAMPOS_PLANILHA) {
      if (m[campo] >= 0) continue;
      for (const sin of SINONIMOS[campo]) {
        const i = titulos.findIndex((t, idx) => !usado.has(idx) && (exato ? t === sin : t.startsWith(sin + ' ') || t.startsWith(sin + '(')));
        if (i >= 0) {
          m[campo] = i;
          usado.add(i);
          break;
        }
      }
    }
  }
  return m;
}

/** A primeira linha parece título (não tem nenhum valor nem data)? */
export function pareceCabecalho(linha: string[]): boolean {
  return linha.every((c) => !c || (lerValor(c) === null && lerData(c) === null));
}

export function lerTipo(entrada: string): 'pagar' | 'receber' | null {
  const s = normalizarBusca(entrada).replace(/\s+/g, ' ');
  if (!s) return null;
  if (['pagar', 'a pagar', 'despesa', 'saida', 's', 'd', 'debito', 'conta a pagar', 'pagamento'].includes(s)) return 'pagar';
  if (['receber', 'a receber', 'receita', 'entrada', 'e', 'c', 'credito', 'conta a receber', 'recebimento'].includes(s)) return 'receber';
  return null;
}

/** "sim", "pago", "x", "ok" na coluna de pagamento = pago no próprio vencimento. */
const MARCAS_PAGO = ['sim', 's', 'pago', 'paga', 'x', 'ok', 'quitado', 'quitada', 'recebido', 'recebida', 'baixado', 'baixada'];
const MARCAS_ABERTO = ['nao', 'n', 'aberto', 'em aberto', 'pendente', 'a pagar', 'a receber', 'vencido', 'vencida', 'atrasado', 'atrasada', '-'];

export type ModoTipo = 'pagar' | 'receber' | 'coluna' | 'sinal';

export interface LinhaPlanilha {
  /** número da linha na planilha (1 = primeira) */
  n: number;
  descricao: string;
  valor: number;
  vencimento: ISODate | null;
  tipo: 'pagar' | 'receber' | null;
  contato: string;
  categoria: string;
  documento: string;
  pagoEm: ISODate | null;
  observacoes: string;
  erros: string[];
}

export function montarLinhas(tabela: string[][], m: Mapeamento, opts: { temCabecalho: boolean; modoTipo: ModoTipo; hoje: ISODate }): LinhaPlanilha[] {
  const inicio = opts.temCabecalho ? 1 : 0;
  const cel = (l: string[], campo: CampoPlanilha) => (m[campo] >= 0 ? (l[m[campo]] ?? '').trim() : '');
  return tabela.slice(inicio).map((l, i) => {
    const erros: string[] = [];
    const bruto = cel(l, 'valor');
    const lido = lerValor(bruto);
    const contato = cel(l, 'contato');
    let descricao = cel(l, 'descricao') || contato;
    const vencimento = lerData(cel(l, 'vencimento'));
    let tipo: LinhaPlanilha['tipo'] = null;
    if (opts.modoTipo === 'pagar' || opts.modoTipo === 'receber') tipo = opts.modoTipo;
    else if (opts.modoTipo === 'coluna') tipo = lerTipo(cel(l, 'tipo'));
    else if (lido !== null && lido !== 0) tipo = lido < 0 ? 'pagar' : 'receber';

    const pagoBruto = cel(l, 'pagoEm');
    const pagoNorm = normalizarBusca(pagoBruto);
    let pagoEm: ISODate | null = null;
    if (pagoBruto) {
      const d = lerData(pagoBruto);
      if (d) pagoEm = d;
      else if (MARCAS_PAGO.includes(pagoNorm)) pagoEm = vencimento && vencimento <= opts.hoje ? vencimento : opts.hoje;
      else if (!MARCAS_ABERTO.includes(pagoNorm)) erros.push(`não entendi “${pagoBruto}” na coluna de pagamento`);
    }

    if (!descricao) erros.push('sem descrição');
    if (lido === null) erros.push(bruto ? `valor “${bruto}” não é um número` : 'sem valor');
    else if (lido === 0) erros.push('valor zero');
    if (!vencimento) erros.push(cel(l, 'vencimento') ? `data “${cel(l, 'vencimento')}” inválida` : 'sem vencimento');
    if (!tipo) erros.push(opts.modoTipo === 'coluna' ? `tipo “${cel(l, 'tipo')}” não é “pagar” nem “receber”` : 'não deu para saber se é a pagar ou a receber');
    if (pagoEm && pagoEm > opts.hoje) erros.push('data de pagamento no futuro');
    descricao = descricao.slice(0, 200);
    return {
      n: i + inicio + 1,
      descricao,
      valor: lido === null ? 0 : Math.abs(lido),
      vencimento,
      tipo,
      contato: contato.slice(0, 150),
      categoria: cel(l, 'categoria'),
      documento: cel(l, 'documento').slice(0, 80),
      pagoEm,
      observacoes: cel(l, 'observacoes').slice(0, 500),
      erros,
    };
  });
}

/**
 * Texto de um arquivo CSV. O Excel brasileiro costuma salvar CSV em Windows-1252 (não UTF-8):
 * tenta UTF-8 e, se os bytes não forem UTF-8 válido, lê como Windows-1252 (acentos certos).
 */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Arquivo .xlsx/.xls (binário do Excel) não dá para ler sem biblioteca: orientamos a copiar e colar. */
export function pareceExcelBinario(bytes: Uint8Array): boolean {
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK": .xlsx é um zip
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0; // .xls antigo
  return zip || ole;
}
