// Escritas (casos de uso). Cada função recebe o usuário que executa a ação, valida regras de
// negócio, grava via `atualizar()` e registra a atividade (trilha de auditoria).

import { agoraISO, hoje, mesChave, type ISODate } from '../lib/dates';
import { moeda, normalizarBusca, plural } from '../lib/format';
import { normalizarCnpj, normalizarDocumento } from '../lib/br';
import { gerarSal, hashSenha, iguais } from '../lib/sha256';
import { avaliarSenha, ITERACOES_LEGADO, ITERACOES_SENHA } from '../lib/seguranca';
import { uid } from '../lib/util';
import type { NFeDados } from '../lib/nfe/parser';
import { gerarLinhaDigitavel, lerBoleto } from '../lib/boleto';
import { pixCopiaECola } from '../lib/pix';
import { fiscal } from '../services/fiscal';
import { totaisDaVenda } from './vendas';
import { chaveTitulo, precisaAprovacao } from './selectors';
import type { LinhaPlanilha } from '../lib/planilha';
import { atualizar, getDb } from './store';
import type {
  Atividade,
  Modulo,
  Baixa,
  Categoria,
  ContaBancaria,
  Contato,
  Database,
  Empresa,
  Lancamento,
  Manifestacao,
  NotaFiscal,
  TipoAtividade,
  Usuario,
  Produto,
  Venda,
  Cobranca,
} from './types';

export class ErroNegocio extends Error {}

const primeiroNome = (db: Database, usuarioId: string) =>
  db.usuarios.find((u) => u.id === usuarioId)?.nome.split(' ')[0] ?? 'Alguém';

function comAtividade(db: Database, usuarioId: string, tipo: TipoAtividade, texto: string, ref?: Atividade['ref']): Database {
  const a: Atividade = { id: uid('atv_'), em: agoraISO(), usuarioId, tipo, texto: `${primeiroNome(db, usuarioId)} ${texto}`, ref };
  return { ...db, atividades: [a, ...db.atividades].slice(0, 300) };
}

// ---------- Lançamentos (contas a pagar / receber) ----------

export type NovoLancamento = Omit<Lancamento, 'id' | 'criadoEm' | 'criadoPor'>;

export function criarLancamentos(novos: NovoLancamento[], usuarioId: string): Lancamento[] {
  if (novos.length === 0) return [];
  for (const n of novos) {
    if (!n.descricao.trim()) throw new ErroNegocio('Informe uma descrição.');
    if (!(n.valor > 0)) throw new ErroNegocio('O valor precisa ser maior que zero.');
    if (!n.vencimento) throw new ErroNegocio('Informe o vencimento.');
  }
  const criados: Lancamento[] = novos.map((n) => ({ ...n, id: uid('lan_'), criadoEm: agoraISO(), criadoPor: usuarioId }));
  const primeiro = criados[0];
  const total = criados.reduce((a, l) => a + l.valor, 0);
  const texto =
    criados.length > 1
      ? `lançou ${criados.length} parcelas de “${primeiro.descricao}” (${moeda(total)})`
      : `lançou ${primeiro.tipo === 'pagar' ? 'a pagar' : 'a receber'} “${primeiro.descricao}” (${moeda(total)})`;
  atualizar((db) => comAtividade({ ...db, lancamentos: [...db.lancamentos, ...criados] }, usuarioId, 'criacao', texto, { tipo: 'lancamento', id: primeiro.id }));
  return criados;
}

export function editarLancamento(id: string, patch: Partial<NovoLancamento>, usuarioId: string): void {
  atualizar((db) => {
    const atual = db.lancamentos.find((l) => l.id === id);
    if (!atual) throw new ErroNegocio('Lançamento não encontrado.');
    // Aprovado e depois mudou valor, boleto, fornecedor ou forma? A aprovação cai: quem aprovou viu outra conta.
    const campos = ['valor', 'linhaDigitavel', 'contatoId', 'forma', 'tipo'] as const;
    const perdeAprovacao = !!atual.aprovacao && campos.some((k) => k in patch && patch[k] !== atual[k]);
    const novo = { ...atual, ...patch, aprovacao: perdeAprovacao ? undefined : atual.aprovacao, atualizadoEm: agoraISO() };
    return comAtividade(
      { ...db, lancamentos: db.lancamentos.map((l) => (l.id === id ? novo : l)) },
      usuarioId,
      'edicao',
      `editou “${novo.descricao}”${perdeAprovacao ? ' (a aprovação do pagamento foi retirada)' : ''}`,
      { tipo: 'lancamento', id },
    );
  });
}

export function cancelarLancamento(id: string, usuarioId: string, motivo?: string): void {
  atualizar((db) => {
    const l = db.lancamentos.find((x) => x.id === id);
    if (!l) throw new ErroNegocio('Lançamento não encontrado.');
    if (l.baixa) throw new ErroNegocio('Estorne a baixa antes de cancelar.');
    const obs = motivo ? `${l.observacoes ? l.observacoes + '\n' : ''}Cancelado: ${motivo}` : l.observacoes;
    return comAtividade(
      { ...db, lancamentos: db.lancamentos.map((x) => (x.id === id ? { ...x, cancelado: true, observacoes: obs, atualizadoEm: agoraISO() } : x)) },
      usuarioId,
      'exclusao',
      `cancelou “${l.descricao}”`,
      { tipo: 'lancamento', id },
    );
  });
}

export function reativarLancamento(id: string, usuarioId: string): void {
  atualizar((db) => {
    const l = db.lancamentos.find((x) => x.id === id);
    if (!l) return db;
    return comAtividade(
      { ...db, lancamentos: db.lancamentos.map((x) => (x.id === id ? { ...x, cancelado: false, atualizadoEm: agoraISO() } : x)) },
      usuarioId,
      'edicao',
      `reativou “${l.descricao}”`,
      { tipo: 'lancamento', id },
    );
  });
}

export interface DadosBaixa {
  data: ISODate;
  contaId: string;
  juros?: number;
  desconto?: number;
  /** só para baixa individual; em lote usa o valor de cada título */
  valorPago?: number;
  /**
   * Pagamento parcial (só individual): quanto do valor do título está sendo quitado agora.
   * O título fica com esse valor (quitado) e o restante vira um novo título em aberto.
   */
  parcial?: number;
  observacao?: string;
}

