import { useMemo, useState } from 'react';
import { dataBR, diaMes, hoje, mesLongo, mesLongoTitulo, semanaCurta } from '../lib/dates';
import { moeda } from '../lib/format';
import { gerarCsv, baixarArquivo } from '../lib/util';
import { useDb } from '../data/store';
import { fluxoMensal, projecaoDiaria } from '../data/selectors';
import { GraficoProjecao } from '../components/charts/GraficoProjecao';
import { GraficoFluxoMensal } from '../components/charts/GraficoFluxoMensal';
import { Botao, Segmentado } from '../components/ui';

export function Fluxo() {
  const db = useDb();
  const ref = hoje();
  const [horizonte, setHorizonte] = useState<'30' | '60' | '90'>('60');
  const [verDias, setVerDias] = useState(false);
  const proj = useMemo(() => projecaoDiaria(db, Number(horizonte), ref), [db, horizonte, ref]);
  const meses = useMemo(() => fluxoMensal(db, 6, 2, ref), [db, ref]);
  const ultimo = proj.pontos[proj.pontos.length - 1];
  const diasComMovimento = proj.pontos.filter((p) => p.entradas || p.saidas);

  const exportar = () => {
    const linhas = [
      ['Mês', 'Entradas realizadas', 'Entradas previstas', 'Saídas realizadas', 'Saídas previstas', 'Resultado', 'Saldo no fim do mês'],
      ...meses.map((m) => {
        const f = (v: number) => (v / 100).toFixed(2).replace('.', ',');
        return [mesLongo(m.mes), f(m.entradas), f(m.entradasPrevistas), f(m.saidas), f(m.saidasPrevistas), f(m.entradas + m.entradasPrevistas - m.saidas - m.saidasPrevistas), f(m.saldoFinal)];
      }),
    ];
    baixarArquivo(`prumo-fluxo-de-caixa-${ref}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  return (
    <div className="fluxo">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Fluxo de caixa</p>
          <h1>Para onde o caixa vai</h1>
          <p className="lede">
            Hoje há <strong>{moeda(proj.inicial)}</strong> nas contas. Com o que já está lançado, o saldo chega a <strong>{moeda(ultimo.saldo)}</strong> em {dataBR(ultimo.data)}. O ponto mais
            baixo é <strong className={proj.menor.saldo < 0 ? 'critico-txt' : undefined}>{moeda(proj.menor.saldo)}</strong>, em {diaMes(proj.menor.data)}
            {proj.menor.saldo < 0 ? ' — o caixa fica negativo: antecipe recebimentos ou renegocie pagamentos.' : '.'}
          </p>
        </div>
        <div className="pagina-cabeca__acoes">
          <Botao icone="baixar" onClick={exportar}>
            Exportar
          </Botao>
        </div>
      </header>

      <section>
        <div className="secao-titulo">
          <h2>Saldo previsto, dia a dia</h2>
          <div className="acoes">
            <Segmentado
              rotulo="Horizonte"
              valor={horizonte}
              aoMudar={setHorizonte}
              opcoes={[
                { valor: '30', rotulo: '30 dias' },
                { valor: '60', rotulo: '60 dias' },
                { valor: '90', rotulo: '90 dias' },
              ]}
            />
          </div>
        </div>
        <GraficoProjecao pontos={proj.pontos} menor={proj.menor} />
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          A projeção considera os títulos em aberto (contas vencidas entram no dia de hoje). Vendas que ainda não foram lançadas não aparecem.
        </p>
        <Botao variante="fantasma" tam="p" iconeDepois={verDias ? 'cima' : 'baixo'} onClick={() => setVerDias((v) => !v)} style={{ marginTop: 8 }}>
          {verDias ? 'Esconder' : 'Ver'} os {diasComMovimento.length} dias com movimento
        </Botao>
        {verDias && (
          <div className="tabela-rolagem painel" style={{ marginTop: 12 }}>
            <table className="razao">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th className="dir">Entram</th>
                  <th className="dir">Saem</th>
                  <th className="dir">Saldo previsto</th>
                </tr>
              </thead>
              <tbody>
                {diasComMovimento.map((p) => (
                  <tr key={p.data}>
                    <td className="num">
                      {semanaCurta(p.data)}, {dataBR(p.data)}
                    </td>
                    <td className="valor entrada-txt">{p.entradas ? moeda(p.entradas) : '—'}</td>
                    <td className="valor saida-txt">{p.saidas ? moeda(p.saidas) : '—'}</td>
                    <td className={`valor${p.saldo < 0 ? ' critico-txt' : ''}`}>{moeda(p.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 40 }}>
        <div className="secao-titulo">
          <h2>Mês a mês</h2>
          <div className="acoes legenda">
            <span>
              <i style={{ background: 'var(--entrada)' }} /> Entradas
            </span>
            <span>
              <i style={{ background: 'var(--saida)' }} /> Saídas
            </span>
            <span>
              <i style={{ background: 'var(--entrada-suave)' }} /> Previsto
            </span>
            <span>
              <i className="linha" style={{ background: 'var(--tinta)' }} /> Saldo no fim do mês
            </span>
          </div>
        </div>
        <GraficoFluxoMensal meses={meses} />
        <div className="tabela-rolagem painel" style={{ marginTop: 18 }}>
          <table className="razao">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="dir">Entradas</th>
                <th className="dir">Saídas</th>
                <th className="dir">Resultado</th>
                <th className="dir">Saldo no fim</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => {
                const e = m.entradas + m.entradasPrevistas;
                const s = m.saidas + m.saidasPrevistas;
                return (
                  <tr key={m.mes}>
                    <td>
                      <span>{mesLongoTitulo(m.mes)}</span>{' '}
                      {m.tempo !== 'passado' && <span className="carimbo carimbo--aberto">{m.tempo === 'atual' ? 'Mês atual' : 'Previsão'}</span>}
                    </td>
                    <td className="valor">
                      {moeda(e)}
                      {m.entradasPrevistas > 0 && m.tempo === 'atual' && <small className="fluxo__prev">{moeda(m.entradasPrevistas)} previsto</small>}
                    </td>
                    <td className="valor">
                      {moeda(s)}
                      {m.saidasPrevistas > 0 && m.tempo === 'atual' && <small className="fluxo__prev">{moeda(m.saidasPrevistas)} previsto</small>}
                    </td>
                    <td className={`valor ${e - s >= 0 ? 'entrada-txt' : 'saida-txt'}`}>{moeda(e - s, { sinal: true })}</td>
                    <td className="valor">{moeda(m.saldoFinal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
