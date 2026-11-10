// Gera XML de NF-e (nfeProc) a partir de NFeDados. Usado para o "XML de exemplo" que o usuário
// baixa para testar a importação e para os testes automatizados (ida e volta com o parser).
// O XML gerado é marcado como HOMOLOGAÇÃO e SEM VALOR FISCAL. Não tem assinatura digital.

import { addDias, hoje } from '../dates';
import { calcularDvCnpj, ufPorSigla } from '../br';
import { montarChave } from './chave';
import type { NFeDados } from './parser';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const dec = (c: number) => (c / 100).toFixed(2);
const tagDoc = (doc: string) => (doc.length === 11 ? `<CPF>${doc}</CPF>` : `<CNPJ>${doc}</CNPJ>`);

export function gerarXmlNFe(d: NFeDados): string {
  const itens = d.itens
    .map(
      (it, i) => `<det nItem="${i + 1}"><prod><cProd>${esc(it.codigo)}</cProd><cEAN>SEM GTIN</cEAN><xProd>${esc(it.descricao)}</xProd>` +
        `<NCM>${it.ncm ?? '00000000'}</NCM><CFOP>${it.cfop ?? '5102'}</CFOP><uCom>${esc(it.unidade ?? 'UN')}</uCom>` +
        `<qCom>${it.quantidade.toFixed(4)}</qCom><vUnCom>${(it.valorUnitario / 100).toFixed(10)}</vUnCom><vProd>${dec(it.valorTotal)}</vProd>` +
        `<cEANTrib>SEM GTIN</cEANTrib><uTrib>${esc(it.unidade ?? 'UN')}</uTrib><qTrib>${it.quantidade.toFixed(4)}</qTrib>` +
        `<vUnTrib>${(it.valorUnitario / 100).toFixed(10)}</vUnTrib><indTot>1</indTot></prod>` +
        `<imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${dec(it.valorTotal)}</vBC><pICMS>17.00</pICMS>` +
        `<vICMS>${dec(Math.round(it.valorTotal * 0.17))}</vICMS></ICMS00></ICMS></imposto></det>`,
    )
    .join('');
  const t = d.totais;
  const dups = d.duplicatas
    .map((x) => `<dup><nDup>${esc(x.numero)}</nDup><dVenc>${x.vencimento}</dVenc><vDup>${dec(x.valor)}</vDup></dup>`)
    .join('');
  const cobr = d.duplicatas.length
    ? `<cobr><fat><nFat>${esc(d.numero)}</nFat><vOrig>${dec(t.nota)}</vOrig><vDesc>0.00</vDesc><vLiq>${dec(t.nota)}</vLiq></fat>${dups}</cobr>`
    : '';
  const pag = (d.pagamentos.length ? d.pagamentos : [{ forma: '15', descricao: '', valor: t.nota }])
    .map((p) => `<detPag><tPag>${p.forma}</tPag><vPag>${dec(p.valor)}</vPag></detPag>`)
    .join('');
  const prot = d.protocolo
    ? `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>PRUMO-EXEMPLO</verAplic><chNFe>${d.chave}</chNFe>` +
      `<dhRecbto>${d.protocolo.data}</dhRecbto><nProt>${d.protocolo.numero}</nProt><cStat>${d.protocolo.status}</cStat>` +
      `<xMotivo>${esc(d.protocolo.motivo)}</xMotivo></infProt></protNFe>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${d.chave}" versao="4.00">` +
    `<ide><cUF>${d.chave.slice(0, 2)}</cUF><cNF>${d.chave.slice(35, 43)}</cNF><natOp>${esc(d.naturezaOperacao)}</natOp><mod>${d.modelo}</mod>` +
    `<serie>${d.serie}</serie><nNF>${d.numero}</nNF><dhEmi>${d.emissao}</dhEmi><tpNF>${d.tipoOperacao === 'entrada' ? 0 : 1}</tpNF>` +
    `<idDest>1</idDest><tpImp>1</tpImp><tpEmis>${d.chave[34]}</tpEmis><cDV>${d.chave[43]}</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe>` +
    `<indFinal>0</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>Prumo exemplo</verProc></ide>` +
    `<emit>${tagDoc(d.emitente.documento)}<xNome>${esc(d.emitente.nome)}</xNome>${d.emitente.fantasia ? `<xFant>${esc(d.emitente.fantasia)}</xFant>` : ''}` +
    `<enderEmit><xMun>${esc(d.emitente.municipio ?? '')}</xMun><UF>${d.emitente.uf ?? ''}</UF></enderEmit><IE>${d.emitente.ie ?? 'ISENTO'}</IE><CRT>3</CRT></emit>` +
    `<dest>${tagDoc(d.destinatario.documento)}<xNome>${esc(d.destinatario.nome)}</xNome>` +
    `<enderDest><xMun>${esc(d.destinatario.municipio ?? '')}</xMun><UF>${d.destinatario.uf ?? ''}</UF></enderDest><indIEDest>1</indIEDest></dest>` +
    itens +
    `<total><ICMSTot><vBC>${dec(t.produtos)}</vBC><vICMS>${dec(t.icms)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP>` +
    `<vBCST>0.00</vBCST><vST>${dec(t.st)}</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${dec(t.produtos)}</vProd>` +
    `<vFrete>${dec(t.frete)}</vFrete><vSeg>${dec(t.seguro)}</vSeg><vDesc>${dec(t.desconto)}</vDesc><vII>0.00</vII><vIPI>${dec(t.ipi)}</vIPI>` +
    `<vIPIDevol>0.00</vIPIDevol><vPIS>${dec(t.pis)}</vPIS><vCOFINS>${dec(t.cofins)}</vCOFINS><vOutro>${dec(t.outros)}</vOutro>` +
    `<vNF>${dec(t.nota)}</vNF></ICMSTot></total><transp><modFrete>0</modFrete></transp>${cobr}<pag>${pag}</pag>` +
    `<infAdic><infCpl>${esc(d.informacoesComplementares ?? '')}</infCpl></infAdic></infNFe></NFe>${prot}</nfeProc>`;
}

