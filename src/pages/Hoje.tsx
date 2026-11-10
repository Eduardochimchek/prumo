// "Hoje": a primeira página do dia. Em vez de uma parede de cartões com números,
// uma manchete escrita a partir dos dados — o que vence, o que atrasou, como o caixa fecha.

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { dataBR, dataExtenso, diaMesLongo, diffDias, fimMes, hoje, mesChave, mesLongo, relativoDias, saudacao, tempoRelativo } from '../lib/dates';
import { extenso, moeda, plural } from '../lib/format';
import { useDb } from '../data/store';
import { agenda, briefing, fluxoMensal, indices, nomeContato, porCategoria, saldoConta, statusDe } from '../data/selectors';
import type { Lancamento } from '../data/types';
import { useAuth, useUsuario } from '../auth/auth';
import { useAcoes } from '../components/Acoes';
import { Agenda } from '../components/charts/Agenda';
import { GraficoFluxoMensal } from '../components/charts/GraficoFluxoMensal';
import { BarrasCategoria } from '../components/charts/BarrasCategoria';
import { Icone } from '../components/Icone';
import { Avatar, Botao, Carimbo, CarimboTexto } from '../components/ui';

const Grifo = ({ children, tom }: { children: ReactNode; tom: 'entrada' | 'saida' | 'critico' | 'neutro' }) => (
  <mark className={`grifo grifo--${tom}`}>{children}</mark>
);

function LinhaTitulo({
  l,
  aoAbrir,
  aoBaixar,
  podeBaixar,
  noDia,
}: {
  l: Lancamento;
  aoAbrir: () => void;
  aoBaixar: () => void;
  podeBaixar: boolean;
  noDia?: boolean;
}) {
  const db = useDb();
  const contato = nomeContato(db, l.contatoId);
  const st = statusDe(l);
  const categoria = l.categoriaId ? indices(db).categorias.get(l.categoriaId)?.nome : undefined;
  return (
    <li className="titulo-linha">
      <button type="button" className="titulo-linha__principal" onClick={aoAbrir}>
        <span className={`titulo-linha__sentido titulo-linha__sentido--${l.tipo}`} aria-label={l.tipo === 'pagar' ? 'A pagar' : 'A receber'}>
          <Icone nome={l.tipo} tam={15} />
        </span>
        <span className="titulo-linha__texto">
          <strong className="truncar">{l.descricao}</strong>
          <span className="truncar">
            {noDia
              ? [contato, categoria].filter(Boolean).join(' · ') || l.documento
              : `${contato ? `${contato} · ` : ''}${st === 'vencido' ? `venceu ${relativoDias(l.vencimento)}` : `vence ${relativoDias(l.vencimento)}`}`}
          </span>
        </span>
        <span className="titulo-linha__valor num">{moeda(l.valor)}</span>
      </button>
      <span className="titulo-linha__acao">
        {st === 'vencido' && <Carimbo status="vencido" tipo={l.tipo} />}
        {podeBaixar && (
          <Botao tam="p" variante="secundario" onClick={aoBaixar}>
            {l.tipo === 'pagar' ? 'Pagar' : 'Receber'}
          </Botao>
        )}
      </span>
    </li>
  );
}