export function darBaixa(ids: string[], dados: DadosBaixa, usuarioId: string): void {
  if (!dados.contaId) throw new ErroNegocio('Escolha a conta bancária.');
  if (!dados.data) throw new ErroNegocio('Informe a data do pagamento.');
  atualizar((db) => {
    const alvo = db.lancamentos.filter((l) => ids.includes(l.id) && !l.baixa && !l.cancelado);
    if (alvo.length === 0) throw new ErroNegocio('Nenhum título em aberto selecionado.');
    const semAprovacao = alvo.filter((l) => precisaAprovacao(db, l));
    if (semAprovacao.length) {
      throw new ErroNegocio(
        semAprovacao.length === 1
          ? `“${semAprovacao[0].descricao}” passa do limite de ${moeda(db.empresa.limiteAprovacao ?? 0)} e precisa ser aprovado por um administrador antes do pagamento.`
          : `${semAprovacao.length} contas passam do limite de ${moeda(db.empresa.limiteAprovacao ?? 0)} e precisam ser aprovadas por um administrador antes do pagamento.`,
      );
    }
    const individual = alvo.length === 1;
    let saldo: Lancamento | null = null;
    if (individual && dados.parcial !== undefined) {
      const l = alvo[0];
      if (!(dados.parcial > 0) || dados.parcial > l.valor) throw new ErroNegocio('O valor parcial precisa ser maior que zero e menor que o valor do título.');
      if (dados.parcial < l.valor) {
        saldo = {
          ...l,
          id: uid('lan_'),
          valor: l.valor - dados.parcial,
          descricao: l.descricao.endsWith('(saldo)') ? l.descricao : `${l.descricao} (saldo)`,
          linhaDigitavel: undefined,
          observacoes: `Saldo restante do pagamento parcial de ${dados.data.split('-').reverse().join('/')}.`,
          criadoEm: agoraISO(),
          criadoPor: usuarioId,
          atualizadoEm: undefined,
        };
        alvo[0] = { ...l, valor: dados.parcial };
      }
    }
    const baixas = new Map<string, Baixa>(
      alvo.map((l) => {
        const juros = individual ? dados.juros ?? 0 : 0;
        const desconto = individual ? dados.desconto ?? 0 : 0;
        return [
          l.id,
          {
            data: dados.data,
            valorPago: individual && dados.valorPago && dados.parcial === undefined ? dados.valorPago : l.valor + juros - desconto,
            juros,
            desconto,
            contaId: dados.contaId,
            usuarioId,
            registradaEm: agoraISO(),
            observacao: dados.observacao,
          },
        ];
      }),
    );
    const total = [...baixas.values()].reduce((a, b) => a + b.valorPago, 0);
    const verbo = alvo[0].tipo === 'pagar' ? 'pagou' : 'recebeu';
    const texto = individual
      ? `${verbo} ${saldo ? `parte (${moeda(total)}) de` : ''} “${alvo[0].descricao}”`.replace('  ', ' ')
      : `${verbo} ${alvo.length} títulos (${moeda(total)})`;
    const porId = new Map(alvo.map((l) => [l.id, l]));
    const lancamentos = db.lancamentos.map((l) => (baixas.has(l.id) ? { ...(porId.get(l.id) ?? l), baixa: baixas.get(l.id) } : l));
    return comAtividade(
      { ...db, lancamentos: saldo ? [...lancamentos, saldo] : lancamentos },
      usuarioId,
      'baixa',
      texto,
      { tipo: 'lancamento', id: alvo[0].id },
    );
  });
}

export function estornarBaixa(ids: string[], usuarioId: string): void {
  atualizar((db) => {
    const alvo = db.lancamentos.filter((l) => ids.includes(l.id) && l.baixa);
    if (alvo.length === 0) return db;
    const texto = alvo.length === 1 ? `estornou a baixa de “${alvo[0].descricao}”` : `estornou ${alvo.length} baixas`;
    return comAtividade(
      { ...db, lancamentos: db.lancamentos.map((l) => (ids.includes(l.id) ? { ...l, baixa: undefined, atualizadoEm: agoraISO() } : l)) },
      usuarioId,
      'estorno',
      texto,
      { tipo: 'lancamento', id: alvo[0].id },
    );
  });
}

// ---------- Aprovação de pagamentos (alçada) ----------

function exigirAdmin(db: Database, usuarioId: string): void {
  const u = db.usuarios.find((x) => x.id === usuarioId && x.ativo);
  if (!u || u.papel !== 'admin') throw new ErroNegocio('Só um administrador pode aprovar pagamentos.');
}

/** Liga (valor > 0) ou desliga (0) a aprovação de pagamentos a partir de um valor. Só administrador. */
export function definirLimiteAprovacao(valor: number, usuarioId: string): void {
  if (!Number.isInteger(valor) || valor < 0) throw new ErroNegocio('Informe um valor válido.');
  atualizar((db) => {
    exigirAdmin(db, usuarioId);
    if ((db.empresa.limiteAprovacao ?? 0) === valor) return db;
    return comAtividade(
      { ...db, empresa: { ...db.empresa, limiteAprovacao: valor || undefined } },
      usuarioId,
      'config',
      valor ? `passou a exigir aprovação para pagamentos a partir de ${moeda(valor)}` : 'desligou a aprovação de pagamentos',
    );
  });
}

export function aprovarPagamentos(ids: string[], usuarioId: string): number {
  let n = 0;
  atualizar((db) => {
    exigirAdmin(db, usuarioId);
    const alvo = new Set(db.lancamentos.filter((l) => ids.includes(l.id) && precisaAprovacao(db, l)).map((l) => l.id));
    n = alvo.size;
    if (!n) return db;
    const em = agoraISO();
    const aprovados = db.lancamentos.filter((l) => alvo.has(l.id));
    const total = aprovados.reduce((a, l) => a + l.valor, 0);
    return comAtividade(
      { ...db, lancamentos: db.lancamentos.map((l) => (alvo.has(l.id) ? { ...l, aprovacao: { usuarioId, em } } : l)) },
      usuarioId,
      'edicao',
      n === 1 ? `aprovou o pagamento de “${aprovados[0].descricao}” (${moeda(total)})` : `aprovou ${n} pagamentos (${moeda(total)})`,
      { tipo: 'lancamento', id: aprovados[0].id },
    );
  });
  return n;
}

export function retirarAprovacao(id: string, usuarioId: string): void {
  atualizar((db) => {
    exigirAdmin(db, usuarioId);
    const l = db.lancamentos.find((x) => x.id === id);
    if (!l?.aprovacao) return db;
    if (l.baixa) throw new ErroNegocio('Esta conta já foi paga.');
    return comAtividade(
      { ...db, lancamentos: db.lancamentos.map((x) => (x.id === id ? { ...x, aprovacao: undefined } : x)) },
      usuarioId,
      'edicao',
      `retirou a aprovação do pagamento de “${l.descricao}”`,
      { tipo: 'lancamento', id },
    );
  });
}

// ---------- Cobrança pelo WhatsApp ----------

/** Registra que a cobrança foi aberta no WhatsApp (o envio em si é feito pela pessoa, no aparelho dela). */
export function registrarCobrancaEnviada(lancamentoId: string, usuarioId: string): void {
  atualizar((db) => {
    const l = db.lancamentos.find((x) => x.id === lancamentoId);
    if (!l || l.tipo !== 'receber') throw new ErroNegocio('Conta a receber não encontrada.');
    const registro = { em: agoraISO(), usuarioId, canal: 'whatsapp' as const };
    const cliente = l.contatoId ? db.contatos.find((c) => c.id === l.contatoId) : undefined;
    return comAtividade(
      {
        ...db,
        lancamentos: db.lancamentos.map((x) => (x.id === lancamentoId ? { ...x, cobrancasEnviadas: [...(x.cobrancasEnviadas ?? []), registro].slice(-20) } : x)),
      },
      usuarioId,
      'cobranca',
      `cobrou ${cliente ? cliente.fantasia || cliente.nome : 'o cliente'} pelo WhatsApp (“${l.descricao}”)`,
      { tipo: 'lancamento', id: l.id },
    );
  });
}

// ---------- Importação de planilha ----------

export interface OpcoesImportacaoPlanilha {
  /** conta prevista dos títulos e conta das linhas que já vêm pagas */
  contaId?: string;
  criarContatos: boolean;
  /** pula linhas iguais a contas já lançadas (mesmo tipo, valor, vencimento e descrição) */
  pularRepetidas: boolean;
}

