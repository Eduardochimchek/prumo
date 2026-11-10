// Chave de acesso da NF-e / NFC-e / CT-e (44 posições):
// cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
// Com o CNPJ alfanumérico (NT 2025.001), o trecho do CNPJ pode conter letras; o DV usa (ASCII − 48).

import { cnpjValido, cpfValido, mascaraCnpj, mascaraCpf, normalizarCnpj, ufPorCodigo } from '../br';

export const MODELOS: Record<string, string> = {
  '55': 'NF-e',
  '65': 'NFC-e',
  '57': 'CT-e',
  '58': 'MDF-e',
  '59': 'CF-e SAT',
  '67': 'CT-e OS',
};

export const TIPOS_EMISSAO: Record<string, string> = {
  '1': 'Normal',
  '2': 'Contingência FS-IA',
  '3': 'Regime especial NFF',
  '4': 'Contingência EPEC',
  '5': 'Contingência FS-DA',
  '6': 'Contingência SVC-AN',
  '7': 'Contingência SVC-RS',
  '9': 'Contingência off-line (NFC-e)',
};

/** Portal nacional da NF-e (consulta pública exige captcha, o usuário cola a chave lá). */
export const URL_PORTAL_NFE =
  'https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=';

export const normalizarChave = (s: string): string => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

export const formatarChave = (s: string): string => normalizarChave(s).replace(/(.{4})/g, '$1 ').trim();

export function calcularDvChave(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += (base43.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export interface ChaveInfo {
  chave: string;
  completa: boolean;
  valida: boolean;
  erros: string[];
  uf?: { codigo: string; sigla: string; nome: string };
  /** 'YYYY-MM' */
  anoMes?: string;
  emitente?: { documento: string; tipo: 'CNPJ' | 'CPF'; formatado: string; valido: boolean };
  modelo?: { codigo: string; nome: string };
  serie?: number;
  numero?: number;
  tipoEmissao?: { codigo: string; nome: string };
  codigoNumerico?: string;
  dv?: number;
  dvEsperado?: number;
}

export function analisarChave(entrada: string): ChaveInfo {
  const chave = normalizarChave(entrada);
  if (chave.length !== 44) {
    return {
      chave,
      completa: false,
      valida: false,
      erros: [`A chave de acesso tem 44 caracteres, e esta tem ${chave.length}.`],
    };
  }
  const erros: string[] = [];
  if (!/^\d{6}[0-9A-Z]{12}\d{26}$/.test(chave)) {
    erros.push('Só o trecho do CNPJ (posições 7 a 18) pode conter letras.');
  }

  const uf = ufPorCodigo(chave.slice(0, 2));
  if (!uf) erros.push(`Código de UF desconhecido: ${chave.slice(0, 2)}.`);

  const mes = Number(chave.slice(4, 6));
  if (mes < 1 || mes > 12) erros.push('Mês de emissão inválido.');
  const anoMes = `20${chave.slice(2, 4)}-${chave.slice(4, 6)}`;

  const doc = chave.slice(6, 20);
  const ehCpf = doc.startsWith('000') && /^\d{14}$/.test(doc) && cpfValido(doc.slice(3)) && !cnpjValido(doc);
  const emitente = ehCpf
    ? { documento: doc.slice(3), tipo: 'CPF' as const, formatado: mascaraCpf(doc.slice(3)), valido: true }
    : { documento: normalizarCnpj(doc), tipo: 'CNPJ' as const, formatado: mascaraCnpj(doc), valido: cnpjValido(doc) };
  if (!emitente.valido) erros.push('O CNPJ do emitente dentro da chave não é válido.');

  const codModelo = chave.slice(20, 22);
  const nomeModelo = MODELOS[codModelo];
  if (!nomeModelo) erros.push(`Modelo de documento ${codModelo} desconhecido.`);

  const codEmissao = chave.slice(34, 35);
  const dv = Number(chave[43]);
  const dvEsperado = calcularDvChave(chave.slice(0, 43));
  if (dv !== dvEsperado) erros.push(`Dígito verificador não confere (deveria ser ${dvEsperado}).`);

  return {
    chave,
    completa: true,
    valida: erros.length === 0,
    erros,
    uf,
    anoMes,
    emitente,
    modelo: { codigo: codModelo, nome: nomeModelo ?? 'Desconhecido' },
    serie: Number(chave.slice(22, 25)),
    numero: Number(chave.slice(25, 34)),
    tipoEmissao: { codigo: codEmissao, nome: TIPOS_EMISSAO[codEmissao] ?? 'Desconhecido' },
    codigoNumerico: chave.slice(35, 43),
    dv,
    dvEsperado,
  };
}

export function montarChave(p: {
  ufCodigo: string;
  anoMes: string;
  cnpj: string;
  modelo?: string;
  serie: number;
  numero: number;
  tipoEmissao?: string;
  codigoNumerico: string;
}): string {
  const base =
    p.ufCodigo +
    p.anoMes.slice(2, 4) +
    p.anoMes.slice(5, 7) +
    normalizarCnpj(p.cnpj).padStart(14, '0') +
    (p.modelo ?? '55') +
    String(p.serie).padStart(3, '0') +
    String(p.numero).padStart(9, '0') +
    (p.tipoEmissao ?? '1') +
    p.codigoNumerico.padStart(8, '0').slice(0, 8);
  return base + calcularDvChave(base);
}
