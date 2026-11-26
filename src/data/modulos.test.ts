// Módulos por login (cada pessoa vê só o seu módulo) e relatórios por módulo.

import { beforeEach, describe, expect, it } from 'vitest';
import { criarBaseDemo } from './seed';
import { getDb, migrar, substituirBanco, VERSAO_BANCO } from './store';
import { salvarUsuario } from './actions';
import { faixaDe, relatorioNotas, relatorioVendas, titulosEmAberto, ultimosMeses } from './relatorios';
import { donoDaRota, moduloDaRota, modulosDo, permissoesDo, podeAbrir, rotaInicial, vejoInicio } from '../auth/modulos';
import type { Database, Usuario } from './types';

const REF = '2026-11-09';
const usuario = (login: string) => getDb().usuarios.find((u) => u.login === login)!;

beforeEach(() => substituirBanco(criarBaseDemo(REF)));

describe('módulos por login', () => {
  it('administrador vê todos os módulos e o painel do dono', () => {
    const r = usuario('reginaldo');
    expect(modulosDo(r)).toEqual(['comercial', 'faturamento', 'financeiro']);
    expect(vejoInicio(r)).toBe(true);
    expect(rotaInicial(r)).toBe('/');
    for (const p of ['vender', 'faturar', 'lancar', 'baixar', 'usuarios', 'config', 'aprovar'] as const) expect(permissoesDo(r).has(p)).toBe(true);
  });

  it('vendedor só do Comercial: entra em Vendas e não abre o financeiro', () => {
    const b = usuario('bruno');
    expect(modulosDo(b)).toEqual(['comercial']);
    expect(vejoInicio(b)).toBe(false);
    expect(rotaInicial(b)).toBe('/vendas');
    expect(podeAbrir(b, '/vendas')).toBe(true);
    expect(podeAbrir(b, '/vendas/vnd_1')).toBe(true);
    expect(podeAbrir(b, '/produtos')).toBe(true);
    expect(podeAbrir(b, '/contatos')).toBe(true);
    expect(podeAbrir(b, '/relatorios/vendas')).toBe(true);
    expect(podeAbrir(b, '/')).toBe(false);
    expect(podeAbrir(b, '/contas/pagar')).toBe(false);
    expect(podeAbrir(b, '/fluxo')).toBe(false);
    expect(podeAbrir(b, '/notas')).toBe(false);
    expect(podeAbrir(b, '/relatorios/gerencial')).toBe(false);
    const p = permissoesDo(b);
    expect(p.has('vender')).toBe(true);
    expect(p.has('lancar')).toBe(false);
    expect(p.has('faturar')).toBe(false);
    expect(p.has('baixar')).toBe(false);
  });

  it('quem tem dois módulos vê os dois e faz o que cada um libera', () => {
    const a = usuario('ana.paula');
    expect(modulosDo(a)).toEqual(['faturamento', 'financeiro']);
    expect(vejoInicio(a)).toBe(true);
    expect(podeAbrir(a, '/notas/abc')).toBe(true);
    expect(podeAbrir(a, '/vendas')).toBe(true); // pedidos a faturar
    expect(podeAbrir(a, '/produtos')).toBe(false);
    const p = permissoesDo(a);
    expect(p.has('faturar') && p.has('importar') && p.has('lancar') && p.has('planilha')).toBe(true);
    expect(p.has('vender')).toBe(false);
    expect(p.has('aprovar')).toBe(false);
  });

  it('consulta vê os módulos marcados, mas não altera nada', () => {
    const m = usuario('marcos');
    expect(modulosDo(m)).toEqual(['faturamento', 'financeiro']);
    expect(podeAbrir(m, '/contas/receber')).toBe(true);
    expect(permissoesDo(m).size).toBe(0);
  });

  it('rotas comuns ficam no módulo em que a pessoa estava', () => {
    const r = usuario('reginaldo');
    expect(donoDaRota('/contatos')).toBe('livre');
    expect(moduloDaRota(r, '/contatos', '', 'faturamento')).toBe('faturamento');
    expect(moduloDaRota(r, '/vendas', '', 'faturamento')).toBe('faturamento');
    expect(moduloDaRota(r, '/vendas', '', 'financeiro')).toBe('comercial');
    expect(moduloDaRota(r, '/vendas', '?aba=pedido', null)).toBe('faturamento');
    expect(moduloDaRota(r, '/relatorios', '?m=comercial', 'financeiro')).toBe('comercial');
    expect(moduloDaRota(r, '/relatorios/gerencial', '', 'comercial')).toBe('financeiro');
    expect(moduloDaRota(r, '/', '', 'comercial')).toBeNull();
    // não deixa escolher pelo endereço um módulo que a pessoa não tem
    expect(moduloDaRota(usuario('bruno'), '/relatorios', '?m=financeiro', null)).toBe('comercial');
  });

  it('cadastro exige pelo menos um módulo para quem não é administrador', () => {
    const r = usuario('reginaldo');
    const base = { nome: 'Carla Souza', email: 'carla@exemplo.com', login: 'carla', ativo: true, senha: 'Provisoria 77' };
    expect(() => salvarUsuario({ ...base, papel: 'equipe', modulos: [] }, r.id)).toThrow(/pelo menos um módulo/);
    const u = salvarUsuario({ ...base, papel: 'equipe', modulos: ['financeiro', 'comercial'] }, r.id);
    expect(u.modulos).toEqual(['comercial', 'financeiro']);
    const adm = salvarUsuario({ ...base, id: u.id, papel: 'admin', modulos: ['comercial'] }, r.id);
    expect(adm.modulos).toBeUndefined();
  });

  it('migração da v3: quem era Financeiro continua com tudo o que tinha', () => {
    const antigo = criarBaseDemo(REF);
    const v3 = {
      ...antigo,
      versao: 3,
      demo: false,
      usuarios: antigo.usuarios.map((u) => ({ ...u, papel: u.papel === 'equipe' ? 'financeiro' : u.papel, modulos: undefined })),
    } as unknown as Database;
    const m = migrar(v3);
    expect(m.versao).toBe(VERSAO_BANCO);
    const ana = m.usuarios.find((u) => u.login === 'ana.paula') as Usuario;
    expect(ana.papel).toBe('equipe');
    expect(modulosDo(ana)).toEqual(['comercial', 'faturamento', 'financeiro']);
    const marcos = m.usuarios.find((u) => u.login === 'marcos') as Usuario;
    expect(modulosDo(marcos)).toEqual(['comercial', 'faturamento', 'financeiro']);
  });
});