export interface ResultadoPlanilha {
  criados: number;
  pagos: number;
  contatosNovos: number;
  repetidas: number;
  semCategoria: string[];
}

export function importarPlanilha(linhas: LinhaPlanilha[], opts: OpcoesImportacaoPlanilha, usuarioId: string): ResultadoPlanilha {
  const validas = linhas.filter((l) => l.erros.length === 0 && l.tipo && l.vencimento && l.valor > 0);
  if (validas.length === 0) throw new ErroNegocio('Nenhuma linha válida para importar.');
  if (validas.some((l) => l.pagoEm) && !opts.contaId) throw new ErroNegocio('Escolha a conta das linhas que já vêm pagas.');
  const ref = hoje();
  if (validas.some((l) => l.pagoEm && l.pagoEm > ref)) throw new ErroNegocio('Há linhas com data de pagamento no futuro.');
  const resultado: ResultadoPlanilha = { criados: 0, pagos: 0, contatosNovos: 0, repetidas: 0, semCategoria: [] };
  atualizar((inicial) => {
    let db = inicial;
    const existentes = new Set(db.lancamentos.filter((l) => !l.cancelado).map((l) => chaveTitulo(l.tipo, l.valor, l.vencimento, l.descricao)));
    const contatoPorNome = new Map<string, Contato>();
    for (const c of db.contatos) {
      if (c.anonimizadoEm) continue;
      if (c.fantasia) contatoPorNome.set(normalizarBusca(c.fantasia), c);
      contatoPorNome.set(normalizarBusca(c.nome), c);
    }
    const categoriaPor = (nome: string, tipo: 'pagar' | 'receber') =>
      db.categorias.find((c) => c.tipo === (tipo === 'pagar' ? 'despesa' : 'receita') && normalizarBusca(c.nome) === normalizarBusca(nome));
    const semCategoria = new Set<string>();
    const novos: Lancamento[] = [];
    const agora = agoraISO();
    let pagos = 0;
    let contatosNovos = 0;
    let repetidas = 0;
    for (const l of validas) {
      const tipo = l.tipo!;
      const vencimento = l.vencimento!;
      const chave = chaveTitulo(tipo, l.valor, vencimento, l.descricao);
      if (opts.pularRepetidas && existentes.has(chave)) {
        repetidas++;
        continue;
      }
      existentes.add(chave);
      let contato: Contato | undefined;
      if (l.contato) {
        const nome = normalizarBusca(l.contato);
        const tipoDesejado = tipo === 'pagar' ? 'fornecedor' : 'cliente';
        contato = contatoPorNome.get(nome);
        if (contato && contato.tipo !== tipoDesejado && contato.tipo !== 'ambos') {
          const atualizado: Contato = { ...contato, tipo: 'ambos' };
          db = { ...db, contatos: db.contatos.map((c) => (c.id === atualizado.id ? atualizado : c)) };
          contato = atualizado;
          contatoPorNome.set(nome, atualizado);
        } else if (!contato && opts.criarContatos) {
          contato = { id: uid('ctt_'), tipo: tipoDesejado, nome: l.contato, documento: '', criadoEm: agora };
          db = { ...db, contatos: [...db.contatos, contato] };
          contatoPorNome.set(nome, contato);
          contatosNovos++;
        }
      }
      const categoria = l.categoria ? categoriaPor(l.categoria, tipo) : undefined;
      if (l.categoria && !categoria) semCategoria.add(l.categoria);
      novos.push({
        id: uid('lan_'),
        tipo,
        descricao: l.descricao,
        contatoId: contato?.id,
        categoriaId: categoria?.id,
        contaId: opts.contaId,
        valor: l.valor,
        emissao: vencimento <= ref ? vencimento : ref,
        vencimento,
        competencia: mesChave(vencimento),
        documento: l.documento || undefined,
        observacoes: l.observacoes || undefined,
        baixa: l.pagoEm
          ? { data: l.pagoEm, valorPago: l.valor, juros: 0, desconto: 0, contaId: opts.contaId!, usuarioId, registradaEm: agora, observacao: 'Importado de planilha' }
          : undefined,
        criadoEm: agora,
        criadoPor: usuarioId,
      });
      if (l.pagoEm) pagos++;
    }
    // o resultado só é preenchido depois do laço (se uma regra falhar no meio, nada é gravado)
    resultado.criados = novos.length;
    resultado.pagos = pagos;
    resultado.contatosNovos = contatosNovos;
    resultado.repetidas = repetidas;
    resultado.semCategoria = [...semCategoria];
    if (!novos.length) return db;
    const aPagar = novos.filter((l) => l.tipo === 'pagar').length;
    return comAtividade(
      { ...db, lancamentos: [...db.lancamentos, ...novos] },
      usuarioId,
      'importacao',
      `importou ${plural(novos.length, 'conta', 'contas')} de uma planilha (${aPagar} a pagar, ${novos.length - aPagar} a receber${pagos ? `, ${pagos} já pagas` : ''})`,
    );
  });
  return resultado;
}

// ---------- Contatos ----------

export type NovoContato = Omit<Contato, 'id' | 'criadoEm'> & { id?: string };

export function salvarContato(c: NovoContato, usuarioId: string): Contato {
  if (!c.nome.trim()) throw new ErroNegocio('Informe o nome ou a razão social.');
  const documento = c.documento ? normalizarDocumento(c.documento) : '';
  const db = getDb();
  const duplicado = documento && db.contatos.find((x) => x.documento === documento && x.id !== c.id);
  if (duplicado) throw new ErroNegocio(`Já existe um contato com este documento: ${duplicado.nome}.`);
  let salvo: Contato;
  if (c.id) {
    const atual = db.contatos.find((x) => x.id === c.id);
    if (!atual) throw new ErroNegocio('Contato não encontrado.');
    salvo = { ...atual, ...c, documento, id: atual.id };
    atualizar((d) => comAtividade({ ...d, contatos: d.contatos.map((x) => (x.id === salvo.id ? salvo : x)) }, usuarioId, 'edicao', `atualizou o contato ${salvo.nome}`, { tipo: 'contato', id: salvo.id }));
  } else {
    salvo = { ...c, documento, id: uid('ctt_'), criadoEm: agoraISO() };
    atualizar((d) => comAtividade({ ...d, contatos: [...d.contatos, salvo] }, usuarioId, 'criacao', `cadastrou o contato ${salvo.nome}`, { tipo: 'contato', id: salvo.id }));
  }
  return salvo;
}

export function excluirContato(id: string, usuarioId: string): void {
  const db = getDb();
  const usados = db.lancamentos.filter((l) => l.contatoId === id).length;
  if (usados > 0) throw new ErroNegocio(`Este contato tem ${usados} lançamento(s). Para preservar o histórico, ele não pode ser excluído.`);
  const c = db.contatos.find((x) => x.id === id);
  atualizar((d) => comAtividade({ ...d, contatos: d.contatos.filter((x) => x.id !== id) }, usuarioId, 'exclusao', `excluiu o contato ${c?.nome ?? ''}`));
}

/**
 * Direito de eliminação/anonimização (LGPD art. 18, IV e VI) para um cliente ou fornecedor.
 * Os títulos e as notas continuam (guarda fiscal obrigatória, em regra 5 anos: LGPD art. 16, I),
 * mas o cadastro perde nome, documento e contatos, e o nome sai das descrições dos títulos.
 */