/** NF-e de exemplo: um fornecedor fictício vendendo para a empresa do usuário, com 3 duplicatas. */
export function exemploNFeParaEmpresa(
  empresa: { cnpj: string; razaoSocial: string; uf: string; municipio: string },
  ref = hoje(),
  numero = 4821,
): NFeDados {
  const base = '87304512000';
  const cnpjFornecedor = `${base}1${calcularDvCnpj(`${base}1`)}`;
  const ufCodigo = ufPorSigla(empresa.uf)?.codigo ?? '43';
  const chave = montarChave({
    ufCodigo,
    anoMes: ref.slice(0, 7),
    cnpj: cnpjFornecedor,
    serie: 1,
    numero,
    codigoNumerico: String(10_000_000 + numero * 37),
  });
  const itens = [
    { codigo: 'CIM-50', descricao: 'Cimento CP II-F 32 saco 50 kg', ncm: '25232910', cfop: '5102', unidade: 'SC', quantidade: 120, valorUnitario: 3890 },
    { codigo: 'ARG-20', descricao: 'Argamassa AC-II interna/externa 20 kg', ncm: '32149000', cfop: '5102', unidade: 'SC', quantidade: 80, valorUnitario: 2475 },
    { codigo: 'TIN-18', descricao: 'Tinta acrílica fosca branco neve 18 L', ncm: '32091010', cfop: '5102', unidade: 'GL', quantidade: 12, valorUnitario: 28990 },
  ].map((i) => ({ ...i, valorTotal: Math.round(i.quantidade * i.valorUnitario) }));
  const produtos = itens.reduce((a, i) => a + i.valorTotal, 0);
  const frete = 18000;
  const nota = produtos + frete;
  const parcela = Math.floor(nota / 3);
  const duplicatas = [30, 60, 90].map((dias, i) => ({
    numero: String(i + 1).padStart(3, '0'),
    vencimento: addDias(ref, dias),
    valor: i === 2 ? nota - parcela * 2 : parcela,
  }));
  return {
    chave,
    modelo: '55',
    serie: '1',
    numero: String(numero),
    naturezaOperacao: 'Venda de mercadoria adquirida de terceiros',
    tipoOperacao: 'saida',
    emissao: `${ref}T09:42:00-03:00`,
    emitente: {
      documento: cnpjFornecedor,
      nome: 'Comercial Ponte de Pedra Materiais Ltda',
      fantasia: 'Ponte de Pedra',
      ie: '0960123456',
      municipio: 'Novo Hamburgo',
      uf: empresa.uf || 'RS',
    },
    destinatario: { documento: empresa.cnpj, nome: empresa.razaoSocial, municipio: empresa.municipio, uf: empresa.uf },
    itens,
    totais: {
      produtos,
      frete,
      seguro: 0,
      desconto: 0,
      outros: 0,
      ipi: 0,
      icms: Math.round(produtos * 0.17),
      st: 0,
      pis: Math.round(produtos * 0.0165),
      cofins: Math.round(produtos * 0.076),
      nota,
    },
    duplicatas,
    pagamentos: [{ forma: '15', descricao: 'Boleto bancário', valor: nota }],
    protocolo: { numero: `14326${String(numero).padStart(10, '0')}`, data: `${ref}T09:42:31-03:00`, status: '100', motivo: 'Autorizado o uso da NF-e' },
    situacao: 'autorizada',
    informacoesComplementares: 'XML DE EXEMPLO GERADO PELO PRUMO - EMITIDO EM HOMOLOGACAO - SEM VALOR FISCAL',
  };
}
