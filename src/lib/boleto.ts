// Leitura de boletos: linha digitável (47 dígitos, bancário; 48 dígitos, arrecadação/concessionárias)
// ou código de barras (44 dígitos). Extrai valor, vencimento e banco, validando os dígitos verificadores.
//
// Fator de vencimento: dias desde 07/10/1997. Em 22/02/2025 o fator chegou a 9999 e reiniciou em 1000
// (regra FEBRABAN), por isso escolhemos, entre as datas possíveis, a mais próxima da data de referência.

import { addDias, diffDias, hoje, type ISODate } from './dates';
import { bancoPorCodigo, soDigitos } from './br';

export interface BoletoInfo {
  tipo: 'bancario' | 'arrecadacao';
  valido: boolean;
  /** só dígitos, como foi informado */
  entrada: string;
  codigoBarras?: string;
  linhaDigitavel?: string;
  /** centavos */
  valor?: number;
  vencimento?: ISODate;
  banco?: { codigo: string; nome: string };
  segmento?: string;
  erros: string[];
}

const BASE_FATOR = '1997-10-07';

export function mod10(num: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = Number(num[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function somaPesos2a9(num: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    soma += Number(num[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma;
}

/** DV geral do código de barras bancário (posição 5). */
export function mod11Bancario(num: string): number {
  const dv = 11 - (somaPesos2a9(num) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

function mod11Arrecadacao(num: string): number {
  const resto = somaPesos2a9(num) % 11;
  return resto <= 1 ? 0 : 11 - resto;
}

export function dataPorFator(fator: number, ref: ISODate = hoje()): ISODate | undefined {
  if (!fator) return undefined;
  const antiga = addDias(BASE_FATOR, fator);
  const nova = addDias(BASE_FATOR, fator + 9000);
  return Math.abs(diffDias(antiga, ref)) <= Math.abs(diffDias(nova, ref)) ? antiga : nova;
}

export function fatorPorData(data: ISODate): number {
  const dias = diffDias(data, BASE_FATOR);
  if (dias < 1000) return dias;
  return ((dias - 1000) % 9000) + 1000;
}

const SEGMENTOS: Record<string, string> = {
  '1': 'Prefeituras',
  '2': 'Saneamento',
  '3': 'Energia elétrica e gás',
  '4': 'Telecomunicações',
  '5': 'Órgãos governamentais',
  '6': 'Carnês e assemelhados',
  '7': 'Multas de trânsito',
  '9': 'Uso exclusivo do banco',
};

function lerBarrasBancario(barras: string, ref: ISODate, erros: string[]) {
  const dvInformado = Number(barras[4]);
  const dvCalculado = mod11Bancario(barras.slice(0, 4) + barras.slice(5));
  if (dvInformado !== dvCalculado) erros.push('Dígito verificador geral não confere.');
  const fator = Number(barras.slice(5, 9));
  const valor = Number(barras.slice(9, 19));
  const codigo = barras.slice(0, 3);
  return {
    valor: valor || undefined,
    vencimento: dataPorFator(fator, ref),
    banco: { codigo, nome: bancoPorCodigo(codigo)?.nome ?? `Banco ${codigo}` },
  };
}

export function lerBoleto(entradaBruta: string, ref: ISODate = hoje()): BoletoInfo | null {
  const entrada = soDigitos(entradaBruta);
  const erros: string[] = [];

  // Linha digitável bancária: 47 dígitos
  if (entrada.length === 47) {
    const campos = [
      { num: entrada.slice(0, 9), dv: Number(entrada[9]) },
      { num: entrada.slice(10, 20), dv: Number(entrada[20]) },
      { num: entrada.slice(21, 31), dv: Number(entrada[31]) },
    ];
    campos.forEach((c, i) => {
      if (mod10(c.num) !== c.dv) erros.push(`O ${i + 1}º bloco tem um dígito errado.`);
    });
    const barras =
      entrada.slice(0, 4) + entrada[32] + entrada.slice(33, 47) + entrada.slice(4, 9) + entrada.slice(10, 20) + entrada.slice(21, 31);
    const dados = lerBarrasBancario(barras, ref, erros);
    return { tipo: 'bancario', valido: erros.length === 0, entrada, codigoBarras: barras, linhaDigitavel: entrada, ...dados, erros };
  }

  // Código de barras (44 dígitos), lido por leitor/câmera
  if (entrada.length === 44) {
    if (entrada[0] === '8') return lerArrecadacao(entrada, entrada, erros);
    const dados = lerBarrasBancario(entrada, ref, erros);
    return { tipo: 'bancario', valido: erros.length === 0, entrada, codigoBarras: entrada, ...dados, erros };
  }

  // Arrecadação (contas de consumo, tributos): 48 dígitos, 4 blocos de 11 + DV
  if (entrada.length === 48 && entrada[0] === '8') {
    const blocos = [0, 1, 2, 3].map((i) => entrada.slice(i * 12, i * 12 + 12));
    const barras = blocos.map((b) => b.slice(0, 11)).join('');
    const usaMod10 = barras[2] === '6' || barras[2] === '7';
    blocos.forEach((b, i) => {
      const dv = usaMod10 ? mod10(b.slice(0, 11)) : mod11Arrecadacao(b.slice(0, 11));
      if (dv !== Number(b[11])) erros.push(`O ${i + 1}º bloco tem um dígito errado.`);
    });
    return lerArrecadacao(barras, entrada, erros);
  }

  return null;
}

function lerArrecadacao(barras: string, entrada: string, erros: string[]): BoletoInfo {
  const usaMod10 = barras[2] === '6' || barras[2] === '7';
  const semDv = barras.slice(0, 3) + barras.slice(4);
  const dv = usaMod10 ? mod10(semDv) : mod11Arrecadacao(semDv);
  if (dv !== Number(barras[3])) erros.push('Dígito verificador geral não confere.');
  const valor = Number(barras.slice(4, 15));
  return {
    tipo: 'arrecadacao',
    valido: erros.length === 0,
    entrada,
    codigoBarras: barras,
    linhaDigitavel: entrada.length === 48 ? entrada : undefined,
    valor: valor || undefined,
    segmento: SEGMENTOS[barras[1]] ?? 'Arrecadação',
    erros,
  };
}

/** Gera uma linha digitável bancária válida (usada nos dados de demonstração e nos testes). */
export function gerarLinhaDigitavel(bancoCodigo: string, vencimento: ISODate, valorCentavos: number, campoLivre: string): string {
  const livre = campoLivre.padStart(25, '0').slice(0, 25);
  const fator = String(fatorPorData(vencimento)).padStart(4, '0');
  const valor = String(valorCentavos).padStart(10, '0');
  const semDv = bancoCodigo + '9' + fator + valor + livre;
  const dv = mod11Bancario(semDv);
  const c1 = bancoCodigo + '9' + livre.slice(0, 5);
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  return `${c1}${mod10(c1)}${c2}${mod10(c2)}${c3}${mod10(c3)}${dv}${fator}${valor}`;
}

/** 00190.00009 01234.567890 12345.678901 2 16560000123456 */
export function formatarLinhaDigitavel(linha: string): string {
  const d = soDigitos(linha);
  if (d.length === 47) {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  }
  if (d.length === 48) return [0, 1, 2, 3].map((i) => `${d.slice(i * 12, i * 12 + 11)}-${d[i * 12 + 11]}`).join(' ');
  return d;
}