export function Hoje() {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const acoes = useAcoes();
  const navegar = useNavigate();
  const ref = hoje();
  const [diaSel, setDiaSel] = useState(ref);

  const b = useMemo(() => briefing(db, ref), [db, ref]);
  const dias = useMemo(() => agenda(db, ref, 14), [db, ref]);
  const meses = useMemo(() => fluxoMensal(db, 5, 2, ref), [db, ref]);
  const categorias = useMemo(() => porCategoria(db, 'pagar', mesChave(ref)), [db, ref]);
  const idx = indices(db);
  const contas = db.contas.filter((c) => c.ativa).map((c) => ({ c, saldo: saldoConta(db, c, ref) }));
  const maxConta = Math.max(1, ...contas.map((x) => Math.abs(x.saldo)));
  const primeiroNome = usuario.nome.split(' ')[0];
  const dia = dias.find((d) => d.data === diaSel) ?? dias[0];

  // ----- manchete -----
  const { pagar, receber } = b;
  const frases: ReactNode[] = [];
  if (pagar.hoje.qtd && receber.hoje.qtd) {
    frases.push(
      <>
        Hoje vencem {plural(pagar.hoje.qtd, 'conta', 'contas')} a pagar (<Grifo tom="saida">{moeda(pagar.hoje.total)}</Grifo>) e entram{' '}
        <Grifo tom="entrada">{moeda(receber.hoje.total)}</Grifo> de {plural(receber.hoje.qtd, 'recebimento', 'recebimentos')}.
      </>,
    );
  } else if (pagar.hoje.qtd) {
    frases.push(
      <>
        Hoje {pagar.hoje.qtd === 1 ? 'vence 1 conta' : `vencem ${pagar.hoje.qtd} contas`} a pagar, somando <Grifo tom="saida">{moeda(pagar.hoje.total)}</Grifo>.
      </>,
    );
  } else if (receber.hoje.qtd) {
    frases.push(
      <>
        Hoje entram <Grifo tom="entrada">{moeda(receber.hoje.total)}</Grifo> de {plural(receber.hoje.qtd, 'recebimento', 'recebimentos')}.
      </>,
    );
  } else frases.push(<>Nada vence hoje.</>);

  if (pagar.vencido.qtd || receber.vencido.qtd) {
    const partesPrefixo = (n: number) => {
      const inicio = !pagar.vencido.qtd;
      if (n === 1) return inicio ? 'Um recebimento está atrasado' : 'um recebimento está atrasado';
      return `${extenso(n, 'm', inicio)} recebimentos estão atrasados`;
    };
    const partes: ReactNode[] = [];
    if (pagar.vencido.qtd)
      partes.push(
        <span key="p">
          {pagar.vencido.qtd === 1 ? 'Uma conta a pagar está vencida' : `${extenso(pagar.vencido.qtd, 'f')} contas a pagar estão vencidas`} (<Grifo tom="critico">{moeda(pagar.vencido.total)}</Grifo>)
        </span>,
      );
    if (receber.vencido.qtd)
      partes.push(
        <span key="r">
          {partesPrefixo(receber.vencido.qtd)} (<Grifo tom="critico">{moeda(receber.vencido.total)}</Grifo>)
        </span>,
      );
    frases.push(
      <>
        {partes[0]}
        {partes[1] ? <> e {partes[1]}</> : null}.
      </>,
    );
  }
  frases.push(
    <>
      Nos próximos 7 dias saem <Grifo tom="saida">{moeda(pagar.semana.total)}</Grifo> e entram <Grifo tom="entrada">{moeda(receber.semana.total)}</Grifo>.
    </>,
  );
  const menor = b.projecao.menor;
  frases.push(
    <>
      Se nada mudar, o caixa fecha {mesLongo(mesChave(ref)).split(' de ')[0]} em <Grifo tom="neutro">{moeda(b.saldoFimMes)}</Grifo>
      {menor.data !== ref ? (
        <>
          {' '}
          — o dia mais apertado é {diaMesLongo(menor.data)}, com {moeda(menor.saldo)}.
        </>
      ) : (
        '.'
      )}
    </>,
  );

  // ----- pendências -----
  const pendencias: ReactNode[] = [];
  b.vencidos.slice(0, 5).forEach((l) =>
    pendencias.push(
      <LinhaTitulo key={l.id} l={l} podeBaixar={pode('baixar')} aoAbrir={() => acoes.verLancamento(l.id)} aoBaixar={() => acoes.darBaixa([l.id])} />,
    ),
  );
  b.notasSemTitulo.slice(0, 2).forEach((n) =>
    pendencias.push(
      <li key={n.id} className="titulo-linha">
        <button type="button" className="titulo-linha__principal" onClick={() => navegar(`/notas/${n.id}`)}>
          <span className="titulo-linha__sentido">
            <Icone nome="nota" tam={15} />
          </span>
          <span className="titulo-linha__texto">
            <strong className="truncar">NF {n.numero} ainda não virou conta a pagar</strong>
            <span className="truncar">
              {n.emitente.fantasia || n.emitente.nome} · {plural(n.duplicatas.length || 1, 'parcela', 'parcelas')}
            </span>
          </span>
          <span className="titulo-linha__valor num">{moeda(n.totais.nota)}</span>
        </button>
        <span className="titulo-linha__acao">
          <Botao tam="p" onClick={() => navegar(`/notas/${n.id}`)}>
            Gerar contas
          </Botao>
        </span>
      </li>,
    ),
  );
  if (b.sefazPendentes.length) {
    pendencias.push(
      <li key="sefaz" className="titulo-linha">
        <button type="button" className="titulo-linha__principal" onClick={() => navegar('/notas?aba=sefaz')}>
          <span className="titulo-linha__sentido">
            <Icone nome="escudo" tam={15} />
          </span>
          <span className="titulo-linha__texto">
            <strong className="truncar">
              {b.sefazPendentes.length === 1 ? '1 nota emitida contra o seu CNPJ aguarda' : `${b.sefazPendentes.length} notas emitidas contra o seu CNPJ aguardam`} manifestação
            </strong>
            <span className="truncar">Caixa de entrada da SEFAZ · {b.sefazPendentes.map((s) => s.emitenteNome.split(' ')[0]).join(', ')}</span>
          </span>
          <span className="titulo-linha__valor num">{moeda(b.sefazPendentes.reduce((a, s) => a + s.valor, 0))}</span>
        </button>
        <span className="titulo-linha__acao">
          <Botao tam="p" onClick={() => navegar('/notas?aba=sefaz')}>
            Abrir
          </Botao>
        </span>
      </li>,
    );
  }

  const fimDoMes = fimMes(ref);
  const diasParaFim = diffDias(fimDoMes, ref);

  return (
    <div className="hoje">
      <section className="hoje__abertura">
        <div className="hoje__manchete surgir">
          <p className="rotulo">{dataExtenso(ref)}</p>
          <h1>
            {saudacao()}, {primeiroNome}.
          </h1>
          <p className="hoje__lede">
            {frases.map((f, i) => (
              <span key={i}>{f} </span>
            ))}
          </p>
          <div className="linha-acoes" style={{ marginTop: 22 }}>
            <Botao variante="primario" icone="pagar" onClick={() => navegar('/contas/pagar?periodo=7d')}>
              Ver o que vence na semana
            </Botao>
            {pode('importar') && (
              <Botao icone="enviar" onClick={() => acoes.importarNotas()}>
                Importar XML de nota
              </Botao>
            )}
          </div>
        </div>

        <aside className="hoje__saldo surgir-2" aria-label="Saldo em caixa">
          <span className="rotulo">Saldo em caixa agora</span>
          <div className="hoje__saldo-valor">{moeda(b.saldo)}</div>
          <p className="hoje__saldo-sub">
            Projeção para {dataBR(fimDoMes).slice(0, 5)} ({diasParaFim === 0 ? 'hoje' : `em ${diasParaFim} dias`}):{' '}
            <strong className="num">{moeda(b.saldoFimMes)}</strong>
            <Icone nome={b.saldoFimMes >= b.saldo ? 'sobe' : 'desce'} tam={16} className={b.saldoFimMes >= b.saldo ? 'entrada-txt' : 'saida-txt'} />
          </p>
          <ul className="contas-saldo">
            {contas.map(({ c, saldo }) => (
              <li key={c.id}>
                <div className="contas-saldo__linha">
                  <span>
                    <Icone nome={c.tipo === 'caixa' ? 'dinheiro' : 'banco'} tam={15} /> {c.nome}
                  </span>
                  <span className={`num${saldo < 0 ? ' critico-txt' : ''}`}>{moeda(saldo)}</span>
                </div>
                <div className="barra-fina" aria-hidden="true">
                  <span style={{ width: `${(Math.abs(saldo) / maxConta) * 100}%`, background: saldo < 0 ? 'var(--critico)' : undefined }} />
                </div>
              </li>
            ))}
          </ul>
          <Link to="/fluxo" className="hoje__saldo-link">
            Ver projeção dia a dia <Icone nome="avancar" tam={15} />
          </Link>
        </aside>
      </section>

      <section className="surgir-3 hoje__agenda">
        <div className="secao-titulo">
          <h2>Próximos 14 dias</h2>
          <div className="acoes legenda">
            <span>
              <i style={{ background: 'var(--entrada)' }} /> A receber
            </span>
            <span>
              <i style={{ background: 'var(--saida)' }} /> A pagar
            </span>
          </div>
        </div>
        <Agenda dias={dias} selecionado={diaSel} aoSelecionar={setDiaSel} />
        <div className="dia-detalhe">
          <div className="dia-detalhe__cabeca">
            <h3>
              {dia.data === ref ? 'Hoje' : relativoDias(dia.data) === 'amanhã' ? 'Amanhã' : dataExtenso(dia.data, false)}
              <span className="muted"> · {plural(dia.itens.length, 'vencimento', 'vencimentos')}</span>
            </h3>
            <div className="dia-detalhe__totais num">
              {dia.receber > 0 && <span className="entrada-txt">+ {moeda(dia.receber)}</span>}
              {dia.pagar > 0 && <span className="saida-txt">− {moeda(dia.pagar)}</span>}
            </div>
          </div>
          {dia.itens.length === 0 ? (
            <p className="muted" style={{ padding: '14px 0' }}>
              Nada vence neste dia.
            </p>
          ) : (
            <ul className="lista-titulos">
              {dia.itens.slice(0, 8).map((l) => (
                <LinhaTitulo key={l.id} l={l} noDia podeBaixar={pode('baixar')} aoAbrir={() => acoes.verLancamento(l.id)} aoBaixar={() => acoes.darBaixa([l.id])} />
              ))}
              {dia.itens.length > 8 && (
                <li className="muted" style={{ padding: '10px 0' }}>
                  e mais {dia.itens.length - 8} —{' '}
                  <Link to={`/contas/pagar?de=${dia.data}&ate=${dia.data}`}>ver todos</Link>
                </li>
              )}
            </ul>
          )}
        </div>
      </section>

      <div className="hoje__colunas surgir-4">
        <section>
          <div className="secao-titulo">
            <h2>Para resolver</h2>
            {pendencias.length > 0 && <CarimboTexto variante="vencido">{pendencias.length} pendências</CarimboTexto>}
          </div>
          {pendencias.length ? (
            <ul className="lista-titulos">{pendencias}</ul>
          ) : (
            <div className="aviso-caixa aviso-caixa--ok">
              <Icone nome="check" />
              <span>Tudo em dia: nenhuma conta vencida, nenhuma nota esperando.</span>
            </div>
          )}
        </section>
        <section>
          <div className="secao-titulo">
            <h2>Atividade</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              quem fez o quê
            </span>
          </div>
          <ol className="atividades">
            {db.atividades.slice(0, 7).map((a) => {
              const u = idx.usuarios.get(a.usuarioId);
              return (
                <li key={a.id}>
                  <Avatar nome={u?.nome ?? '?'} tam="p" />
                  <span className="atividades__texto">{a.texto}</span>
                  <time className="atividades__quando" dateTime={a.em}>
                    {tempoRelativo(a.em)}
                  </time>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="hoje__graficos">
        <section>
          <div className="secao-titulo">
            <h2>Fluxo de caixa</h2>
            <div className="acoes">
              <div className="legenda">
                <span>
                  <i style={{ background: 'var(--entrada)' }} /> Entradas
                </span>
                <span>
                  <i style={{ background: 'var(--saida)' }} /> Saídas
                </span>
                <span>
                  <i style={{ background: 'var(--entrada-suave)' }} />
                  <i style={{ background: 'var(--saida-suave)', marginLeft: -4 }} /> Previsto
                </span>
                <span>
                  <i className="linha" style={{ background: 'var(--tinta)' }} /> Saldo no fim do mês
                </span>
              </div>
            </div>
          </div>
          <GraficoFluxoMensal meses={meses} />
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Passe o mouse (ou toque) num mês para ver os valores. <Link to="/fluxo">Tabela completa no Fluxo de caixa →</Link>
          </p>
        </section>
        <section>
          <div className="secao-titulo">
            <h2>Para onde vai o dinheiro</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {mesLongo(mesChave(ref))}
            </span>
          </div>
          <BarrasCategoria linhas={categorias} tipo="pagar" limite={6} />
          <Link to="/relatorios" className="hoje__saldo-link" style={{ marginTop: 14 }}>
            Ver DRE gerencial <Icone nome="avancar" tam={15} />
          </Link>
        </section>
      </div>
    </div>
  );
}
