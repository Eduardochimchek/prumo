// Aprovação de pagamentos, conferência do boleto, cobrança pelo WhatsApp, simulação do fluxo,
// retiradas dos sócios no DRE e importação de planilha.

import { beforeEach, describe, expect, it } from 'vitest';
import { criarBaseDemo } from './seed';
import { getDb, migrar, substituirBanco, VERSAO_BANCO } from './store';
import {
  aprovarPagamentos,
  criarLancamentos,
  darBaixa,
  definirLimiteAprovacao,
  definirRetirada,
  editarLancamento,
  importarPlanilha,
  registrarCobrancaEnviada,
  retirarAprovacao,
  salvarEmpresa,
} from './actions';
import { briefing, dre, paraCobrar, precisaAprovacao, projecaoDiaria } from './selectors';
import { conferirPagamento, conferirTitulo } from './conferencia';
import { gerarLinhaDigitavel } from '../lib/boleto';
import { montarLinhas, sugerirMapeamento, lerTabela } from '../lib/planilha';
import type { Database } from './types';

const REF = '2026-11-09';
const usuario = (login: string) => getDb().usuarios.find((u) => u.login === login)!;
const reginaldo = () => usuario('reginaldo');
const ana = () => usuario('ana.paula');

beforeEach(() => substituirBanco(criarBaseDemo(REF)));

describe('aprovação de pagamentos', () => {
  it('a demonstração tem duas contas esperando aprovação', () => {
    const b = briefing(getDb(), REF);
    expect(b.aprovar).toHaveLength(2);
    for (const l of b.aprovar) expect(l.valor).toBeGreaterThanOrEqual(500_000);
  });

  it('bloqueia o pagamento sem aprovação e libera depois do OK do administrador', () => {
    const l = briefing(getDb(), REF).aprovar[0];
    const conta = getDb().contas[0].id;
    expect(() => darBaixa([l.id], { data: REF, contaId: conta }, ana().id)).toThrow(/aprovado por um administrador/);
    expect(() => aprovarPagamentos([l.id], ana().id)).toThrow(/Só um administrador/);
    expect(aprovarPagamentos([l.id], reginaldo().id)).toBe(1);
    darBaixa([l.id], { data: REF, contaId: conta }, ana().id);
    expect(getDb().lancamentos.find((x) => x.id === l.id)!.baixa).toBeTruthy();
  });

  it('baixa em lote não passa se uma das contas precisa de aprovação', () => {
    const [l] = briefing(getDb(), REF).aprovar;
    const pequena = getDb().lancamentos.find((x) => x.tipo === 'pagar' && !x.baixa && !x.cancelado && x.valor < 100_000)!;
    expect(() => darBaixa([l.id, pequena.id], { data: REF, contaId: getDb().contas[0].id }, ana().id)).toThrow(/precisa ser aprovado/);
    expect(getDb().lancamentos.find((x) => x.id === pequena.id)!.baixa).toBeUndefined();
  });

  it('mudar valor ou boleto depois de aprovado tira a aprovação; mudar a descrição não', () => {
    const l = briefing(getDb(), REF).aprovar[0];
    aprovarPagamentos([l.id], reginaldo().id);
    editarLancamento(l.id, { descricao: 'Outra descrição' }, ana().id);
    expect(precisaAprovacao(getDb(), getDb().lancamentos.find((x) => x.id === l.id)!)).toBe(false);
    editarLancamento(l.id, { valor: l.valor + 100 }, ana().id);
    expect(precisaAprovacao(getDb(), getDb().lancamentos.find((x) => x.id === l.id)!)).toBe(true);
    expect(getDb().atividades[0].texto).toContain('aprovação do pagamento foi retirada');
  });

  it('retirar aprovação e mudar o limite são só do administrador; salvar a empresa não mexe no limite', () => {
    const l = briefing(getDb(), REF).aprovar[0];
    aprovarPagamentos([l.id], reginaldo().id);
    expect(() => retirarAprovacao(l.id, ana().id)).toThrow();
    retirarAprovacao(l.id, reginaldo().id);
    expect(precisaAprovacao(getDb(), getDb().lancamentos.find((x) => x.id === l.id)!)).toBe(true);

    expect(() => definirLimiteAprovacao(100_000, ana().id)).toThrow();
    salvarEmpresa({ ...getDb().empresa, limiteAprovacao: 0 }, reginaldo().id);
    expect(getDb().empresa.limiteAprovacao).toBe(500_000);
    definirLimiteAprovacao(0, reginaldo().id);
    expect(getDb().empresa.limiteAprovacao).toBeUndefined();
    expect(briefing(getDb(), REF).aprovar).toHaveLength(0);
  });
});

