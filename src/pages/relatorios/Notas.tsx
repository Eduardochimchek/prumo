// Relatório de notas fiscais (Faturamento): emitidas e recebidas por mês, impostos destacados
// nas notas de venda e os maiores fornecedores. Não é apuração de imposto: é o que está nas notas.

import { useMemo } from 'react';
import { hoje, mesAbrev } from '../../lib/dates';
import { moeda, plural } from '../../lib/format';
import { baixarArquivo, gerarCsv } from '../../lib/util';
import { useDb } from '../../data/store';
import { relatorioNotas } from '../../data/relatorios';
import { Painel } from '../../components/Painel';
import { Botao, Vazio } from '../../components/ui';
import { CabecalhoRelatorio, csvValor, Parte, SeletorPeriodo, usePeriodo } from './comum';

const TOP = 10;

export function RelatorioNotas() {
  const db = useDb();
  const periodo = usePeriodo('6', true);
  const r = useMemo(() => relatorioNotas(db, periodo.meses), [db, periodo.meses]);

  const exportar = () => {
    const linhas: (string | number)[][] = [
      ['Mês', 'Emitidas', 'Valor emitido', 'Impostos destacados', 'Recebidas', 'Valor recebido', 'Canceladas'],
      ...r.meses.map((m) => [mesAbrev(m.mes), m.emitidas, csvValor(m.valorEmitido), csvValor(m.impostos), m.recebidas, csvValor(m.valorRecebido), m.canceladas]),
      ['Total', r.emitidas, csvValor(r.valorEmitido), csvValor(r.impostos), r.recebidas, csvValor(r.valorRecebido), r.canceladas],
      [],
      ['Fornecedor', 'Notas', 'Valor'],
      ...r.fornecedores.map((f) => [f.nome, f.notas, csvValor(f.total)]),
    ];
    baixarArquivo(`prumo-notas-por-mes-${hoje()}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  return (
    <div className="relatorios">
      <CabecalhoRelatorio
        modulo="faturamento"
        titulo="Notas fiscais"
        acoes={
          <>
            <Botao icone="imprimir" onClick={() => window.print()}>
              Imprimir
            </Botao>
            <Botao icone="baixar" onClick={exportar} disabled={!r.emitidas && !r.recebidas}>
              Exportar
            </Botao>
          </>
        }
      />

      <Painel
        rotulo="Resumo das notas"
        itens={[
          { chave: 'emitido', rotulo: 'Faturado (notas de venda)', valor: moeda(r.valorEmitido), tom: 'entrada', zerado: !r.valorEmitido, destaque: true, nota: plural(r.emitidas, 'nota emitida', 'notas emitidas') },
          { chave: 'impostos', rotulo: 'Impostos nas notas de venda', valor: moeda(r.impostos), tom: 'neutro', zerado: !r.impostos, nota: r.valorEmitido ? `${Math.round((r.impostos / r.valorEmitido) * 100)}% do faturado` : 'ICMS, IPI, ST, PIS e COFINS' },
          { chave: 'recebido', rotulo: 'Compras (notas recebidas)', valor: moeda(r.valorRecebido), tom: 'saida', zerado: !r.valorRecebido, nota: plural(r.recebidas, 'nota recebida', 'notas recebidas') },
          { chave: 'canceladas', rotulo: 'Canceladas', valor: String(r.canceladas), tom: r.canceladas ? 'atencao' : 'neutro', zerado: !r.canceladas, nota: periodo.descricao },
        ]}
      />

      <SeletorPeriodo periodo={periodo} />

      {r.emitidas + r.recebidas === 0 ? (
        <Vazio icone="nota" titulo="Nenhuma nota no período" texto="Emita a nota de um pedido ou importe os XML das notas de compra." />
      ) : (
        <>
          <div className="secao-titulo">
            <h2>Mês a mês</h2>
          </div>
          <div className="tabela-rolagem painel">
            <table className="razao">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="dir">Emitidas</th>
                  <th className="dir">Faturado</th>
                  <th className="dir esconder-movel">Impostos</th>
                  <th className="dir">Recebidas</th>
                  <th className="dir">Compras</th>
                </tr>
              </thead>
              <tbody>
                {r.meses.map((m) => (
                  <tr key={m.mes}>
                    <td>
                      {mesAbrev(m.mes)}
                      {m.canceladas > 0 && (
                        <span className="carimbo carimbo--cancelado" style={{ marginLeft: 8 }}>
                          {plural(m.canceladas, 'cancelada', 'canceladas')}
                        </span>
                      )}
                    </td>
                    <td className="dir num">{m.emitidas || '-'}</td>
                    <td className="valor entrada-txt">{m.valorEmitido ? moeda(m.valorEmitido) : '-'}</td>
                    <td className="valor esconder-movel">{m.impostos ? moeda(m.impostos) : '-'}</td>
                    <td className="dir num">{m.recebidas || '-'}</td>
                    <td className="valor saida-txt">{m.valorRecebido ? moeda(m.valorRecebido) : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="dir num">{r.emitidas}</td>
                  <td className="valor">{moeda(r.valorEmitido)}</td>
                  <td className="valor esconder-movel">{moeda(r.impostos)}</td>
                  <td className="dir num">{r.recebidas}</td>
                  <td className="valor">{moeda(r.valorRecebido)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
            Impostos destacados nas notas de venda autorizadas. Não é apuração de imposto: a guia (DAS, ICMS) quem calcula é o contador.
          </p>

          {r.fornecedores.length > 0 && (
            <>
              <div className="secao-titulo" style={{ marginTop: 32 }}>
                <h2>Maiores fornecedores</h2>
                {r.fornecedores.length > TOP && (
                  <span className="muted" style={{ fontSize: 13 }}>
                    {TOP} de {r.fornecedores.length}
                  </span>
                )}
              </div>
              <div className="tabela-rolagem painel">
                <table className="razao">
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th className="dir">Notas</th>
                      <th className="dir">Valor</th>
                      <th className="esconder-movel">Parte das compras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.fornecedores.slice(0, TOP).map((f) => (
                      <tr key={f.chave}>
                        <td>
                          <strong>{f.nome}</strong>
                        </td>
                        <td className="dir num">{f.notas}</td>
                        <td className="valor">{moeda(f.total)}</td>
                        <td className="esconder-movel">
                          <Parte valor={f.total} total={r.valorRecebido} tom="saida" />
                        </td>
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
