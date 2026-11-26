// Conferência antes de pagar: o que dá para checar sem banco nem internet, só com o que já está
// no Prumo. Pega os erros e golpes mais comuns do contas a pagar:
//  - o mesmo boleto lançado (ou pago) duas vezes;
//  - boleto de valor ou vencimento diferente da duplicata da nota;
//  - boleto de um banco que esse fornecedor nunca usou (golpe do boleto adulterado);
//  - conta repetida (mesmo fornecedor, valor e vencimento) ou boleto que já veio pela nota.
// Leitura pura (sem efeitos), memoizada por versão do banco.

import { dataBR, diffDias, hoje, type ISODate } from '../lib/dates';
import { moeda } from '../lib/format';
import { bancoPorCodigo } from '../lib/br';
import { lerBoleto } from '../lib/boleto';
import { indices, nomeContato } from './selectors';
import type { Database, Lancamento, TipoLancamento } from './types';

export interface AlertaConferencia {
  /** 'critico' pede confirmação explícita antes de pagar */
  nivel: 'critico' | 'atencao';
  titulo: string;
  texto: string;
}

interface IndiceBoletos {
  /** código de barras (44) → títulos com esse boleto */
  porCodigo: Map<string, Lancamento[]>;
  /** fornecedor → bancos (código) dos boletos bancários já lançados */
  bancosPorContato: Map<string, Map<string, number>>;
  /** fornecedor → títulos a pagar */
  porContato: Map<string, Lancamento[]>;
}

const cache = new WeakMap<Database, IndiceBoletos>();

function codigoDe(linha?: string): { codigo: string; banco?: string } | null {
  if (!linha) return null;
  const b = lerBoleto(linha);
  if (!b?.valido || !b.codigoBarras) return null;
  return { codigo: b.codigoBarras, banco: b.tipo === 'bancario' ? b.banco?.codigo ?? b.codigoBarras.slice(0, 3) : undefined };
}

function indiceBoletos(db: Database): IndiceBoletos {
  let i = cache.get(db);
  if (i) return i;
  i = { porCodigo: new Map(), bancosPorContato: new Map(), porContato: new Map() };
  for (const l of db.lancamentos) {
    if (l.tipo !== 'pagar' || l.cancelado) continue;
    if (l.contatoId) {
      const lista = i.porContato.get(l.contatoId) ?? [];
      lista.push(l);
      i.porContato.set(l.contatoId, lista);
    }
    const c = codigoDe(l.linhaDigitavel);
    if (!c) continue;
    const lista = i.porCodigo.get(c.codigo) ?? [];
    lista.push(l);
    i.porCodigo.set(c.codigo, lista);
    if (c.banco && l.contatoId) {
      const bancos = i.bancosPorContato.get(l.contatoId) ?? new Map<string, number>();
      bancos.set(c.banco, (bancos.get(c.banco) ?? 0) + 1);
      i.bancosPorContato.set(l.contatoId, bancos);
    }
  }
  cache.set(db, i);
  return i;
}

const nomeBanco = (codigo: string) => bancoPorCodigo(codigo)?.nome ?? `banco ${codigo}`;

export interface AlvoConferencia {
  tipo: TipoLancamento;
  valor: number;
  vencimento: ISODate;
  linha?: string;
  contatoId?: string;
  notaId?: string;
  /** o próprio título (ao editar ou pagar), para não se comparar consigo mesmo */
  id?: string;
}

