import { describe, expect, it } from 'vitest';
import { criarBaseDemo } from './seed';
import { briefing, fluxoMensal, resumoTipo, saldoConta } from './selectors';
import { moeda } from '../lib/format';
import { cnpjValido, documentoValido } from '../lib/br';
import { analisarChave } from '../lib/nfe/chave';

describe('base de demonstração', () => {
  const ref = '2026-11-09';
  const db = criarBaseDemo(ref);

  it('gera dados coerentes', () => {
    expect(cnpjValido(db.empresa.cnpj)).toBe(true);
    for (const c of db.contatos) if (c.documento) expect(documentoValido(c.documento), c.nome).toBe(true);
    for (const n of db.notas) expect(analisarChave(n.chave).valida, n.numero).toBe(true);
    for (const l of db.lancamentos) {
      expect(Number.isInteger(l.valor) && l.valor > 0, l.descricao).toBe(true);
      if (l.baixa) expect(l.baixa.data <= ref).toBe(true);
    }
  });

  it('tem saldo positivo, vencidos e pendências para mostrar no painel', () => {
    const b = briefing(db, ref);
    const pagar = resumoTipo(db, 'pagar', ref);
    const receber = resumoTipo(db, 'receber', ref);
    const linhas = [
      `lançamentos=${db.lancamentos.length} notas=${db.notas.length} contatos=${db.contatos.length}`,
      `saldo hoje=${moeda(b.saldo)} fim do mês=${moeda(b.saldoFimMes)} menor=${moeda(b.projecao.menor.saldo)} em ${b.projecao.menor.data}`,
      ...db.contas.map((c) => `  ${c.nome}: ${moeda(saldoConta(db, c, ref))}`),
      `pagar: vencido ${moeda(pagar.vencido.total)} (${pagar.vencido.qtd}) hoje ${moeda(pagar.hoje.total)} (${pagar.hoje.qtd}) semana ${moeda(pagar.semana.total)} (${pagar.semana.qtd})`,
      `receber: vencido ${moeda(receber.vencido.total)} (${receber.vencido.qtd}) hoje ${moeda(receber.hoje.total)} (${receber.hoje.qtd}) semana ${moeda(receber.semana.total)} (${receber.semana.qtd})`,
      ...fluxoMensal(db, 6, 2, ref).map(
        (m) => `  ${m.mes} ${m.tempo.padEnd(7)} E ${moeda(m.entradas + m.entradasPrevistas).padStart(14)}  S ${moeda(m.saidas + m.saidasPrevistas).padStart(14)}  saldo ${moeda(m.saldoFinal)}`,
      ),
      `notas sem título=${b.notasSemTitulo.length} sefaz pendentes=${b.sefazPendentes.length}`,
    ];
    console.log(linhas.join('\n'));
    expect(b.saldo).toBeGreaterThan(0);
    expect(b.vencidos.length).toBeGreaterThan(0);
    expect(b.notasSemTitulo.length).toBe(1);
  });
});