describe('conferência antes de pagar', () => {
  it('a demonstração tem um boleto com banco trocado e um repetido da nota', () => {
    const db = getDb();
    const golpe = db.lancamentos.find((l) => l.descricao.includes('pedido 4471'))!;
    const alertas = conferirTitulo(db, golpe, REF);
    expect(alertas.map((a) => a.titulo)).toContain('Banco diferente do habitual');
    expect(alertas.find((a) => a.titulo === 'Banco diferente do habitual')!.nivel).toBe('critico');

    const repetido = db.lancamentos.find((l) => l.descricao.includes('(recebido por e-mail)'))!;
    expect(conferirTitulo(db, repetido, REF).some((a) => a.titulo.startsWith('Parece ser da NF'))).toBe(true);
  });

  it('acha o mesmo boleto já pago e o valor diferente da duplicata', () => {
    const db = getDb();
    const pago = db.lancamentos.find((l) => l.tipo === 'pagar' && l.baixa && l.linhaDigitavel && l.notaId)!;
    const mesmo = conferirPagamento(db, { tipo: 'pagar', valor: pago.valor, vencimento: pago.vencimento, linha: pago.linhaDigitavel, contatoId: pago.contatoId }, REF);
    expect(mesmo[0]).toMatchObject({ nivel: 'critico', titulo: 'Este boleto já foi pago' });

    const parcela = db.lancamentos.find((l) => l.tipo === 'pagar' && !l.baixa && l.notaId && l.linhaDigitavel)!;
    const outroValor = gerarLinhaDigitavel(parcela.linhaDigitavel!.slice(0, 3), parcela.vencimento, parcela.valor + 5000, '1234567890123456789012345');
    const alertas = conferirPagamento(db, { tipo: 'pagar', valor: parcela.valor, vencimento: parcela.vencimento, linha: outroValor, contatoId: parcela.contatoId, notaId: parcela.notaId, id: parcela.id }, REF);
    expect(alertas.find((a) => a.titulo === 'Valor do boleto diferente da nota')?.nivel).toBe('critico');
  });

  it('um título normal da nota não gera alerta nenhum', () => {
    const db = getDb();
    // a parcela que a demonstração duplicou de propósito (boleto "recebido por e-mail") fica de fora:
    // ela deve, sim, avisar que pode ser repetida
    const duplicado = db.lancamentos.find((l) => l.descricao.includes('(recebido por e-mail)'))!;
    const parDuplicado = conferirTitulo(db, db.lancamentos.find((l) => l.notaId && l.valor === duplicado.valor && l.vencimento === duplicado.vencimento)!, REF);
    expect(parDuplicado.map((a) => a.titulo)).toEqual(['Pode ser conta repetida']);
    const normais = db.lancamentos.filter((l) => l.tipo === 'pagar' && !l.baixa && !l.cancelado && l.notaId && !(l.valor === duplicado.valor && l.vencimento === duplicado.vencimento));
    expect(normais.length).toBeGreaterThan(5);
    for (const l of normais) expect(conferirTitulo(db, l, REF), l.descricao).toEqual([]);
  });

  it('conta a receber não é conferida', () => {
    expect(conferirPagamento(getDb(), { tipo: 'receber', valor: 100, vencimento: REF }, REF)).toEqual([]);
  });
});

