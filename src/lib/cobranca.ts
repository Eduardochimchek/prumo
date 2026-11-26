// Cobrança pelo WhatsApp sem API: o Prumo monta a mensagem e abre o WhatsApp do próprio
// usuário (link wa.me). Nada é enviado por servidor nosso; quem aperta "enviar" é a pessoa.

import { diffDias, dataBR, type ISODate } from './dates';
import { moeda } from './format';
import { normalizarDocumento, soDigitos } from './br';

/**
 * Telefone no formato que o wa.me espera (55 + DDD + número). Aceita "(51) 99876-5432",
 * "51998765432", "+55 51 99876-5432". Fixo (10 dígitos) também vale: há WhatsApp Business em fixo.
 */
export function telefoneWhatsApp(entrada?: string | null): string | null {
  if (!entrada) return null;
  let d = soDigitos(entrada);
  if (d.startsWith('0')) d = d.replace(/^0+/, ''); // 0 51 ... (discagem com operadora/zero)
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    const ddd = Number(d.slice(2, 4));
    if (ddd >= 11 && ddd <= 99) return d;
  }
  return null;
}

/** Link que abre o WhatsApp com o texto pronto. Sem telefone, o WhatsApp pede para escolher o contato. */
export function linkWhatsApp(texto: string, telefone?: string | null): string {
  const tel = telefoneWhatsApp(telefone);
  return `https://wa.me/${tel ?? ''}?text=${encodeURIComponent(texto)}`;
}

export interface DadosMensagem {
  empresa: string;
  /** nome que aparece no "Olá, …!" (primeiro nome de pessoa física ou o nome da empresa) */
  cliente?: string;
  valor: number;
  vencimento: ISODate;
  ref: ISODate;
  /** o que está sendo cobrado: "NF 3205 · 1/2", "Recibo 0912"… */
  referente?: string;
  pix?: string;
  linhaDigitavel?: string;
}

export type MomentoCobranca = 'antes' | 'hoje' | 'atrasado';

export const momentoCobranca = (vencimento: ISODate, ref: ISODate): MomentoCobranca =>
  vencimento > ref ? 'antes' : vencimento === ref ? 'hoje' : 'atrasado';

/** Mensagem educada, que muda de tom conforme o vencimento (lembrete, dia, atraso). */
export function mensagemCobranca(d: DadosMensagem): string {
  const momento = momentoCobranca(d.vencimento, d.ref);
  const ola = d.cliente ? `Olá, ${d.cliente}!` : 'Olá!';
  const doc = d.referente ? `o pagamento (${d.referente})` : 'o pagamento';
  const valor = moeda(d.valor);
  const data = dataBR(d.vencimento);
  const linhas: string[] = [`${ola} Aqui é da ${d.empresa}.`, ''];
  if (momento === 'antes') {
    const dias = diffDias(d.vencimento, d.ref);
    const quando = dias === 1 ? 'amanhã' : `em ${dias} dias`;
    linhas.push(`Passando para lembrar que ${doc}, no valor de ${valor}, vence ${quando} (${data}).`);
  } else if (momento === 'hoje') {
    linhas.push(`Lembrando que ${doc}, no valor de ${valor}, vence hoje (${data}).`);
  } else {
    linhas.push(`Notamos que ${doc}, no valor de ${valor}, venceu em ${data} e ainda não aparece como pago por aqui.`);
    linhas.push('Se já pagou, pode desconsiderar; se puder, nos mande o comprovante. Se precisar combinar outra data ou forma de pagamento, é só responder esta mensagem.');
  }
  if (d.pix) linhas.push('', 'PIX copia e cola:', d.pix);
  else if (d.linhaDigitavel) linhas.push('', 'Linha digitável do boleto:', d.linhaDigitavel);
  linhas.push('', 'Obrigado!');
  return linhas.join('\n');
}

/** "Construtora Laje Forte Ltda" fica como está; "Marina Duarte Souza" (pessoa física) vira "Marina". */
export function nomeParaSaudacao(nome: string, fantasia?: string, documento?: string): string {
  // CPF = 11 dígitos e nada mais (CNPJ alfanumérico pode ter 11 dígitos misturados com letras)
  const pessoaFisica = /^\d{11}$/.test(normalizarDocumento(documento ?? ''));
  if (pessoaFisica) return nome.trim().split(/\s+/)[0];
  return (fantasia || nome).trim();
}
