// Relatório gerencial (DRE): entrou, saiu, lucro e margem mês a mês, por categoria.

import { useMemo, useState } from 'react';
import { hoje, mesAbrev } from '../../lib/dates';
import { moeda, numero } from '../../lib/format';
import { baixarArquivo, gerarCsv } from '../../lib/util';
import { useDb } from '../../data/store';
import { dre, type Regime } from '../../data/selectors';
import { Painel } from '../../components/Painel';
import { Botao, Segmentado } from '../../components/ui';
import { CabecalhoRelatorio, csvValor, SeletorPeriodo, usePeriodo } from './comum';

export function RelatorioGerencial() {
  const db = useDb();
  const ref = hoje();
  const [regime, setRegime] = useState<Regime>('caixa');
  const periodo = usePeriodo('6', false);
  const { meses, comAtual } = periodo;
  const r = useMemo(() => dre(db, meses, regime), [db, meses, regime]);
  const totalRec = r.totalReceitas.reduce((a, b) => a + b, 0);
  const totalDesp = r.totalDespesas.reduce((a, b) => a + b, 0);
  const resultado = totalRec - totalDesp;
  const margem = totalRec ? (resultado / totalRec) * 100 : 0;
  const totalRetiradas = r.totalRetiradas.reduce((a, b) => a + b, 0);
  const sobrou = resultado - totalRetiradas;

  const exportarDre = () => {
    const linhas: (string | number)[][] = [['Linha', ...meses.map(mesAbrev), 'Total']];
    linhas.push(['RECEITAS', ...r.totalReceitas.map(csvValor), csvValor(totalRec)]);
    r.receitas.forEach((l) => linhas.push([`  ${l.nome}`, ...l.valores.map(csvValor), csvValor(l.total)]));
    linhas.push(['DESPESAS', ...r.totalDespesas.map(csvValor), csvValor(totalDesp)]);
    r.despesas.forEach((l) => linhas.push([`  ${l.nome}`, ...l.valores.map(csvValor), csvValor(l.total)]));
    linhas.push(['RESULTADO', ...r.resultado.map(csvValor), csvValor(resultado)]);
    if (r.retiradas.length) {
      linhas.push(['RETIRADAS DOS SÓCIOS', ...r.totalRetiradas.map(csvValor), csvValor(totalRetiradas)]);
      r.retiradas.forEach((l) => linhas.push([`  ${l.nome}`, ...l.valores.map(csvValor), csvValor(l.total)]));
      linhas.push(['SOBROU NA EMPRESA', ...r.sobrou.map(csvValor), csvValor(sobrou)]);
    }
    baixarArquivo(`prumo-dre-${regime}-${ref}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  const Linha = ({ nome, valores, total, classe }: { nome: string; valores: number[]; total: number; classe?: string }) => (
    <tr className={classe}>
      <td>{nome}</td>
      {valores.map((v, i) => (
        <td key={i} className="valor">
          {v ? moeda(v) : '-'}
        </td>
      ))}
      <td className="valor dre__total">{moeda(total)}</td>
    </tr>
  );

  return (
    <div className="relatorios">
      <CabecalhoRelatorio
        modulo="financeiro"
        titulo="Resultado da empresa"
        acoes={
          <>
            <Botao icone="imprimir" onClick={() => window.print()}>
              Imprimir
            </Botao>
            <Botao icone="baixar" onClick={exportarDre}>
              Exportar DRE
            </Botao>
          </>
        }
      />

      <Painel
        rotulo="Resumo do resultado"
        itens={[
          {
            chave: 'entrou',
            rotulo: 'Entrou',
            valor: moeda(totalRec),
            tom: 'entrada',
            zerado: !totalRec,
            nota: `${mesAbrev(meses[0])} a ${mesAbrev(meses[meses.length - 1])}${comAtual ? ' (parcial)' : ''}`,
          },
          { chave: 'saiu', rotulo: 'Saiu', valor: moeda(totalDesp), tom: 'saida', zerado: !totalDesp, nota: 'despesas do período' },
          {
            chave: 'resultado',
            rotulo: 'Resultado',
            valor: moeda(resultado, { sinal: true }),
            tom: resultado >= 0 ? 'entrada' : 'critico',
            zerado: !resultado,
            nota: resultado >= 0 ? 'lucro no período' : 'prejuízo no período',
          },
          ...(totalRetiradas > 0
            ? [
                {
                  chave: 'retiradas',
                  rotulo: 'Retiradas dos sócios',
                  valor: moeda(totalRetiradas),
                  tom: totalRetiradas > resultado ? ('critico' as const) : ('neutro' as const),
                  nota: totalRetiradas > resultado ? 'mais do que a empresa lucrou' : `sobrou ${moeda(sobrou)} na empresa`,
                },
              ]
            : []),
          {
            chave: 'margem',
            rotulo: 'Margem',
            valor: `${numero(margem, 1)}%`,
            tom: margem >= 0 ? 'neutro' : 'critico',
            zerado: !totalRec,
            nota: 'do faturamento',
          },
        ]}
      />

      <SeletorPeriodo
        periodo={periodo}
        extra={
          <Segmentado
            rotulo="Regime"
            valor={regime}
            aoMudar={setRegime}
            opcoes={[
              { valor: 'caixa', rotulo: 'Regime de caixa' },
              { valor: 'competencia', rotulo: 'Competência' },
            ]}
          />
        }
      />
      <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
        {regime === 'caixa'
          ? 'Caixa: conta o que efetivamente foi pago e recebido, no mês da baixa.'
          : 'Competência: conta pelo mês a que a receita ou despesa se refere, pago ou não.'}{' '}
        {r.retiradas.length > 0 && 'Retiradas dos sócios ficam fora das despesas e aparecem depois do resultado. '}
        Este é um demonstrativo gerencial e não substitui a contabilidade oficial.
      </p>

      <div className="tabela-rolagem painel">
        <table className="razao dre">
          <thead>
            <tr>
              <th>Linha</th>
              {meses.map((m) => (
                <th key={m} className="dir">
                  {mesAbrev(m)}
                </th>
              ))}
              <th className="dir">Total</th>
            </tr>
          </thead>
          <tbody>
            <Linha nome="Receitas" valores={r.totalReceitas} total={totalRec} classe="dre__grupo" />
            {r.receitas.map((l) => (
              <Linha key={l.categoriaId} nome={l.nome} valores={l.valores} total={l.total} classe="dre__item" />
            ))}
            <Linha nome="Despesas" valores={r.totalDespesas} total={totalDesp} classe="dre__grupo" />
            {r.despesas.map((l) => (
              <Linha key={l.categoriaId} nome={l.nome} valores={l.valores} total={l.total} classe="dre__item" />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Resultado</td>
              {r.resultado.map((v, i) => (
                <td key={i} className={`valor ${v >= 0 ? 'entrada-txt' : 'critico-txt'}`}>
                  {moeda(v, { sinal: true })}
                </td>
              ))}
              <td className={`valor ${resultado >= 0 ? 'entrada-txt' : 'critico-txt'}`}>{moeda(resultado, { sinal: true })}</td>
            </tr>
            <tr className="dre__margem">
              <td>Margem</td>
              {r.resultado.map((v, i) => (
                <td key={i} className="valor muted">
                  {r.totalReceitas[i] ? `${numero((v / r.totalReceitas[i]) * 100, 1)}%` : '-'}
                </td>
              ))}
              <td className="valor">{numero(margem, 1)}%</td>
            </tr>
            {r.retiradas.length > 0 && (
              <>
                <tr className="dre__retirada">
                  <td>Retiradas dos sócios</td>
                  {r.totalRetiradas.map((v, i) => (
                    <td key={i} className="valor">
                      {v ? moeda(-v, { sinal: true }) : '-'}
                    </td>
                  ))}
                  <td className="valor">{moeda(-totalRetiradas, { sinal: true })}</td>
                </tr>
                <tr className="dre__sobrou">
                  <td>Sobrou na empresa</td>
                  {r.sobrou.map((v, i) => (
                    <td key={i} className={`valor ${v >= 0 ? 'entrada-txt' : 'critico-txt'}`}>
                      {moeda(v, { sinal: true })}
                    </td>
                  ))}
                  <td className={`valor ${sobrou >= 0 ? 'entrada-txt' : 'critico-txt'}`}>{moeda(sobrou, { sinal: true })}</td>
                </tr>
              </>
            )}
          </tfoot>
        </table>
      </div>

    </div>
  );
}