describe('cobrança pelo WhatsApp', () => {
  it('lista atrasados e os que vencem logo, e registra a cobrança', () => {
    const lista = paraCobrar(getDb(), REF, 3);
    expect(lista.length).toBeGreaterThan(0);
    for (const l of lista) {
      expect(l.tipo).toBe('receber');
      expect(l.vencimento <= '2026-11-12').toBe(true);
    }
    const l = lista[0];
    registrarCobrancaEnviada(l.id, ana().id);
    const depois = getDb().lancamentos.find((x) => x.id === l.id)!;
    expect(depois.cobrancasEnviadas?.at(-1)?.usuarioId).toBe(ana().id);
    expect(getDb().atividades[0].tipo).toBe('cobranca');
    const pagar = getDb().lancamentos.find((x) => x.tipo === 'pagar')!;
    expect(() => registrarCobrancaEnviada(pagar.id, ana().id)).toThrow();
  });
});

describe('simulação do fluxo (e se…?)', () => {
  it('adiar um pagamento, cliente que não paga, gasto extra e recebimentos menores', () => {
    const db = getDb();
    const base = projecaoDiaria(db, 30, REF);
    const pagar = db.lancamentos.find((l) => l.tipo === 'pagar' && !l.baixa && !l.cancelado && l.vencimento > REF && l.vencimento < '2026-11-20')!;
    const adiado = projecaoDiaria(db, 30, REF, { mover: { [pagar.id]: '2026-12-05' } });
    const dia = (p: typeof base, d: string) => p.pontos.find((x) => x.data === d)!.saldo;
    expect(dia(adiado, pagar.vencimento) - dia(base, pagar.vencimento)).toBe(pagar.valor);
    expect(dia(adiado, '2026-12-08')).toBe(dia(base, '2026-12-08')); // depois da nova data, tudo igual

    const receber = db.lancamentos.find((l) => l.tipo === 'receber' && !l.baixa && !l.cancelado && l.vencimento > REF && l.vencimento < '2026-11-30')!;
    const naoPaga = projecaoDiaria(db, 30, REF, { mover: { [receber.id]: null } });
    expect(dia(base, '2026-12-08') - dia(naoPaga, '2026-12-08')).toBe(receber.valor);

    const extra = projecaoDiaria(db, 30, REF, { extras: [{ id: 'x', data: '2026-11-15', valor: -1_000_000, descricao: 'Reforma' }] });
    expect(dia(base, '2026-11-14') - dia(extra, '2026-11-14')).toBe(0);
    expect(dia(base, '2026-11-15') - dia(extra, '2026-11-15')).toBe(1_000_000);

    const menores = projecaoDiaria(db, 30, REF, { reducaoRecebimentosPct: 10 });
    const totalRec = base.pontos.reduce((a, p) => a + p.entradas, 0);
    const totalMenor = menores.pontos.reduce((a, p) => a + p.entradas, 0);
    expect(Math.abs(totalRec - totalMenor - Math.round(totalRec / 10))).toBeLessThan(base.pontos.length);
  });
});

describe('retiradas dos sócios no DRE', () => {
  it('ficam fora das despesas e aparecem depois do resultado', () => {
    const db = getDb();
    const meses = ['2026-08', '2026-09', '2026-10'];
    const r = dre(db, meses, 'caixa');
    expect(r.retiradas.map((l) => l.nome)).toEqual(['Retirada dos sócios']);
    expect(r.despesas.some((l) => l.nome === 'Retirada dos sócios')).toBe(false);
    expect(r.totalRetiradas).toEqual([400_000, 400_000, 400_000]);
    meses.forEach((_, i) => expect(r.sobrou[i]).toBe(r.resultado[i] - r.totalRetiradas[i]));
  });

  it('marcar outra categoria como retirada muda o DRE', () => {
    const pro = getDb().categorias.find((c) => c.nome === 'Pró-labore')!;
    definirRetirada(pro.id, true, reginaldo().id);
    const r = dre(getDb(), ['2026-10'], 'caixa');
    expect(r.retiradas.map((l) => l.nome).sort()).toEqual(['Pró-labore', 'Retirada dos sócios']);
    const receita = getDb().categorias.find((c) => c.tipo === 'receita')!;
    expect(() => definirRetirada(receita.id, true, reginaldo().id)).toThrow();
  });
});

