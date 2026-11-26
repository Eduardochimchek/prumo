// Contas a receber / a pagar em aberto: por prazo (quanto está atrasado e há quanto tempo)
// e por cliente ou fornecedor. É a foto de hoje, sem período.

import { useMemo } from 'react';
import { Link } from 'react-router';
import { dataBR, diffDias, hoje } from '../../lib/dates';
import { moeda, plural } from '../../lib/format';
import { baixarArquivo, gerarCsv } from '../../lib/util';
import { useDb } from '../../data/store';
import { faixaVencida, ROTULO_FAIXA, titulosEmAberto } from '../../data/relatorios';
import type { TipoLancamento } from '../../data/types';
import { Painel } from '../../components/Painel';
import { Botao, Vazio } from '../../components/ui';
import { CabecalhoRelatorio, csvValor, Parte } from './comum';

export function RelatorioTitulos({ tipo }: { tipo: TipoLancamento }) {
  const db = useDb();
  const ref = hoje();
  const r = useMemo(() => titulosEmAberto(db, tipo, ref), [db, tipo, ref]);
  const receber = tipo === 'receber';
  const quem = receber ? 'Cliente' : 'Fornecedor';
  const base = `/contas/${tipo}`;
  const tom = receber ? 'entrada' : 'saida';

  const exportar = () => {
    const linhas: (string | number)[][] = [
      ['Prazo', 'Títulos', 'Valor'],
      ...r.faixas.map((f) => [ROTULO_FAIXA[f.faixa], f.qtd, csvValor(f.total)]),
      ['Total em aberto', r.qtd, csvValor(r.total)],
      [],
      [quem, 'Títulos', 'Em aberto', 'Vencido', 'Vencimento mais antigo'],
      ...r.porContato.map((c) => [c.nome, c.qtd, csvValor(c.total), csvValor(c.vencido), dataBR(c.maisAntigo)]),
    ];
    baixarArquivo(`prumo-${receber ? 'a-receber' : 'a-pagar'}-${ref}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  return (
    <div className="relatorios">
      <CabecalhoRelatorio
        modulo="financeiro"
        titulo={receber ? 'Contas a receber' : 'Contas a pagar'}
        acoes={
          <>
            <Botao icone="imprimir" onClick={() => window.print()}>
              Imprimir
            </Botao>
            <Botao icone="baixar" onClick={exportar} disabled={!r.qtd}>
              Exportar
            </Botao>
          </>
        }
      />

      <Painel
        rotulo={`Resumo ${receber ? 'a receber' : 'a pagar'}`}
        itens={[
          { chave: 'aberto', rotulo: 'Em aberto', valor: moeda(r.total), tom, zerado: !r.total, destaque: true, para: `${base}?periodo=abertos`, nota: plural(r.qtd, 'título', 'títulos') },
          {
            chave: 'vencido',
            rotulo: receber ? 'Atrasado' : 'Vencido',
            valor: moeda(r.vencido),
            tom: 'critico',
            zerado: !r.vencido,
            para: `${base}?periodo=vencidos`,
            nota: r.qtdVencido ? `${plural(r.qtdVencido, 'título', 'títulos')} · ${r.total ? Math.round((r.vencido / r.total) * 100) : 0}% do total` : 'nada atrasado',
          },
          { chave: 'semana', rotulo: receber ? 'Entra em 7 dias' : 'Sai em 7 dias', valor: moeda(r.proximos7), tom: 'atencao', zerado: !r.proximos7, para: `${base}?periodo=7d`, nota: 'inclui hoje' },
          {
            chave: 'quem',
            rotulo: receber ? 'Clientes devendo' : 'Fornecedores a pagar',
            valor: String(r.porContato.length),
            tom: 'neutro',
            zerado: !r.porContato.length,
            nota: `${r.porContato.filter((c) => c.vencido > 0).length} com atraso`,
          },
        ]}
      />

      {r.qtd === 0 ? (
        <Vazio icone="check" titulo={receber ? 'Ninguém devendo' : 'Nenhuma conta em aberto'} texto="Quando houver contas em aberto, elas aparecem aqui por prazo e por contato." />
      ) : (
        <>
          <div className="secao-titulo">
            <h2>Por prazo</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              posição de {dataBR(ref)}
            </span>
          </div>
          <div className="tabela-rolagem painel">
            <table className="razao">
              <thead>
                <tr>
                  <th>Prazo</th>
                  <th className="dir">Títulos</th>
                  <th className="dir">Valor</th>
                  <th className="esconder-movel">Parte do total</th>
                </tr>
              </thead>
              <tbody>
                {r.faixas.map((f) => (
                  <tr key={f.faixa} className={f.qtd ? undefined : 'muted'}>
                    <td>
                      {faixaVencida(f.faixa) && f.qtd > 0 && <span className="carimbo carimbo--vencido" style={{ marginRight: 8 }}>Atrasado</span>}
                      {ROTULO_FAIXA[f.faixa]}
                    </td>
                    <td className="dir num">{f.qtd || '-'}</td>
                    <td className="valor">{f.total ? moeda(f.total) : '-'}</td>
                    <td className="esconder-movel">{f.total > 0 && <Parte valor={f.total} total={r.total} tom={faixaVencida(f.faixa) ? 'critico' : tom} />}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total em aberto</td>
                  <td className="dir num">{r.qtd}</td>
                  <td className="valor">{moeda(r.total)}</td>
                  <td className="esconder-movel" />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="secao-titulo" style={{ marginTop: 32 }}>
            <h2>Por {quem.toLowerCase()}</h2>
            <Link to={`${base}?periodo=abertos`} className="link" style={{ fontSize: 14 }}>
              Ver as contas →
            </Link>
          </div>
          <div className="tabela-rolagem painel">
            <table className="razao">
              <thead>
                <tr>
                  <th>{quem}</th>
                  <th className="dir">Títulos</th>
                  <th className="dir">Em aberto</th>
                  <th className="dir">{receber ? 'Atrasado' : 'Vencido'}</th>
                  <th className="dir esconder-movel">Mais antigo</th>
                </tr>
              </thead>
              <tbody>
                {r.porContato.map((c) => (
                  <tr key={c.contatoId ?? c.nome}>
                    <td>
                      <strong>{c.nome}</strong>
                    </td>
                    <td className="dir num">{c.qtd}</td>
                    <td className="valor">{moeda(c.total)}</td>
                    <td className={`valor${c.vencido ? ' critico-txt' : ' muted'}`}>{c.vencido ? moeda(c.vencido) : '-'}</td>
                    <td className="dir num esconder-movel">
                      {dataBR(c.maisAntigo)}
                      {c.maisAntigo < ref && <div className="muted" style={{ fontSize: 12.5 }}>há {diffDias(ref, c.maisAntigo)} dias</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