describe('relatórios', () => {
  it('meses do período: só fechados por padrão', () => {
    expect(ultimosMeses(3, false, REF)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(ultimosMeses(3, true, REF)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('faixa de prazo dos títulos', () => {
    expect(faixaDe('2026-11-09', REF)).toBe('semana');
    expect(faixaDe('2026-11-16', REF)).toBe('semana');
    expect(faixaDe('2026-11-17', REF)).toBe('mes');
    expect(faixaDe('2026-12-10', REF)).toBe('depois');
    expect(faixaDe('2026-11-08', REF)).toBe('v30');
    expect(faixaDe('2026-09-10', REF)).toBe('v60');
    expect(faixaDe('2026-08-11', REF)).toBe('v90');
    expect(faixaDe('2026-08-10', REF)).toBe('v90mais');
  });

  it('contas a receber em aberto: faixas e clientes somam o total', () => {
    const r = titulosEmAberto(getDb(), 'receber', REF);
    expect(r.qtd).toBeGreaterThan(0);
    expect(r.faixas.reduce((a, f) => a + f.total, 0)).toBe(r.total);
    expect(r.porContato.reduce((a, c) => a + c.total, 0)).toBe(r.total);
    expect(r.vencido).toBeGreaterThan(0);
    // quem tem atraso vem primeiro
    expect(r.porContato[0].vencido).toBeGreaterThan(0);
  });

  it('vendas do período batem com as notas de saída', () => {
    const meses = ultimosMeses(6, true, REF);
    const v = relatorioVendas(getDb(), meses);
    expect(v.total).toBeGreaterThan(0);
    expect(v.meses.reduce((a, m) => a + m.total, 0)).toBe(v.total);
    expect(v.porCliente.reduce((a, c) => a + c.total, 0)).toBe(v.total);
    expect(v.ticketMedio).toBe(Math.round(v.total / v.notas));
    expect(v.porProduto.length).toBeGreaterThan(0);
    expect(v.orcamentos.criados).toBeGreaterThanOrEqual(v.orcamentos.aprovados + v.orcamentos.recusados + v.orcamentos.emAberto);
  });

  it('notas do período: emitidas, recebidas e impostos', () => {
    const n = relatorioNotas(getDb(), ultimosMeses(6, true, REF));
    expect(n.emitidas).toBeGreaterThan(0);
    expect(n.recebidas).toBeGreaterThan(0);
    expect(n.meses.reduce((a, m) => a + m.valorRecebido, 0)).toBe(n.valorRecebido);
    expect(n.fornecedores.reduce((a, f) => a + f.total, 0)).toBe(n.valorRecebido);
  });
});