export function anonimizarContato(id: string, usuarioId: string): void {
  atualizar((db) => {
    const c = db.contatos.find((x) => x.id === id);
    if (!c) throw new ErroNegocio('Contato não encontrado.');
    if (c.anonimizadoEm) return db;
    const nomes = [c.nome, c.fantasia].filter((n): n is string => !!n && n.length >= 3).sort((a, b) => b.length - a.length);
    const limpar = (t: string) => nomes.reduce((acc, n) => acc.split(n).join('titular anonimizado'), t);
    const anon: Contato = {
      id: c.id,
      tipo: c.tipo,
      nome: 'Titular anonimizado',
      documento: '',
      criadoEm: c.criadoEm,
      anonimizadoEm: agoraISO(),
    };
    return comAtividade(
      {
        ...db,
        contatos: db.contatos.map((x) => (x.id === id ? anon : x)),
        lancamentos: db.lancamentos.map((l) => (l.contatoId === id ? { ...l, descricao: limpar(l.descricao), observacoes: l.observacoes ? limpar(l.observacoes) : l.observacoes } : l)),
      },
      usuarioId,
      'privacidade',
      'anonimizou os dados pessoais de um contato a pedido do titular',
    );
  });
}

// ---------- Notas fiscais ----------

export type Direcao = 'entrada' | 'saida' | 'terceiros';

export function direcaoDaNota(d: Pick<NFeDados, 'emitente' | 'destinatario'>, cnpjEmpresa: string): Direcao {
  const empresa = normalizarCnpj(cnpjEmpresa);
  if (normalizarDocumento(d.emitente.documento) === empresa) return 'saida';
  if (normalizarDocumento(d.destinatario.documento) === empresa) return 'entrada';
  return 'terceiros';
}

export interface ItemImportacao {
  dados: NFeDados;
  gerarTitulos: boolean;
  categoriaId?: string;
  contaId?: string;
  /** vencimento único quando a nota não tem duplicatas */
  vencimentoAVista?: ISODate;
}

function contatoParaNota(db: Database, d: NFeDados, direcao: 'entrada' | 'saida'): { db: Database; contato: Contato; novo: boolean } {
  const parte = direcao === 'entrada' ? d.emitente : d.destinatario;
  const documento = normalizarDocumento(parte.documento);
  const tipoDesejado = direcao === 'entrada' ? 'fornecedor' : 'cliente';
  const existente = documento ? db.contatos.find((c) => c.documento === documento) : undefined;
  if (existente) {
    if (existente.tipo !== tipoDesejado && existente.tipo !== 'ambos') {
      const atualizado = { ...existente, tipo: 'ambos' as const };
      return { db: { ...db, contatos: db.contatos.map((c) => (c.id === existente.id ? atualizado : c)) }, contato: atualizado, novo: false };
    }
    return { db, contato: existente, novo: false };
  }
  const novo: Contato = {
    id: uid('ctt_'),
    tipo: tipoDesejado,
    nome: parte.nome,
    fantasia: direcao === 'entrada' ? d.emitente.fantasia : undefined,
    documento,
    cidade: parte.municipio,
    uf: parte.uf,
    criadoEm: agoraISO(),
  };
  return { db: { ...db, contatos: [...db.contatos, novo] }, contato: novo, novo: true };
}

function titulosDaNota(
  nota: NotaFiscal,
  contato: Contato,
  opts: { categoriaId?: string; contaId?: string; vencimentoAVista?: ISODate; forma?: Lancamento['forma'] },
  usuarioId: string,
): Lancamento[] {
  const tipo = nota.direcao === 'entrada' ? 'pagar' : 'receber';
  const nomeOutro = contato.fantasia || contato.nome;
  const descricao = `${tipo === 'pagar' ? 'Mercadorias' : 'Venda'} · NF ${nota.numero} (${nomeOutro})`;
  const emissao = nota.emissao.slice(0, 10);
  const parcelas = nota.duplicatas.length
    ? nota.duplicatas
    : [{ numero: '001', vencimento: opts.vencimentoAVista ?? emissao, valor: nota.totais.nota }];
  const grupoId = uid('grp_');
  return parcelas.map((p, i) => ({
    id: uid('lan_'),
    tipo,
    descricao,
    contatoId: contato.id,
    categoriaId: opts.categoriaId,
    contaId: opts.contaId,
    valor: p.valor,
    emissao,
    vencimento: p.vencimento,
    competencia: mesChave(emissao),
    documento: `NF ${nota.numero} · ${i + 1}/${parcelas.length}`,
    parcela: parcelas.length > 1 ? { n: i + 1, de: parcelas.length } : undefined,
    grupoId: parcelas.length > 1 ? grupoId : undefined,
    forma: opts.forma ?? 'boleto',
    notaId: nota.id,
    criadoEm: agoraISO(),
    criadoPor: usuarioId,
  }));
}

export interface ResultadoImportacao {
  notas: NotaFiscal[];
  titulos: number;
  contatosNovos: number;
  ignoradas: string[];
}

export function importarNotas(itens: ItemImportacao[], usuarioId: string, origem: NotaFiscal['origem'] = 'xml'): ResultadoImportacao {
  const resultado: ResultadoImportacao = { notas: [], titulos: 0, contatosNovos: 0, ignoradas: [] };
  atualizar((inicial) => {
    let db = inicial;
    for (const item of itens) {
      const d = item.dados;
      if (db.notas.some((n) => n.chave === d.chave)) {
        resultado.ignoradas.push(`NF ${d.numero}: já importada`);
        continue;
      }
      const dir = direcaoDaNota(d, db.empresa.cnpj);
      const direcao = dir === 'saida' ? 'saida' : 'entrada';
      const r = contatoParaNota(db, d, direcao);
      db = r.db;
      if (r.novo) resultado.contatosNovos++;
      const nota: NotaFiscal = {
        id: uid('nfe_'),
        chave: d.chave,
        modelo: d.modelo,
        serie: d.serie,
        numero: d.numero,
        direcao,
        naturezaOperacao: d.naturezaOperacao,
        emissao: d.emissao,
        emitente: { documento: d.emitente.documento, nome: d.emitente.nome, fantasia: d.emitente.fantasia, uf: d.emitente.uf, municipio: d.emitente.municipio },
        destinatario: d.destinatario,
        itens: d.itens,
        totais: {
          produtos: d.totais.produtos,
          frete: d.totais.frete,
          desconto: d.totais.desconto,
          ipi: d.totais.ipi,
          icms: d.totais.icms,
          st: d.totais.st,
          pis: d.totais.pis,
          cofins: d.totais.cofins,
          outros: d.totais.outros + d.totais.seguro,
          nota: d.totais.nota,
        },
        duplicatas: d.duplicatas,
        situacao: d.situacao,
        protocolo: d.protocolo?.numero,
        origem,
        contatoId: r.contato.id,
        importadaEm: agoraISO(),
        importadaPor: usuarioId,
      };
      const titulos = item.gerarTitulos && nota.situacao === 'autorizada' ? titulosDaNota(nota, r.contato, item, usuarioId) : [];
      db = { ...db, notas: [...db.notas, nota], lancamentos: [...db.lancamentos, ...titulos] };
      resultado.notas.push(nota);
      resultado.titulos += titulos.length;
    }
    if (resultado.notas.length === 0) return db;
    const texto =
      resultado.notas.length === 1
        ? `importou a NF ${resultado.notas[0].numero}${resultado.titulos ? ` e lançou ${resultado.titulos} título(s)` : ''}`
        : `importou ${resultado.notas.length} notas e lançou ${resultado.titulos} título(s)`;
    return comAtividade(db, usuarioId, 'importacao', texto, { tipo: 'nota', id: resultado.notas[0].id });
  });
  return resultado;
}

