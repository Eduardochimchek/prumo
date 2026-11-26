// Relatório de vendas (Comercial): vendido por mês, por cliente, por produto e por vendedor,
// ticket médio e o que aconteceu com os orçamentos do período.

import { useMemo } from 'react';
import { mesAbrev, mesLongoTitulo } from '../../lib/dates';
import { moeda, numero, plural } from '../../lib/format';
import { baixarArquivo, gerarCsv } from '../../lib/util';
import { hoje } from '../../lib/dates';
import { useDb } from '../../data/store';
import { relatorioVendas } from '../../data/relatorios';
import { Painel } from '../../components/Painel';
import { Botao, Vazio } from '../../components/ui';
import { CabecalhoRelatorio, csvValor, Parte, SeletorPeriodo, usePeriodo } from './comum';

const TOP = 10;

export function RelatorioVendas() {
  const db = useDb();
  const periodo = usePeriodo('6', true);
  const r = useMemo(() => relatorioVendas(db, periodo.meses), [db, periodo.meses]);
  const melhorMes = r.meses.reduce((a, m) => (m.total > a.total ? m : a), r.meses[0]);
  const decididos = r.orcamentos.aprovados + r.orcamentos.recusados;
  const aprovacao = decididos ? Math.round((r.orcamentos.aprovados / decididos) * 100) : 0;

  const exportar = () => {
    const linhas: (string | number)[][] = [
      ['Mês', 'Notas', 'Vendido', 'Ticket médio'],
      ...r.meses.map((m) => [mesAbrev(m.mes), m.notas, csvValor(m.total), csvValor(m.notas ? Math.round(m.total / m.notas) : 0)]),
      ['Total', r.notas, csvValor(r.total), csvValor(r.ticketMedio)],
      [],
      ['Cliente', 'Notas', 'Vendido'],
      ...r.porCliente.map((c) => [c.nome, c.notas, csvValor(c.total)]),
      [],
      ['Código', 'Produto ou serviço', 'Quantidade', 'Unidade', 'Vendido'],
      ...r.porProduto.map((p) => [p.codigo, p.descricao, numero(p.quantidade, p.quantidade % 1 ? 2 : 0), p.unidade, csvValor(p.total)]),
    ];
    baixarArquivo(`prumo-vendas-${hoje()}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  return (
    <div className="relatorios">
      <CabecalhoRelatorio
        modulo="comercial"
        titulo="Vendas"
        acoes={
          <>
            <Botao icone="imprimir" onClick={() => window.print()}>
              Imprimir
            </Botao>
            <Botao icone="baixar" onClick={exportar} disabled={!r.notas}>
              Exportar
            </Botao>
          </>
        }
      />

      <Painel
        rotulo="Resumo das vendas"
        itens={[
          { chave: 'vendido', rotulo: 'Vendido', valor: moeda(r.total), tom: 'entrada', zerado: !r.total, destaque: true, nota: periodo.descricao },
          { chave: 'notas', rotulo: 'Notas de venda', valor: String(r.notas), tom: 'neutro', zerado: !r.notas, nota: `${plural(r.porCliente.length, 'cliente', 'clientes')}` },
          { chave: 'ticket', rotulo: 'Ticket médio', valor: moeda(r.ticketMedio), tom: 'neutro', zerado: !r.ticketMedio, nota: 'por nota' },
          {
            chave: 'aprovacao',
            rotulo: 'Orçamentos aprovados',
            valor: `${aprovacao}%`,
            tom: aprovacao >= 50 ? 'entrada' : 'atencao',
            zerado: !decididos,
            nota: decididos ? `${r.orcamentos.aprovados} de ${decididos} decididos · ${r.orcamentos.emAberto} em aberto` : 'nenhum decidido no período',
          },
        ]}
      />

      <SeletorPeriodo periodo={periodo} />

      {r.notas === 0 ? (
        <Vazio icone="venda" titulo="Nenhuma venda no período" texto="As vendas entram aqui quando a nota é emitida (ou importada por XML)." />
      ) : (
        <>
          <div className="secao-titulo">
            <h2>Mês a mês</h2>
            {melhorMes?.total > 0 && (
              <span className="muted" style={{ fontSize: 13 }}>
                melhor mês: {mesLongoTitulo(melhorMes.mes)}
              </span>
            )}
          </div>
          <div className="tabela-rolagem painel">
            <table className="razao">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="dir">Notas</th>
                  <th className="dir">Vendido</th>
                  <th className="dir esconder-movel">Ticket médio</th>
                  <th className="esconder-movel">Parte do período</th>
                </tr>
              </thead>
              <tbody>
                {r.meses.map((m) => (
                  <tr key={m.mes}>
                    <td>{mesAbrev(m.mes)}</td>
                    <td className="dir num">{m.notas || '-'}</td>
                    <td className="valor">{m.total ? moeda(m.total) : '-'}</td>
                    <td className="valor esconder-movel">{m.notas ? moeda(Math.round(m.total / m.notas)) : '-'}</td>
                    <td className="esconder-movel">{m.total > 0 && <Parte valor={m.total} total={r.total} />}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="dir num">{r.notas}</td>
                  <td className="valor">{moeda(r.total)}</td>
                  <td className="valor esconder-movel">{moeda(r.ticketMedio)}</td>
                  <td className="esconder-movel" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="relatorio-duas">
            <section>
              <div className="secao-titulo">
                <h2>Maiores clientes</h2>
                {r.porCliente.length > TOP && (
                  <span className="muted" style={{ fontSize: 13 }}>
                    {TOP} de {r.porCliente.length}
                  </span>
                )}
              </div>
              <div className="tabela-rolagem painel">
                <table className="razao">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="dir">Vendido</th>
                      <th className="esconder-movel">Parte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porCliente.slice(0, TOP).map((c) => (
                      <tr key={c.chave}>
                        <td>
                          <div className="celula-principal">
                            <strong>{c.nome}</strong>
                            <span>{plural(c.notas, 'nota', 'notas')}</span>
                          </div>
                        </td>
                        <td className="valor">{moeda(c.total)}</td>
                        <td className="esconder-movel">
                          <Parte valor={c.total} total={r.total} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <div className="secao-titulo">
                <h2>Mais vendidos</h2>
                {r.porProduto.length > TOP && (
                  <span className="muted" style={{ fontSize: 13 }}>
                    {TOP} de {r.porProduto.length}
                  </span>
                )}
              </div>
              <div className="tabela-rolagem painel">
                <table className="razao">
                  <thead>
                    <tr>
                      <th>Produto ou serviço</th>
                      <th className="dir">Qtd</th>
                      <th className="dir">Vendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porProduto.slice(0, TOP).map((p) => (
                      <tr key={p.codigo}>
                        <td>
                          <div className="celula-principal">
                            <strong>{p.descricao}</strong>
                            <span className="mono">{p.codigo}</span>
                          </div>
                        </td>
                        <td className="dir num apertada">
                          {numero(p.quantidade, p.quantidade % 1 ? 2 : 0)} {p.unidade}
                        </td>
                        <td className="valor">{moeda(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {r.porVendedor.length > 0 && (
            <>
              <div className="secao-titulo" style={{ marginTop: 32 }}>
                <h2>Por vendedor</h2>
                <span className="muted" style={{ fontSize: 13 }}>
                  orçamentos aprovados no período
                </span>
              </div>
              <div className="tabela-rolagem painel">
                <table className="razao">
                  <thead>
                    <tr>
                      <th>Quem fez o orçamento</th>
                      <th className="dir">Aprovados</th>
                      <th className="dir">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porVendedor.map((v) => (
                      <tr key={v.usuarioId}>
                        <td>
                          <strong>{v.nome}</strong>
                        </td>
                        <td className="dir num">{v.vendas}</td>
                        <td className="valor">{moeda(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
