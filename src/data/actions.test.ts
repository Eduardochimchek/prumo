import { beforeEach, describe, expect, it } from 'vitest';
import { criarBaseDemo } from './seed';
import { getDb, substituirBanco } from './store';
import {
  anonimizarContato,
  conferirSenha,
  criarLancamentos,
  darBaixa,
  estornarBaixa,
  excluirMinhaConta,
  excluirUsuario,
  exportarMeusDados,
  registrarAcesso,
  salvarUsuario,
  trocarPropriaSenha,
} from './actions';
import { saldoTotal, statusDe } from './selectors';
import { hashSenha } from '../lib/sha256';

const REF = '2026-11-09';
const admin = () => getDb().usuarios.find((u) => u.login === 'admin')!;
const reginaldo = () => getDb().usuarios.find((u) => u.login === 'reginaldo')!;

beforeEach(() => substituirBanco(criarBaseDemo(REF)));

describe('baixa', () => {
  it('pagar e estornar mexe no saldo na medida certa', () => {
    const l = getDb().lancamentos.find((x) => x.tipo === 'pagar' && !x.baixa && x.vencimento === REF)!;
    const antes = saldoTotal(getDb(), REF);
    darBaixa([l.id], { data: REF, contaId: getDb().contas[0].id, juros: 1000 }, admin().id);
    expect(saldoTotal(getDb(), REF)).toBe(antes - l.valor - 1000);
    estornarBaixa([l.id], admin().id);
    expect(saldoTotal(getDb(), REF)).toBe(antes);
  });

  it('pagamento parcial quita uma parte e deixa o saldo em aberto', () => {
    const l = getDb().lancamentos.find((x) => x.tipo === 'pagar' && !x.baixa && x.valor > 10_000)!;
    const parcial = Math.round(l.valor / 3);
    darBaixa([l.id], { data: REF, contaId: getDb().contas[0].id, parcial }, admin().id);
    const db = getDb();
    const pago = db.lancamentos.find((x) => x.id === l.id)!;
    const saldo = db.lancamentos.find((x) => x.descricao.endsWith('(saldo)') && x.contatoId === l.contatoId && !x.baixa && x.vencimento === l.vencimento)!;
    expect(pago.valor).toBe(parcial);
    expect(pago.baixa?.valorPago).toBe(parcial);
    expect(saldo.valor).toBe(l.valor - parcial);
    expect(pago.valor + saldo.valor).toBe(l.valor);
    expect(statusDe(saldo, REF)).not.toBe('pago');
  });

  it('parcelamento divide sem perder centavo', () => {
    const base = { tipo: 'pagar' as const, descricao: 'Teste', emissao: REF, competencia: '2026-11' };
    const criados = criarLancamentos(
      [0, 1, 2].map((i) => ({ ...base, valor: i === 2 ? 3334 : 3333, vencimento: REF })),
      admin().id,
    );
    expect(criados.reduce((a, l) => a + l.valor, 0)).toBe(10_000);
  });
});

describe('usuários e senhas', () => {
  it('senha nova fraca é recusada; usuário novo nasce com senha provisória', () => {
    expect(() => salvarUsuario({ nome: 'Teste', email: 't@x.com', login: 'teste', papel: 'leitura', ativo: true, senha: '123456' }, admin().id)).toThrow();
    const u = salvarUsuario({ nome: 'Teste Silva', email: 't@x.com', login: 'teste', papel: 'leitura', ativo: true, senha: 'Provisoria 77' }, admin().id);
    expect(u.trocarSenha).toBe(true);
    expect(u.senhaIteracoes).toBe(20_000);
    expect(conferirSenha(u, 'Provisoria 77')).toBe(true);
    trocarPropriaSenha(u.id, 'Provisoria 77', 'Minha senha 2026');
    const depois = getDb().usuarios.find((x) => x.id === u.id)!;
    expect(depois.trocarSenha).toBe(false);
    expect(conferirSenha(depois, 'Minha senha 2026')).toBe(true);
  });

  it('hash antigo (1.500 iterações) é refeito no login', () => {
    const r = reginaldo();
    substituirBanco({
      ...getDb(),
      usuarios: getDb().usuarios.map((u) => (u.id === r.id ? { ...u, senhaHash: hashSenha('reginaldo123', u.senhaSal, 1500), senhaIteracoes: undefined } : u)),
    });
    expect(conferirSenha(reginaldo(), 'reginaldo123')).toBe(true);
    registrarAcesso(r.id, 'reginaldo123');
    expect(reginaldo().senhaIteracoes).toBe(20_000);
    expect(conferirSenha(reginaldo(), 'reginaldo123')).toBe(true);
  });
});

describe('LGPD', () => {
  it('exportação dos meus dados não leva a senha', () => {
    const json = exportarMeusDados(reginaldo().id);
    expect(json).toContain('Reginaldo Jeronimo');
    expect(json).not.toContain(reginaldo().senhaHash);
    expect(json).not.toContain('senhaSal');
  });

  it('excluir usuário apaga os dados pessoais e o nome das atividades, mantendo os lançamentos', () => {
    const ana = getDb().usuarios.find((u) => u.login === 'ana.paula')!;
    const lancados = getDb().lancamentos.filter((l) => l.criadoPor === ana.id).length;
    excluirUsuario(ana.id, admin().id);
    const db = getDb();
    expect(db.usuarios.some((u) => u.id === ana.id)).toBe(false);
    expect(JSON.stringify(db.atividades)).not.toContain('Ana Paula Moreira');
    expect(db.atividades.filter((a) => a.usuarioId === ana.id).every((a) => !a.texto.startsWith('Ana '))).toBe(true);
    expect(db.lancamentos.filter((l) => l.criadoPor === ana.id).length).toBe(lancados);
  });

  it('a pessoa exclui a própria conta com a senha; o último administrador não pode', () => {
    expect(() => excluirMinhaConta(reginaldo().id, 'errada')).toThrow('Senha incorreta');
    excluirMinhaConta(reginaldo().id, 'reginaldo123');
    expect(getDb().usuarios.some((u) => u.login === 'reginaldo')).toBe(false);
    expect(() => excluirMinhaConta(admin().id, 'admin123')).toThrow(/único administrador/);
  });

  it('anonimizar contato apaga dados pessoais e mantém os valores', () => {
    const joao = getDb().contatos.find((c) => c.nome === 'João Carlos Ferreira')!;
    const totalAntes = getDb().lancamentos.filter((l) => l.contatoId === joao.id).reduce((a, l) => a + l.valor, 0);
    anonimizarContato(joao.id, admin().id);
    const db = getDb();
    const c = db.contatos.find((x) => x.id === joao.id)!;
    expect(c.nome).toBe('Titular anonimizado');
    expect(c.documento).toBe('');
    expect(c.email).toBeUndefined();
    expect(c.anonimizadoEm).toBeTruthy();
    const titulos = db.lancamentos.filter((l) => l.contatoId === joao.id);
    expect(titulos.reduce((a, l) => a + l.valor, 0)).toBe(totalAntes);
    expect(titulos.some((l) => l.descricao.includes('João Carlos'))).toBe(false);
  });
});