export function gerarTitulosDeNota(notaId: string, opts: { categoriaId?: string; contaId?: string; vencimentoAVista?: ISODate }, usuarioId: string): number {
  let qtd = 0;
  atualizar((db) => {
    const nota = db.notas.find((n) => n.id === notaId);
    if (!nota) throw new ErroNegocio('Nota não encontrada.');
    if (db.lancamentos.some((l) => l.notaId === notaId)) throw new ErroNegocio('Esta nota já tem títulos lançados.');
    const contato = db.contatos.find((c) => c.id === nota.contatoId);
    if (!contato) throw new ErroNegocio('O contato da nota não foi encontrado.');
    const titulos = titulosDaNota(nota, contato, opts, usuarioId);
    qtd = titulos.length;
    return comAtividade(
      { ...db, lancamentos: [...db.lancamentos, ...titulos] },
      usuarioId,
      'criacao',
      `lançou ${titulos.length} título(s) da NF ${nota.numero}`,
      { tipo: 'nota', id: nota.id },
    );
  });
  return qtd;
}

export function excluirNota(notaId: string, usuarioId: string): void {
  atualizar((db) => {
    const nota = db.notas.find((n) => n.id === notaId);
    if (!nota) return db;
    const titulos = db.lancamentos.filter((l) => l.notaId === notaId);
    if (titulos.some((l) => l.baixa)) throw new ErroNegocio('Há títulos desta nota já pagos/recebidos. Estorne as baixas antes.');
    return comAtividade(
      {
        ...db,
        notas: db.notas.filter((n) => n.id !== notaId),
        lancamentos: db.lancamentos.filter((l) => l.notaId !== notaId),
        sefaz: db.sefaz.map((s) => (s.notaId === notaId ? { ...s, notaId: undefined, manifestacao: 'pendente' } : s)),
      },
      usuarioId,
      'exclusao',
      `excluiu a NF ${nota.numero} e ${titulos.length} título(s) vinculados`,
    );
  });
}

// ---------- SEFAZ (manifestação do destinatário, simulada na V1) ----------

export function registrarManifestacao(resumoId: string, evento: Manifestacao, usuarioId: string): void {
  const nomes: Record<Manifestacao, string> = {
    pendente: 'pendente',
    ciencia: 'deu ciência da operação',
    confirmada: 'confirmou a operação',
    desconhecida: 'registrou desconhecimento da operação',
    nao_realizada: 'registrou operação não realizada',
  };
  atualizar((db) => {
    const r = db.sefaz.find((s) => s.id === resumoId);
    if (!r) throw new ErroNegocio('Documento não encontrado.');
    return comAtividade(
      { ...db, sefaz: db.sefaz.map((s) => (s.id === resumoId ? { ...s, manifestacao: evento } : s)) },
      usuarioId,
      'sefaz',
      `${nomes[evento]} na NF de ${r.emitenteNome}`,
    );
  });
}

export function vincularResumoANota(resumoId: string, notaId: string): void {
  atualizar((db) => ({ ...db, sefaz: db.sefaz.map((s) => (s.id === resumoId ? { ...s, notaId } : s)) }));
}

export function marcarSincronizacao(): void {
  atualizar((db) => ({ ...db, configSefaz: { ...db.configSefaz, ultimaSincronizacao: agoraISO() } }));
}

// ---------- Usuários (com regras de LGPD e segurança) ----------

export interface DadosUsuario {
  id?: string;
  nome: string;
  email: string;
  login: string;
  cargo?: string;
  telefone?: string;
  papel: Usuario['papel'];
  /** módulos que a pessoa enxerga (obrigatório para Equipe e Consulta; administrador vê todos) */
  modulos?: Modulo[];
  ativo: boolean;
  senha?: string;
}

const TODOS_MODULOS: Modulo[] = ['comercial', 'faturamento', 'financeiro'];

function modulosValidos(dados: DadosUsuario): Modulo[] | undefined {
  if (dados.papel === 'admin') return undefined;
  const escolhidos = TODOS_MODULOS.filter((m) => dados.modulos?.includes(m));
  if (!escolhidos.length) throw new ErroNegocio('Marque pelo menos um módulo para esta pessoa.');
  return escolhidos;
}

function novaSenha(senha: string, contexto: { login: string; nome: string; email: string }) {
  const av = avaliarSenha(senha, contexto);
  if (!av.ok) throw new ErroNegocio(av.problemas[0]);
  const sal = gerarSal();
  return { senhaSal: sal, senhaHash: hashSenha(senha, sal, ITERACOES_SENHA), senhaIteracoes: ITERACOES_SENHA };
}

export function conferirSenha(u: Usuario, senha: string): boolean {
  return iguais(hashSenha(senha, u.senhaSal, u.senhaIteracoes ?? ITERACOES_LEGADO), u.senhaHash);
}

