import { useMemo, useState } from 'react';
import { dataBR, diaMes, hoje, mesLongo, mesLongoTitulo, semanaCurta } from '../lib/dates';
import { moeda } from '../lib/format';
import { gerarCsv, baixarArquivo } from '../lib/util';
import { useDb } from '../data/store';
import { fluxoMensal, projecaoDiaria } from '../data/selectors';
import { GraficoProjecao } from '../components/charts/GraficoProjecao';
import { GraficoFluxoMensal } from '../components/charts/GraficoFluxoMensal';
import { Painel } from '../components/Painel';
import { Simulador, cenarioDe, type Ajuste } from '../components/Simulador';
import { Botao, Segmentado } from '../components/ui';

export function Fluxo() {
  const db = useDb();
  const ref = hoje();
  const [horizonte, setHorizonte] = useState<'30' | '60' | '90'>('60');
  const [verDias, setVerDias] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const proj = useMemo(() => projecaoDiaria(db, Number(horizonte), ref), [db, horizonte, ref]);
  const simulado = useMemo(() => (ajustes.length ? projecaoDiaria(db, Number(horizonte), ref, cenarioDe(ajustes)) : null), [db, horizonte, ref, ajustes]);
  const meses = useMemo(() => fluxoMensal(db, 6, 2, ref), [db, ref]);
  const ultimo = proj.pontos[proj.pontos.length - 1];
  const diasComMovimento = proj.pontos.filter((p) => p.entradas || p.saidas);
  const entramNoPeriodo = proj.pontos.reduce((a, p) => a + p.entradas, 0);
  const saemNoPeriodo = proj.pontos.reduce((a, p) => a + p.saidas, 0);
  const negativo = proj.menor.saldo < 0;

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
        </div>
        <div className="pagina-cabeca__acoes">
          <Botao icone="baixar" onClick={exportar}>
            Exportar
          </Botao>
        </div>
      </header>

      <Painel
        rotulo="Resumo do fluxo de caixa"
        itens={[
          { chave: 'hoje', rotulo: 'Saldo hoje', valor: moeda(proj.inicial), tom: 'marca', destaque: true, nota: 'em todas as contas' },
          {
            chave: 'entram',
            rotulo: `Entram em ${horizonte} dias`,
            valor: moeda(entramNoPeriodo),
            tom: 'entrada',
            zerado: !entramNoPeriodo,
            nota: 'a receber já lançado',
          },
          {
            chave: 'saem',
            rotulo: `Saem em ${horizonte} dias`,
            valor: moeda(saemNoPeriodo),
            tom: 'saida',
            zerado: !saemNoPeriodo,
            nota: 'a pagar já lançado',
          },
          {
            chave: 'fim',
            rotulo: `Saldo em ${dataBR(ultimo.data).slice(0, 5)}`,
            valor: moeda(ultimo.saldo),
            tom: ultimo.saldo < 0 ? 'critico' : 'neutro',
            nota: ultimo.saldo >= proj.inicial ? 'maior que hoje' : 'menor que hoje',
          },
          {
            chave: 'menor',
            rotulo: 'Ponto mais baixo',
            valor: moeda(proj.menor.saldo),
            tom: negativo ? 'critico' : 'neutro',
            nota: negativo ? `fica negativo em ${diaMes(proj.menor.data)}` : `em ${diaMes(proj.menor.data)}`,
          },
        ]}
      />
      {negativo && (
        <p className="aviso-caixa aviso-caixa--critico" style={{ marginBottom: 24 }}>
          O caixa fica negativo em {diaMes(proj.menor.data)}: antecipe recebimentos ou renegocie pagamentos.
        </p>
      )}

      <section className="simulacao" aria-label="Simulação">
        <div className="secao-titulo">
          <h2>E se…?</h2>
          {simulando && ajustes.length > 0 && (
            <Botao variante="fantasma" tam="p" icone="desfazer" onClick={() => setAjustes([])}>
              Limpar simulação
            </Botao>
          )}
        </div>
        {!simulando ? (
          <div className="simulacao__convite">
            <span>Adiar um pagamento, um cliente atrasar, uma compra grande, receber menos: veja o que acontece com o caixa antes de decidir.</span>
            <Botao icone="simular" onClick={() => setSimulando(true)}>
              Simular um cenário
            </Botao>
          </div>
        ) : (
          <>
            <Simulador db={db} ref={ref} horizonte={Number(horizonte)} ajustes={ajustes} aoMudar={setAjustes} />
            {simulado ? (
              <Painel
                rotulo="Resultado da simulação"
                className="simulacao__resultado"
                itens={[
                  {
                    chave: 'menor',
                    rotulo: 'Ponto mais baixo',
                    valor: moeda(simulado.menor.saldo),
                    tom: simulado.menor.saldo < 0 ? 'critico' : simulado.menor.saldo < proj.menor.saldo ? 'atencao' : 'neutro',
                    nota: `antes: ${moeda(proj.menor.saldo)} · em ${diaMes(simulado.menor.data)}`,
                  },
                  {
                    chave: 'fim',
                    rotulo: `Saldo em ${dataBR(ultimo.data).slice(0, 5)}`,
                    valor: moeda(simulado.pontos[simulado.pontos.length - 1].saldo),
                    tom: simulado.pontos[simulado.pontos.length - 1].saldo < 0 ? 'critico' : 'neutro',
                    nota: `antes: ${moeda(ultimo.saldo)}`,
                  },
                  {
                    chave: 'dif',
                    rotulo: 'Diferença no fim',
                    valor: moeda(simulado.pontos[simulado.pontos.length - 1].saldo - ultimo.saldo, { sinal: true }),
                    tom:
                      simulado.pontos[simulado.pontos.length - 1].saldo - ultimo.saldo > 0
                        ? 'entrada'
                        : simulado.pontos[simulado.pontos.length - 1].saldo - ultimo.saldo < 0
                          ? 'saida'
                          : 'neutro',
                    zerado: simulado.pontos[simulado.pontos.length - 1].saldo === ultimo.saldo,
                    nota: simulado.menor.saldo < 0 ? `fica negativo em ${diaMes(simulado.menor.data)}` : 'o caixa não fica negativo',
                  },
                ]}
              />
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>
                Adicione uma ou mais mudanças. Nada aqui é gravado: é só para planejar.
              </p>
            )}
          </>
        )}
      </section>

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
        {simulado && (
          <div className="legenda" style={{ marginBottom: 6 }}>
            <span>
              <i className="linha" style={{ background: 'var(--tinta)' }} /> Com a simulação
            </span>
            <span>
              <i className="linha linha--tracejada" /> Sem a simulação
            </span>
          </div>
        )}
        <GraficoProjecao pontos={(simulado ?? proj).pontos} menor={(simulado ?? proj).menor} comparar={simulado ? proj.pontos : undefined} />
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
                    <td className="valor entrada-txt">{p.entradas ? moeda(p.entradas) : '-'}</td>
                    <td className="valor saida-txt">{p.saidas ? moeda(p.saidas) : '-'}</td>
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