describe('importar planilha', () => {
  const texto = [
    'Vencimento\tDescrição\tFornecedor\tValor\tCategoria\tPago em',
    '05/11/2026\tAluguel do depósito\tImobiliária Nova\t2.500,00\tAluguel e condomínio\t05/11/2026',
    '20/11/2026\tSeguro da frota\tSeguradora Sul\t1.180,50\tSeguros\t',
    '20/11/2026\tSeguro da frota\tSeguradora Sul\t1.180,50\tSeguros\t',
    '01/12/2026\tLuz\tForça Sul Energia\tabc\t\t',
  ].join('\n');

  it('importa as válidas, cria contatos, casa categoria e fornecedor existentes, marca as pagas', () => {
    const tabela = lerTabela(texto);
    const linhas = montarLinhas(tabela, sugerirMapeamento(tabela[0]), { temCabecalho: true, modoTipo: 'pagar', hoje: REF });
    expect(linhas.filter((l) => l.erros.length)).toHaveLength(1);
    const antes = getDb().lancamentos.length;
    const conta = getDb().contas[0].id;
    const r = importarPlanilha(linhas, { contaId: conta, criarContatos: true, pularRepetidas: true }, ana().id);
    expect(r).toMatchObject({ criados: 2, pagos: 1, contatosNovos: 2, repetidas: 1, semCategoria: ['Seguros'] });
    const db = getDb();
    expect(db.lancamentos.length).toBe(antes + 2);
    const aluguel = db.lancamentos.find((l) => l.descricao === 'Aluguel do depósito')!;
    expect(aluguel.valor).toBe(250_000);
    expect(aluguel.baixa).toMatchObject({ data: '2026-11-05', valorPago: 250_000, contaId: conta });
    expect(db.categorias.find((c) => c.id === aluguel.categoriaId)?.nome).toBe('Aluguel e condomínio');
    expect(db.contatos.find((c) => c.id === aluguel.contatoId)?.nome).toBe('Imobiliária Nova');

    // importar de novo: tudo repetido
    const r2 = importarPlanilha(linhas, { contaId: conta, criarContatos: true, pularRepetidas: true }, ana().id);
    expect(r2.criados).toBe(0);
    expect(r2.repetidas).toBe(3);
  });

  it('usa o fornecedor que já existe (pelo nome fantasia) e exige conta para as pagas', () => {
    const tabela = lerTabela('Descrição;Fornecedor;Valor;Vencimento;Pago\nTinta extra;tintas pampa;980,00;10/11/2026;sim');
    const linhas = montarLinhas(tabela, sugerirMapeamento(tabela[0]), { temCabecalho: true, modoTipo: 'pagar', hoje: REF });
    expect(() => importarPlanilha(linhas, { criarContatos: true, pularRepetidas: true }, ana().id)).toThrow(/conta/);
    const r = importarPlanilha(linhas, { contaId: getDb().contas[0].id, criarContatos: true, pularRepetidas: true }, ana().id);
    expect(r.contatosNovos).toBe(0);
    const l = getDb().lancamentos.find((x) => x.descricao === 'Tinta extra')!;
    expect(getDb().contatos.find((c) => c.id === l.contatoId)?.fantasia).toBe('Tintas Pampa');
    // "sim" com vencimento depois de hoje vira pago hoje (nunca numa data futura)
    expect(l.baixa!.data).toBe(REF);
  });

  it('não importa nada sem linha válida', () => {
    expect(() => importarPlanilha([], { criarContatos: false, pularRepetidas: true }, ana().id)).toThrow(/Nenhuma linha válida/);
  });
});

describe('migração do banco', () => {
  it('banco v2 em uso vira v3 sem perder dados', () => {
    const v2 = { ...criarBaseDemo(REF), versao: 2, demo: false } as Database;
    const m = migrar(v2);
    expect(m.versao).toBe(VERSAO_BANCO);
    expect(m.lancamentos.length).toBe(v2.lancamentos.length);
    expect(m.produtos.length).toBe(v2.produtos.length);
  });
  it('criar lançamento continua funcionando depois da migração', () => {
    substituirBanco(migrar({ ...getDb(), versao: 2 } as Database));
    const [l] = criarLancamentos([{ tipo: 'pagar', descricao: 'Pós-migração', valor: 100, emissao: REF, vencimento: REF, competencia: '2026-11' }], ana().id);
    expect(getDb().lancamentos.some((x) => x.id === l.id)).toBe(true);
  });
});
