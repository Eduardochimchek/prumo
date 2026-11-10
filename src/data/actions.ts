// Escritas (casos de uso). Cada função recebe o usuário que executa a ação, valida regras de
// negócio, grava via `atualizar()` e registra a atividade (trilha de auditoria).

import { agoraISO, hoje, mesChave, type ISODate } from '../lib/dates';
import { moeda } from '../lib/format';
import { normalizarCnpj, normalizarDocumento } from '../lib/br';
import { gerarSal, hashSenha } from '../lib/sha256';
import { uid } from '../lib/util';
import type { NFeDados } from '../lib/nfe/parser';
import { atualizar, getDb } from './store';
import type {
  Atividade,
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
    const novo = { ...atual, ...patch, atualizadoEm: agoraISO() };
    return comAtividade(
      { ...db, lancamentos: db.lancamentos.map((l) => (l.id === id ? novo : l)) },
      usuarioId,
      'edicao',
      `editou “${novo.descricao}”`,
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
  observacao?: string;
}

export function darBaixa(ids: string[], dados: DadosBaixa, usuarioId: string): void {
  if (!dados.contaId) throw new ErroNegocio('Escolha a conta bancária.');
  if (!dados.data) throw new ErroNegocio('Informe a data do pagamento.');
  atualizar((db) => {
    const alvo = db.lancamentos.filter((l) => ids.includes(l.id) && !l.baixa && !l.cancelado);
    if (alvo.length === 0) throw new ErroNegocio('Nenhum título em aberto selecionado.');
    const individual = alvo.length === 1;
    const baixas = new Map<string, Baixa>(
      alvo.map((l) => {
        const juros = individual ? dados.juros ?? 0 : 0;
        const desconto = individual ? dados.desconto ?? 0 : 0;
        return [
          l.id,
          {
            data: dados.data,
            valorPago: individual && dados.valorPago ? dados.valorPago : l.valor + juros - desconto,
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
    const texto = individual ? `${verbo} “${alvo[0].descricao}”` : `${verbo} ${alvo.length} títulos (${moeda(total)})`;
    return comAtividade(
      { ...db, lancamentos: db.lancamentos.map((l) => (baixas.has(l.id) ? { ...l, baixa: baixas.get(l.id) } : l)) },
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

function titulosDaNota(nota: NotaFiscal, contato: Contato, opts: { categoriaId?: string; contaId?: string; vencimentoAVista?: ISODate }, usuarioId: string): Lancamento[] {
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
    forma: 'boleto',
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

// ---------- SEFAZ (manifestação do destinatário — simulada na V1) ----------

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

// ---------- Usuários ----------

export interface DadosUsuario {
  id?: string;
  nome: string;
  email: string;
  login: string;
  cargo?: string;
  telefone?: string;
  papel: Usuario['papel'];
  ativo: boolean;
  senha?: string;
}

export function salvarUsuario(dados: DadosUsuario, quemFaz: string): Usuario {
  const db = getDb();
  const login = dados.login.trim().toLowerCase();
  const email = dados.email.trim().toLowerCase();
  if (!dados.nome.trim()) throw new ErroNegocio('Informe o nome.');
  if (!/^[a-z0-9._-]{3,}$/.test(login)) throw new ErroNegocio('O login precisa ter 3+ caracteres: letras, números, ponto, hífen ou sublinhado.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroNegocio('E-mail inválido.');
  if (db.usuarios.some((u) => u.id !== dados.id && u.login === login)) throw new ErroNegocio('Este login já está em uso.');
  if (db.usuarios.some((u) => u.id !== dados.id && u.email === email)) throw new ErroNegocio('Este e-mail já está em uso.');

  if (dados.id) {
    const atual = db.usuarios.find((u) => u.id === dados.id);
    if (!atual) throw new ErroNegocio('Usuário não encontrado.');
    const restariaAdmin = db.usuarios.some((u) => u.id !== atual.id && u.papel === 'admin' && u.ativo) || (dados.papel === 'admin' && dados.ativo);
    if (!restariaAdmin) throw new ErroNegocio('O sistema precisa de pelo menos um administrador ativo.');
    let atualizado: Usuario = { ...atual, nome: dados.nome.trim(), email, login, cargo: dados.cargo, telefone: dados.telefone, papel: dados.papel, ativo: dados.ativo };
    if (dados.senha) {
      if (dados.senha.length < 6) throw new ErroNegocio('A senha precisa ter pelo menos 6 caracteres.');
      const sal = gerarSal();
      atualizado = { ...atualizado, senhaSal: sal, senhaHash: hashSenha(dados.senha, sal) };
    }
    atualizar((d) => comAtividade({ ...d, usuarios: d.usuarios.map((u) => (u.id === atualizado.id ? atualizado : u)) }, quemFaz, 'usuario', `atualizou o usuário ${atualizado.nome}`, { tipo: 'usuario', id: atualizado.id }));
    return atualizado;
  }

  if (!dados.senha || dados.senha.length < 6) throw new ErroNegocio('A senha inicial precisa ter pelo menos 6 caracteres.');
  const sal = gerarSal();
  const novo: Usuario = {
    id: uid('usr_'),
    nome: dados.nome.trim(),
    email,
    login,
    cargo: dados.cargo,
    telefone: dados.telefone,
    papel: dados.papel,
    ativo: dados.ativo,
    senhaSal: sal,
    senhaHash: hashSenha(dados.senha, sal),
    criadoEm: agoraISO(),
    criadoPor: quemFaz,
  };
  atualizar((d) => comAtividade({ ...d, usuarios: [...d.usuarios, novo] }, quemFaz, 'usuario', `cadastrou o usuário ${novo.nome}`, { tipo: 'usuario', id: novo.id }));
  return novo;
}

export function excluirUsuario(id: string, quemFaz: string): void {
  if (id === quemFaz) throw new ErroNegocio('Você não pode excluir o próprio usuário.');
  const db = getDb();
  const alvo = db.usuarios.find((u) => u.id === id);
  if (!alvo) return;
  if (alvo.papel === 'admin' && !db.usuarios.some((u) => u.id !== id && u.papel === 'admin' && u.ativo)) {
    throw new ErroNegocio('Não dá para excluir o último administrador.');
  }
  atualizar((d) => comAtividade({ ...d, usuarios: d.usuarios.filter((u) => u.id !== id) }, quemFaz, 'usuario', `excluiu o usuário ${alvo.nome}`));
}

export function registrarAcesso(usuarioId: string): void {
  atualizar((db) => ({ ...db, usuarios: db.usuarios.map((u) => (u.id === usuarioId ? { ...u, ultimoAcesso: agoraISO() } : u)) }));
}

export function trocarPropriaSenha(usuarioId: string, atual: string, nova: string): void {
  const db = getDb();
  const u = db.usuarios.find((x) => x.id === usuarioId);
  if (!u) throw new ErroNegocio('Usuário não encontrado.');
  if (hashSenha(atual, u.senhaSal) !== u.senhaHash) throw new ErroNegocio('A senha atual não confere.');
  if (nova.length < 6) throw new ErroNegocio('A nova senha precisa ter pelo menos 6 caracteres.');
  const sal = gerarSal();
  atualizar((d) =>
    comAtividade({ ...d, usuarios: d.usuarios.map((x) => (x.id === usuarioId ? { ...x, senhaSal: sal, senhaHash: hashSenha(nova, sal) } : x)) }, usuarioId, 'usuario', 'trocou a própria senha'),
  );
}

// ---------- Empresa, contas e categorias ----------

export function salvarEmpresa(empresa: Empresa, usuarioId: string): void {
  if (!empresa.razaoSocial.trim()) throw new ErroNegocio('Informe a razão social.');
  atualizar((db) => comAtividade({ ...db, empresa: { ...empresa, cnpj: normalizarCnpj(empresa.cnpj) } }, usuarioId, 'config', 'atualizou os dados da empresa'));
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
        contas: db.contas.map((c) => ({ ...c, saldoInicial: 0, saldoInicialEm: hoje() })),
      },
      usuarioId,
      'config',
      'zerou os dados de demonstração e começou do zero',
    ),
  );
}