export function salvarUsuario(dados: DadosUsuario, quemFaz: string): Usuario {
  const db = getDb();
  const login = dados.login.trim().toLowerCase();
  const email = dados.email.trim().toLowerCase();
  const nome = dados.nome.trim();
  if (!nome) throw new ErroNegocio('Informe o nome.');
  if (!/^[a-z0-9._-]{3,}$/.test(login)) throw new ErroNegocio('O login precisa ter 3+ caracteres: letras, números, ponto, hífen ou sublinhado.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroNegocio('E-mail inválido.');
  if (db.usuarios.some((u) => u.id !== dados.id && u.login === login)) throw new ErroNegocio('Este login já está em uso.');
  if (db.usuarios.some((u) => u.id !== dados.id && u.email === email)) throw new ErroNegocio('Este e-mail já está em uso.');
  const modulos = modulosValidos(dados);

  if (dados.id) {
    const atual = db.usuarios.find((u) => u.id === dados.id);
    if (!atual) throw new ErroNegocio('Usuário não encontrado.');
    const restariaAdmin = db.usuarios.some((u) => u.id !== atual.id && u.papel === 'admin' && u.ativo) || (dados.papel === 'admin' && dados.ativo);
    if (!restariaAdmin) throw new ErroNegocio('O sistema precisa de pelo menos um administrador ativo.');
    let atualizado: Usuario = { ...atual, nome, email, login, cargo: dados.cargo, telefone: dados.telefone, papel: dados.papel, modulos, ativo: dados.ativo };
    // senha redefinida por outra pessoa é provisória: a pessoa troca no próximo login
    if (dados.senha) atualizado = { ...atualizado, ...novaSenha(dados.senha, { login, nome, email }), trocarSenha: atual.id !== quemFaz };
    const texto = `atualizou o usuário ${atualizado.nome}${dados.senha ? ' (senha redefinida)' : ''}`;
    atualizar((d) => comAtividade({ ...d, usuarios: d.usuarios.map((u) => (u.id === atualizado.id ? atualizado : u)) }, quemFaz, 'usuario', texto, { tipo: 'usuario', id: atualizado.id }));
    return atualizado;
  }

  if (!dados.senha) throw new ErroNegocio('Defina uma senha inicial.');
  const novo: Usuario = {
    id: uid('usr_'),
    nome,
    email,
    login,
    cargo: dados.cargo,
    telefone: dados.telefone,
    papel: dados.papel,
    modulos,
    ativo: dados.ativo,
    ...novaSenha(dados.senha, { login, nome, email }),
    trocarSenha: true,
    criadoEm: agoraISO(),
    criadoPor: quemFaz,
  };
  atualizar((d) => comAtividade({ ...d, usuarios: [...d.usuarios, novo] }, quemFaz, 'usuario', `cadastrou o usuário ${novo.nome}`, { tipo: 'usuario', id: novo.id }));
  return novo;
}

/**
 * Exclusão de usuário conforme a LGPD: os dados pessoais são apagados de verdade e o nome
 * some também da trilha de atividades. O que a pessoa lançou continua no histórico financeiro
 * (obrigação legal de guarda), aparecendo como "Usuário removido".
 */
function apagarUsuario(db: Database, id: string): Database {
  const alvo = db.usuarios.find((u) => u.id === id);
  if (!alvo) return db;
  const primeiro = alvo.nome.split(' ')[0];
  return {
    ...db,
    usuarios: db.usuarios.filter((u) => u.id !== id),
    atividades: db.atividades.map((a) => {
      let texto = a.usuarioId === id && a.texto.startsWith(primeiro) ? `Usuário removido${a.texto.slice(primeiro.length)}` : a.texto;
      texto = texto.split(alvo.nome).join('usuário removido');
      return texto === a.texto ? a : { ...a, texto };
    }),
  };
}

export function excluirUsuario(id: string, quemFaz: string): void {
  if (id === quemFaz) throw new ErroNegocio('Para excluir a própria conta, use Configurações → Privacidade.');
  const db = getDb();
  const alvo = db.usuarios.find((u) => u.id === id);
  if (!alvo) return;
  if (alvo.papel === 'admin' && !db.usuarios.some((u) => u.id !== id && u.papel === 'admin' && u.ativo)) {
    throw new ErroNegocio('Não dá para excluir o último administrador.');
  }
  atualizar((d) => comAtividade(apagarUsuario(d, id), quemFaz, 'privacidade', 'excluiu um usuário e apagou os dados pessoais dele'));
}

/** Direito de eliminação (LGPD art. 18, VI): a própria pessoa apaga a conta, confirmando a senha. */
export function excluirMinhaConta(usuarioId: string, senha: string): void {
  const db = getDb();
  const u = db.usuarios.find((x) => x.id === usuarioId);
  if (!u) throw new ErroNegocio('Usuário não encontrado.');
  if (!conferirSenha(u, senha)) throw new ErroNegocio('Senha incorreta.');
  if (u.papel === 'admin' && !db.usuarios.some((x) => x.id !== usuarioId && x.papel === 'admin' && x.ativo)) {
    throw new ErroNegocio('Você é o único administrador. Promova outra pessoa a administrador antes de excluir a sua conta.');
  }
  atualizar((d) => {
    const limpo = apagarUsuario(d, usuarioId);
    const a: Atividade = { id: uid('atv_'), em: agoraISO(), usuarioId, tipo: 'privacidade', texto: 'Um usuário excluiu a própria conta (dados pessoais apagados)' };
    return { ...limpo, atividades: [a, ...limpo.atividades] };
  });
}

/** Direito de correção (art. 18, III): a pessoa atualiza os próprios dados. */
export function editarMeuPerfil(usuarioId: string, dados: { nome: string; email: string; telefone?: string; cargo?: string }): void {
  const u = getDb().usuarios.find((x) => x.id === usuarioId);
  if (!u) throw new ErroNegocio('Usuário não encontrado.');
  salvarUsuario({ id: u.id, login: u.login, papel: u.papel, modulos: u.modulos, ativo: u.ativo, nome: dados.nome, email: dados.email, telefone: dados.telefone, cargo: dados.cargo }, usuarioId);
}

/** Direitos de acesso e portabilidade (art. 18, II e V): tudo o que o sistema guarda sobre a pessoa. */
export function exportarMeusDados(usuarioId: string): string {
  const db = getDb();
  const u = db.usuarios.find((x) => x.id === usuarioId);
  if (!u) throw new ErroNegocio('Usuário não encontrado.');
  const { senhaHash: _h, senhaSal: _s, ...perfil } = u;
  void _h;
  void _s;
  const dados = {
    geradoEm: agoraISO(),
    sistema: 'Prumo',
    controlador: { razaoSocial: db.empresa.razaoSocial, cnpj: db.empresa.cnpj },
    perfil: { ...perfil, senha: 'guardada apenas como hash irreversível (não exportada)' },
    atividades: db.atividades.filter((a) => a.usuarioId === usuarioId).map(({ em, tipo, texto }) => ({ em, tipo, texto })),
    lancamentosCriados: db.lancamentos.filter((l) => l.criadoPor === usuarioId).length,
    baixasRegistradas: db.lancamentos.filter((l) => l.baixa?.usuarioId === usuarioId).length,
    notasImportadas: db.notas.filter((n) => n.importadaPor === usuarioId).length,
    ondeFicam: 'Neste navegador, neste aparelho (localStorage). Nada é enviado a servidores do Prumo na V1.',
  };
  atualizar((d) => comAtividade(d, usuarioId, 'privacidade', 'exportou os próprios dados pessoais'));
  return JSON.stringify(dados, null, 2);
}

export function registrarAceitePrivacidade(usuarioId: string): void {
  atualizar((db) => ({ ...db, usuarios: db.usuarios.map((u) => (u.id === usuarioId ? { ...u, aceitouPrivacidadeEm: agoraISO() } : u)) }));
}

export function registrarEventoSeguranca(usuarioId: string, texto: string): void {
  atualizar((db) => comAtividade(db, usuarioId, 'seguranca', texto));
}

/** Login ok: registra acesso e, se a senha ainda usa o hash antigo, refaz com o padrão atual. */
export function registrarAcesso(usuarioId: string, senhaDigitada?: string): void {
  atualizar((db) => {
    const usuarios = db.usuarios.map((u) => {
      if (u.id !== usuarioId) return u;
      const base = { ...u, ultimoAcesso: agoraISO() };
      if (senhaDigitada && (u.senhaIteracoes ?? ITERACOES_LEGADO) < ITERACOES_SENHA) {
        const sal = gerarSal();
        return { ...base, senhaSal: sal, senhaHash: hashSenha(senhaDigitada, sal, ITERACOES_SENHA), senhaIteracoes: ITERACOES_SENHA };
      }
      return base;
    });
    return comAtividade({ ...db, usuarios }, usuarioId, 'seguranca', 'entrou no sistema');
  });
}

export function trocarPropriaSenha(usuarioId: string, atual: string, nova: string): void {
  const u = getDb().usuarios.find((x) => x.id === usuarioId);
  if (!u) throw new ErroNegocio('Usuário não encontrado.');
  if (!conferirSenha(u, atual)) throw new ErroNegocio('A senha atual não confere.');
  if (atual === nova) throw new ErroNegocio('A nova senha precisa ser diferente da atual.');
  const s = novaSenha(nova, { login: u.login, nome: u.nome, email: u.email });
  atualizar((d) =>
    comAtividade({ ...d, usuarios: d.usuarios.map((x) => (x.id === usuarioId ? { ...x, ...s, trocarSenha: false } : x)) }, usuarioId, 'seguranca', 'trocou a própria senha'),
  );
}

// ---------- Empresa, contas e categorias ----------

export function salvarEmpresa(empresa: Empresa, usuarioId: string): void {
  if (!empresa.razaoSocial.trim()) throw new ErroNegocio('Informe a razão social.');
  // o limite de aprovação tem ação própria (só administrador): aqui ele é preservado
  atualizar((db) =>
    comAtividade({ ...db, empresa: { ...empresa, cnpj: normalizarCnpj(empresa.cnpj), limiteAprovacao: db.empresa.limiteAprovacao } }, usuarioId, 'config', 'atualizou os dados da empresa'),
  );
}

export function salvarContaBancaria(conta: Omit<ContaBancaria, 'id'> & { id?: string }, usuarioId: string): void {
  if (!conta.nome.trim()) throw new ErroNegocio('Dê um nome para a conta.');
  atualizar((db) => {
    if (conta.id) {
      return comAtividade({ ...db, contas: db.contas.map((c) => (c.id === conta.id ? { ...c, ...conta, id: c.id } : c)) }, usuarioId, 'config', `atualizou a conta ${conta.nome}`);
    }
    return comAtividade({ ...db, contas: [...db.contas, { ...conta, id: uid('cta_') }] }, usuarioId, 'config', `cadastrou a conta ${conta.nome}`);
  });
}

export function salvarCategoria(c: Omit<Categoria, 'id'> & { id?: string }, usuarioId: string): void {
  if (!c.nome.trim()) throw new ErroNegocio('Dê um nome para a categoria.');
  atualizar((db) => {
    if (c.id) return comAtividade({ ...db, categorias: db.categorias.map((x) => (x.id === c.id ? { ...x, ...c, id: x.id } : x)) }, usuarioId, 'config', `renomeou a categoria ${c.nome}`);
    return comAtividade({ ...db, categorias: [...db.categorias, { ...c, id: uid('cat_') }] }, usuarioId, 'config', `criou a categoria ${c.nome}`);
  });
}

/** Marca uma categoria de despesa como retirada dos sócios (fica fora das despesas no DRE). */
export function definirRetirada(id: string, retirada: boolean, usuarioId: string): void {
  atualizar((db) => {
    const c = db.categorias.find((x) => x.id === id);
    if (!c) throw new ErroNegocio('Categoria não encontrada.');
    if (c.tipo !== 'despesa') throw new ErroNegocio('Só categorias de despesa podem ser retirada dos sócios.');
    if (!!c.retirada === retirada) return db;
    return comAtividade(
      { ...db, categorias: db.categorias.map((x) => (x.id === id ? { ...x, retirada: retirada || undefined } : x)) },
      usuarioId,
      'config',
      retirada ? `marcou “${c.nome}” como retirada dos sócios` : `desmarcou “${c.nome}” como retirada dos sócios`,
    );
  });
}

export function excluirCategoria(id: string, usuarioId: string): void {
  const db = getDb();
  if (db.lancamentos.some((l) => l.categoriaId === id)) throw new ErroNegocio('Há lançamentos nesta categoria. Recategorize-os antes de excluir.');
  const c = db.categorias.find((x) => x.id === id);
  atualizar((d) => comAtividade({ ...d, categorias: d.categorias.filter((x) => x.id !== id) }, usuarioId, 'config', `excluiu a categoria ${c?.nome ?? ''}`));
}

/**
 * Começar a usar de verdade: apaga lançamentos, notas, contatos e a caixa SEFAZ de demonstração.
 * Mantém usuários, empresa, categorias e contas bancárias (com saldo inicial zerado em hoje).
 */
export function zerarDados(usuarioId: string): void {
  atualizar((db) =>
    comAtividade(
      {
        ...db,
        demo: false,
        lancamentos: [],
        notas: [],
        contatos: [],
        sefaz: [],
        atividades: [],
        vendas: [],
        produtos: [],
        contas: db.contas.map((c) => ({ ...c, saldoInicial: 0, saldoInicialEm: hoje() })),
      },
      usuarioId,
      'config',
      'zerou os dados de demonstração e começou do zero',
    ),
  );
}


// ---------- Faturamento: produtos, orçamento → pedido → nota ----------

export type NovoProduto = Omit<Produto, 'id' | 'criadoEm'> & { id?: string };

export function salvarProduto(p: NovoProduto, usuarioId: string): Produto {
  if (!p.nome.trim()) throw new ErroNegocio('Informe o nome.');
  if (!(p.preco > 0)) throw new ErroNegocio('Informe o preço de venda.');
  if (!p.unidade.trim()) throw new ErroNegocio('Informe a unidade (UN, SC, M, H…).');
  if (p.tipo === 'produto' && p.ncm && !/^\d{8}$/.test(p.ncm)) throw new ErroNegocio('O NCM tem 8 números.');
  if (p.tipo === 'servico' && p.codigoServico && !/^\d{1,2}\.\d{2}$/.test(p.codigoServico)) throw new ErroNegocio('Código de serviço no formato 14.01.');
  const db = getDb();
  const codigo = p.codigo.trim().toUpperCase() || `P${String(db.produtos.length + 1).padStart(4, '0')}`;
  if (db.produtos.some((x) => x.codigo === codigo && x.id !== p.id)) throw new ErroNegocio(`Já existe um item com o código ${codigo}.`);
  const salvo: Produto = p.id
    ? { ...(db.produtos.find((x) => x.id === p.id) as Produto), ...p, codigo, id: p.id }
    : { ...p, codigo, id: uid('prd_'), criadoEm: agoraISO() };
  atualizar((d) =>
    comAtividade(
      { ...d, produtos: p.id ? d.produtos.map((x) => (x.id === p.id ? salvo : x)) : [...d.produtos, salvo] },
      usuarioId,
      p.id ? 'edicao' : 'criacao',
      `${p.id ? 'atualizou' : 'cadastrou'} o ${p.tipo === 'servico' ? 'serviço' : 'produto'} ${salvo.nome}`,
    ),
  );
  return salvo;
}

export type NovaVenda = Pick<Venda, 'contatoId' | 'itens' | 'desconto' | 'frete' | 'condicao' | 'validade' | 'observacoes'> & { id?: string };

function validarVenda(v: NovaVenda) {
  if (!v.contatoId) throw new ErroNegocio('Escolha o cliente.');
  if (v.itens.length === 0) throw new ErroNegocio('Inclua pelo menos um item.');
  if (v.itens.some((i) => !(i.quantidade > 0) || !(i.precoUnitario > 0))) throw new ErroNegocio('Quantidade e preço precisam ser maiores que zero.');
}

export function salvarOrcamento(v: NovaVenda, usuarioId: string): Venda {
  validarVenda(v);
  const db = getDb();
  const itens = v.itens.map((i) => ({ ...i, total: Math.round(i.quantidade * i.precoUnitario) }));
  if (totaisDaVenda({ itens, desconto: v.desconto, frete: v.frete }).total <= 0) throw new ErroNegocio('O total precisa ser maior que zero.');
  if (v.id) {
    const atual = db.vendas.find((x) => x.id === v.id);
    if (!atual) throw new ErroNegocio('Orçamento não encontrado.');
    if (atual.etapa !== 'orcamento') throw new ErroNegocio('Só dá para editar enquanto é orçamento.');
    const salvo: Venda = { ...atual, ...v, itens, id: atual.id };
    atualizar((d) => comAtividade({ ...d, vendas: d.vendas.map((x) => (x.id === salvo.id ? salvo : x)) }, usuarioId, 'venda', `editou o orçamento nº ${salvo.numero}`, { tipo: 'venda', id: salvo.id }));
    return salvo;
  }
  const numero = Math.max(1000, ...db.vendas.map((x) => x.numero)) + 1;
  const nova: Venda = { ...v, itens, id: uid('vnd_'), numero, etapa: 'orcamento', criadoEm: agoraISO(), criadoPor: usuarioId };
  atualizar((d) => comAtividade({ ...d, vendas: [...d.vendas, nova] }, usuarioId, 'venda', `fez o orçamento nº ${numero} (${moeda(totaisDaVenda(nova).total)})`, { tipo: 'venda', id: nova.id }));
  return nova;
}

/** Cliente aprovou: o orçamento vira pedido (mesmo número). */
export function aprovarOrcamento(id: string, usuarioId: string): void {
  atualizar((db) => {
    const v = db.vendas.find((x) => x.id === id);
    if (!v || v.etapa !== 'orcamento') throw new ErroNegocio('Este orçamento não pode mais ser aprovado.');
    return comAtividade(
      { ...db, vendas: db.vendas.map((x) => (x.id === id ? { ...x, etapa: 'pedido' as const, aprovadoEm: agoraISO(), pedidoNumero: x.numero } : x)) },
      usuarioId,
      'venda',
      `aprovou o orçamento nº ${v.numero}, que virou pedido`,
      { tipo: 'venda', id },
    );
  });
}

export function recusarOrcamento(id: string, usuarioId: string): void {
  atualizar((db) => {
    const v = db.vendas.find((x) => x.id === id);
    if (!v || v.etapa !== 'orcamento') throw new ErroNegocio('Só orçamentos podem ser recusados.');
    return comAtividade({ ...db, vendas: db.vendas.map((x) => (x.id === id ? { ...x, etapa: 'recusada' as const } : x)) }, usuarioId, 'venda', `marcou o orçamento nº ${v.numero} como recusado`, { tipo: 'venda', id });
  });
}

/** Emite a NF-e do pedido (simulada na demonstração) e gera as contas a receber pelas parcelas. */
export function emitirNotaDoPedido(id: string, usuarioId: string): NotaFiscal {
  const db = getDb();
  const v = db.vendas.find((x) => x.id === id);
  if (!v || v.etapa !== 'pedido') throw new ErroNegocio('Só um pedido aprovado pode virar nota.');
  const contato = db.contatos.find((c) => c.id === v.contatoId);
  if (!contato) throw new ErroNegocio('Cliente não encontrado.');
  if (!contato.documento) throw new ErroNegocio('O cliente precisa ter CPF ou CNPJ para receber nota fiscal.');
  const nota = fiscal.emitirNFe(db, v, contato, usuarioId);
  const categoria = db.categorias.find((c) => c.nome === 'Venda de mercadorias')?.id;
  const titulos = titulosDaNota(nota, contato, { categoriaId: categoria, vencimentoAVista: nota.emissao.slice(0, 10), forma: v.condicao.forma }, usuarioId);
  atualizar((d) =>
    comAtividade(
      {
        ...d,
        notas: [...d.notas, nota],
        lancamentos: [...d.lancamentos, ...titulos],
        vendas: d.vendas.map((x) => (x.id === id ? { ...x, etapa: 'faturada' as const, faturadoEm: agoraISO(), notaId: nota.id } : x)),
      },
      usuarioId,
      'venda',
      `emitiu a NF ${nota.numero} do pedido nº ${v.numero} e lançou ${plural(titulos.length, 'conta', 'contas')} a receber`,
      { tipo: 'nota', id: nota.id },
    ),
  );
  return nota;
}

// ---------- Cobrança (boleto com PIX) ----------

function hashTexto(t: string): number {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return h;
}

/** Gera boleto + PIX para uma conta a receber (simulado: nada sai do sistema). */
export function gerarCobranca(lancamentoId: string, usuarioId: string): Cobranca {
  const db = getDb();
  const l = db.lancamentos.find((x) => x.id === lancamentoId);
  if (!l || l.tipo !== 'receber') throw new ErroNegocio('Cobrança só para contas a receber.');
  if (l.baixa || l.cancelado) throw new ErroNegocio('Esta conta já foi recebida ou cancelada.');
  if (l.cobranca) return l.cobranca;
  const nosso = String(Math.abs(hashTexto(l.id)) % 1e10).padStart(10, '0');
  const vencimento = l.vencimento < hoje() ? hoje() : l.vencimento;
  const linha = gerarLinhaDigitavel('999', vencimento, l.valor, `1${nosso}${'0'.repeat(14)}`);
  const cobranca: Cobranca = {
    linhaDigitavel: linha,
    codigoBarras: lerBoleto(linha, hoje())?.codigoBarras ?? '',
    pixCopiaECola: pixCopiaECola({
      chave: 'demonstracao@prumo.app',
      nome: db.empresa.nomeFantasia || db.empresa.razaoSocial,
      cidade: db.empresa.municipio || 'BRASIL',
      valor: l.valor,
      txid: `PRUMO${nosso}`,
    }),
    nossoNumero: nosso,
    geradaEm: agoraISO(),
    simulada: true,
  };
  atualizar((d) =>
    comAtividade(
      { ...d, lancamentos: d.lancamentos.map((x) => (x.id === lancamentoId ? { ...x, cobranca } : x)) },
      usuarioId,
      'cobranca',
      `gerou boleto/PIX de “${l.descricao}” (${moeda(l.valor)})`,
      { tipo: 'lancamento', id: lancamentoId },
    ),
  );
  return cobranca;
}

/** Simula o aviso do banco de que o cliente pagou: dá a baixa sozinha (como o webhook fará no SaaS). */
export function simularPagamento(lancamentoId: string, como: 'pix' | 'boleto', usuarioId: string): void {
  const db = getDb();
  const l = db.lancamentos.find((x) => x.id === lancamentoId);
  if (!l?.cobranca) throw new ErroNegocio('Gere a cobrança antes de simular o pagamento.');
  const contaId = l.contaId ?? db.contas.find((c) => c.ativa)?.id;
  if (!contaId) throw new ErroNegocio('Cadastre uma conta bancária.');
  darBaixa([l.id], { data: hoje(), contaId, observacao: `Recebido por ${como === 'pix' ? 'PIX' : 'boleto'} (simulação de pagamento)` }, usuarioId);
  atualizar((d) =>
    comAtividade(
      { ...d, lancamentos: d.lancamentos.map((x) => (x.id === l.id && x.cobranca ? { ...x, cobranca: { ...x.cobranca, pagaEm: agoraISO(), pagaPor: como } } : x)) },
      usuarioId,
      'cobranca',
      `recebeu por ${como === 'pix' ? 'PIX' : 'boleto'} “${l.descricao}” (baixa automática, simulação)`,
      { tipo: 'lancamento', id: l.id },
    ),
  );
}