export function conferirPagamento(db: Database, alvo: AlvoConferencia, ref: ISODate = hoje()): AlertaConferencia[] {
  if (alvo.tipo !== 'pagar') return [];
  const alertas: AlertaConferencia[] = [];
  const idx = indiceBoletos(db);
  const fornecedor = alvo.contatoId ? nomeContato(db, alvo.contatoId) : '';
  const boleto = alvo.linha && alvo.linha.replace(/\D/g, '').length >= 44 ? lerBoleto(alvo.linha, ref) : null;
  const valido = boleto?.valido && boleto.codigoBarras ? boleto : null;
  const outros = (lista: Lancamento[] | undefined) => (lista ?? []).filter((l) => l.id !== alvo.id);

  if (valido) {
    // 1. o mesmo boleto em outro título
    const mesmos = outros(idx.porCodigo.get(valido.codigoBarras!));
    const pago = mesmos.find((l) => l.baixa);
    if (pago) {
      alertas.push({
        nivel: 'critico',
        titulo: 'Este boleto já foi pago',
        texto: `Foi pago em ${dataBR(pago.baixa!.data)} em “${pago.descricao}”. Pagar de novo seria pagar em dobro.`,
      });
    } else if (mesmos.length) {
      alertas.push({
        nivel: 'critico',
        titulo: 'Este boleto já está lançado',
        texto: `Está em “${mesmos[0].descricao}”, com vencimento em ${dataBR(mesmos[0].vencimento)}.`,
      });
    }

    // 2. valor e vencimento do boleto x o que foi lançado (ou a duplicata da nota)
    const daNota = alvo.notaId ? indices(db).notas.get(alvo.notaId) : undefined;
    if (valido.valor && valido.valor !== alvo.valor) {
      alertas.push({
        nivel: daNota ? 'critico' : 'atencao',
        titulo: daNota ? 'Valor do boleto diferente da nota' : 'Valor do boleto diferente do lançado',
        texto: daNota
          ? `O boleto é de ${moeda(valido.valor)}, mas a parcela da NF ${daNota.numero} é de ${moeda(alvo.valor)}. Confira com o fornecedor antes de pagar.`
          : `O boleto é de ${moeda(valido.valor)} e a conta está lançada com ${moeda(alvo.valor)}.`,
      });
    }
    if (valido.vencimento && valido.vencimento !== alvo.vencimento) {
      alertas.push({
        nivel: 'atencao',
        titulo: 'Vencimento do boleto diferente',
        texto: `O boleto vence em ${dataBR(valido.vencimento)} e a conta está para ${dataBR(alvo.vencimento)}.`,
      });
    }

    // 3. banco que o fornecedor nunca usou
    const banco = valido.tipo === 'bancario' ? valido.codigoBarras!.slice(0, 3) : undefined;
    if (banco && alvo.contatoId) {
      const historico = new Map(idx.bancosPorContato.get(alvo.contatoId) ?? []);
      // tira deste histórico o próprio título (ao editar/pagar ele já está no índice)
      const proprio = alvo.id ? db.lancamentos.find((l) => l.id === alvo.id) : undefined;
      const bancoProprio = codigoDe(proprio?.linhaDigitavel)?.banco;
      if (bancoProprio) {
        const n = (historico.get(bancoProprio) ?? 0) - 1;
        if (n > 0) historico.set(bancoProprio, n);
        else historico.delete(bancoProprio);
      }
      if (historico.size > 0 && !historico.has(banco)) {
        const anteriores = [...historico.keys()].map(nomeBanco).join(', ');
        alertas.push({
          nivel: 'critico',
          titulo: 'Banco diferente do habitual',
          texto: `Os boletos anteriores ${fornecedor ? `da ${fornecedor} ` : ''}vieram do ${anteriores}; este é do ${nomeBanco(banco)}. O golpe do boleto falso costuma trocar o banco. Confirme por telefone com o fornecedor, usando o número do cadastro (não o que estiver no boleto ou no e-mail).`,
        });
      }
    }
  }

  // 4. conta repetida: mesmo fornecedor, mesmo valor, vencimento igual ou muito perto
  if (alvo.contatoId && alvo.valor > 0 && alvo.vencimento) {
    const proprio = alvo.id ? db.lancamentos.find((l) => l.id === alvo.id) : undefined;
    const grupo = proprio?.grupoId;
    const codigo = valido?.codigoBarras;
    const parecida = outros(idx.porContato.get(alvo.contatoId)).find((l) => {
      if (l.valor !== alvo.valor || (grupo && l.grupoId === grupo)) return false;
      if (codigo && codigoDe(l.linhaDigitavel)?.codigo === codigo) return false; // já avisado acima
      if (alvo.notaId && l.notaId === alvo.notaId) return false;
      return Math.abs(diffDias(l.vencimento, alvo.vencimento)) <= 3;
    });
    if (parecida) {
      const nota = parecida.notaId ? indices(db).notas.get(parecida.notaId) : undefined;
      alertas.push(
        nota && !alvo.notaId
          ? {
              nivel: 'atencao',
              titulo: `Parece ser da NF ${nota.numero}`,
              texto: `A NF ${nota.numero} ${fornecedor ? `da ${fornecedor} ` : ''}já gerou uma conta de ${moeda(parecida.valor)} para ${dataBR(parecida.vencimento)}${parecida.baixa ? ', já paga' : ''}. Se este boleto é dessa nota, cole a linha digitável nela em vez de lançar outra conta.`,
            }
          : {
              nivel: 'atencao',
              titulo: 'Pode ser conta repetida',
              texto: `Já existe “${parecida.descricao}” de ${moeda(parecida.valor)} para ${fornecedor || 'o mesmo fornecedor'} em ${dataBR(parecida.vencimento)}${parecida.baixa ? ' (já paga)' : ''}.`,
            },
      );
    }
  }
  return alertas;
}

/** Atalho para um título já lançado. */
export const conferirTitulo = (db: Database, l: Lancamento, ref: ISODate = hoje()): AlertaConferencia[] =>
  l.baixa || l.cancelado
    ? []
    : conferirPagamento(db, { tipo: l.tipo, valor: l.valor, vencimento: l.vencimento, linha: l.linhaDigitavel, contatoId: l.contatoId, notaId: l.notaId, id: l.id }, ref);
