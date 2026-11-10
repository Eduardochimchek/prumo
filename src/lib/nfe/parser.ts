// Leitura do XML da NF-e (layout 4.00, também aceita 3.10). Funciona com o XML "puro" (<NFe>)
// ou com o XML de distribuição (<nfeProc>, que inclui o protocolo de autorização da SEFAZ).
// Roda no navegador (DOMParser). Nos testes usamos happy-dom.

import { decimalParaCentavos } from '../format';
import { normalizarDocumento } from '../br';
import { analisarChave, normalizarChave } from './chave';

export type SituacaoNFe = 'autorizada' | 'cancelada' | 'denegada' | 'sem_protocolo';

export interface NFeItem {
  codigo: string;
  descricao: string;
  ncm?: string;
  cfop?: string;
  unidade?: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface NFeDados {
  chave: string;
  modelo: string;
  serie: string;
  numero: string;
  naturezaOperacao: string;
  /** perspectiva do EMITENTE: 0 = entrada, 1 = saída */
  tipoOperacao: 'entrada' | 'saida';
  emissao: string;
  emitente: { documento: string; nome: string; fantasia?: string; ie?: string; municipio?: string; uf?: string };
  destinatario: { documento: string; nome: string; municipio?: string; uf?: string };
  itens: NFeItem[];
  totais: {
    produtos: number;
    frete: number;
    seguro: number;
    desconto: number;
    outros: number;
    ipi: number;
    icms: number;
    st: number;
    pis: number;
    cofins: number;
    nota: number;
  };
  duplicatas: { numero: string; vencimento: string; valor: number }[];
  pagamentos: { forma: string; descricao: string; valor: number }[];
  protocolo?: { numero: string; data: string; status: string; motivo: string };
  situacao: SituacaoNFe;
  informacoesComplementares?: string;
}

export const FORMAS_PAGAMENTO_NFE: Record<string, string> = {
  '01': 'Dinheiro',
  '02': 'Cheque',
  '03': 'Cartão de crédito',
  '04': 'Cartão de débito',
  '05': 'Crédito loja',
  '10': 'Vale alimentação',
  '11': 'Vale refeição',
  '12': 'Vale presente',
  '13': 'Vale combustível',
  '15': 'Boleto bancário',
  '16': 'Depósito bancário',
  '17': 'PIX',
  '18': 'Transferência',
  '19': 'Programa de fidelidade',
  '90': 'Sem pagamento',
  '99': 'Outros',
};

export class ErroLeituraNFe extends Error {}

// Percorre a árvore comparando o nome local (ignora namespace e prefixo, ex.: "nfe:emit").
// Mais robusto que getElementsByTagNameNS('*', …), que nem todo ambiente implementa igual.
const nomeLocal = (el: Element) => (el.localName || el.tagName).replace(/^.*:/, '');
function todos(raiz: Element | Document, nome: string): Element[] {
  const saida: Element[] = [];
  const visitar = (el: Element) => {
    for (const filho of Array.from(el.children)) {
      if (nomeLocal(filho) === nome) saida.push(filho);
      visitar(filho);
    }
  };
  if ('documentElement' in raiz) {
    const raizDoc = raiz.documentElement;
    if (!raizDoc) return saida;
    if (nomeLocal(raizDoc) === nome) saida.push(raizDoc);
    visitar(raizDoc);
  } else visitar(raiz);
  return saida;
}
const primeiro = (raiz: Element | Document | undefined, nome: string): Element | undefined =>
  raiz ? todos(raiz, nome)[0] : undefined;
const texto = (raiz: Element | undefined, nome: string): string => primeiro(raiz, nome)?.textContent?.trim() ?? '';
/** filho direto (evita pegar o CNPJ do <autXML>, por exemplo) */
const filhoDireto = (raiz: Element | undefined, nome: string): string => {
  if (!raiz) return '';
  for (const el of Array.from(raiz.children)) if (el.localName === nome) return el.textContent?.trim() ?? '';
  return '';
};

function situacaoPorStatus(cStat: string | undefined): SituacaoNFe {
  if (!cStat) return 'sem_protocolo';
  if (cStat === '100' || cStat === '150') return 'autorizada';
  if (['101', '151', '135', '155'].includes(cStat)) return 'cancelada';
  if (['110', '205', '301', '302', '303'].includes(cStat)) return 'denegada';
  return 'sem_protocolo';
}

export function lerXmlNFe(xml: string, parser: DOMParser = new DOMParser()): NFeDados {
  const doc = parser.parseFromString(xml.replace(/^﻿/, '').trim(), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement) {
    throw new ErroLeituraNFe('Este arquivo não é um XML válido. Confira se é o XML da nota (e não o PDF do DANFE).');
  }

  const inf = primeiro(doc, 'infNFe');
  if (!inf) {
    const raiz = doc.documentElement.localName;
    if (/evento/i.test(raiz) || primeiro(doc, 'infEvento')) {
      throw new ErroLeituraNFe('Este XML é de um evento (cancelamento, carta de correção ou manifestação), não de uma nota.');
    }
    if (/cte/i.test(raiz) || primeiro(doc, 'infCte')) {
      throw new ErroLeituraNFe('Este XML é de um CT-e (conhecimento de transporte). Por enquanto o Prumo importa NF-e e NFC-e.');
    }
    if (/nfse|compnfse/i.test(raiz) || primeiro(doc, 'InfNfse')) {
      throw new ErroLeituraNFe('Este XML parece ser de uma NFS-e (nota de serviço). A importação de NFS-e está no roadmap.');
    }
    throw new ErroLeituraNFe('Não encontrei os dados de uma NF-e neste arquivo.');
  }

  const ide = primeiro(inf, 'ide');
  const emit = primeiro(inf, 'emit');
  const dest = primeiro(inf, 'dest');
  const tot = primeiro(inf, 'ICMSTot');
  const prot = primeiro(doc, 'infProt');

  const idAttr = inf.getAttribute('Id') ?? '';
  const chave = normalizarChave(texto(prot, 'chNFe') || idAttr.replace(/^NFe/i, ''));
  if (!analisarChave(chave).completa) {
    throw new ErroLeituraNFe('A chave de acesso da nota está ausente ou incompleta no XML.');
  }

  const itens: NFeItem[] = todos(inf, 'det').map((det) => {
    const prod = primeiro(det, 'prod');
    return {
      codigo: texto(prod, 'cProd'),
      descricao: texto(prod, 'xProd'),
      ncm: texto(prod, 'NCM') || undefined,
      cfop: texto(prod, 'CFOP') || undefined,
      unidade: texto(prod, 'uCom') || undefined,
      quantidade: parseFloat(texto(prod, 'qCom')) || 0,
      valorUnitario: decimalParaCentavos(texto(prod, 'vUnCom')),
      valorTotal: decimalParaCentavos(texto(prod, 'vProd')),
    };
  });

  const v = (nome: string) => decimalParaCentavos(texto(tot, nome));
  const totais = {
    produtos: v('vProd'),
    frete: v('vFrete'),
    seguro: v('vSeg'),
    desconto: v('vDesc'),
    outros: v('vOutro'),
    ipi: v('vIPI'),
    icms: v('vICMS'),
    st: v('vST'),
    pis: v('vPIS'),
    cofins: v('vCOFINS'),
    nota: v('vNF'),
  };

  const duplicatas = todos(inf, 'dup').map((d) => ({
    numero: texto(d, 'nDup'),
    vencimento: texto(d, 'dVenc').slice(0, 10),
    valor: decimalParaCentavos(texto(d, 'vDup')),
  }));

  const pagamentos = todos(inf, 'detPag').map((p) => {
    const forma = texto(p, 'tPag');
    return { forma, descricao: FORMAS_PAGAMENTO_NFE[forma] ?? 'Outros', valor: decimalParaCentavos(texto(p, 'vPag')) };
  });

  const docEmit = filhoDireto(emit, 'CNPJ') || filhoDireto(emit, 'CPF');
  const docDest = filhoDireto(dest, 'CNPJ') || filhoDireto(dest, 'CPF') || filhoDireto(dest, 'idEstrangeiro');

  return {
    chave,
    modelo: texto(ide, 'mod') || chave.slice(20, 22),
    serie: texto(ide, 'serie'),
    numero: texto(ide, 'nNF'),
    naturezaOperacao: texto(ide, 'natOp'),
    tipoOperacao: texto(ide, 'tpNF') === '0' ? 'entrada' : 'saida',
    emissao: texto(ide, 'dhEmi') || texto(ide, 'dEmi'),
    emitente: {
      documento: normalizarDocumento(docEmit),
      nome: filhoDireto(emit, 'xNome'),
      fantasia: filhoDireto(emit, 'xFant') || undefined,
      ie: filhoDireto(emit, 'IE') || undefined,
      municipio: texto(primeiro(emit, 'enderEmit'), 'xMun') || undefined,
      uf: texto(primeiro(emit, 'enderEmit'), 'UF') || undefined,
    },
    destinatario: {
      documento: docDest ? normalizarDocumento(docDest) : '',
      nome: filhoDireto(dest, 'xNome') || 'Consumidor não identificado',
      municipio: texto(primeiro(dest, 'enderDest'), 'xMun') || undefined,
      uf: texto(primeiro(dest, 'enderDest'), 'UF') || undefined,
    },
    itens,
    totais,
    duplicatas,
    pagamentos,
    protocolo: prot
      ? { numero: texto(prot, 'nProt'), data: texto(prot, 'dhRecbto'), status: texto(prot, 'cStat'), motivo: texto(prot, 'xMotivo') }
      : undefined,
    situacao: situacaoPorStatus(prot ? texto(prot, 'cStat') : undefined),
    informacoesComplementares: texto(primeiro(inf, 'infAdic'), 'infCpl') || undefined,
  };
}
