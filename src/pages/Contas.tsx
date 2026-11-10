// Contas a pagar / a receber: o "livro" de títulos, agrupado por dia, com baixa em lote.

import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { addDias, dataBR, diaMes, hoje, mesChave, relativoDias, semanaCurta } from '../lib/dates';
import { contem, moeda, plural } from '../lib/format';
import { gerarCsv, baixarArquivo } from '../lib/util';
import { mascaraDocumento } from '../lib/br';
import { useDb } from '../data/store';
import { indices, resumoTipo, statusDe, type Status } from '../data/selectors';
import type { Lancamento, TipoLancamento } from '../data/types';
import { useAuth } from '../auth/auth';
import { useAcoes } from '../components/Acoes';
import { Icone } from '../components/Icone';
import { Botao, Caixa, Carimbo, Entrada, Segmentado, Selecao, Vazio } from '../components/ui';
import { FORMAS } from '../components/forms/LancamentoForm';

type Periodo = 'abertos' | 'vencidos' | '7d' | '30d' | 'mes' | 'quitados' | 'todos' | 'dia';

const NOMES_STATUS: Record<Status, string> = { pago: 'Quitado', vencido: 'Vencido', hoje: 'Vence hoje', aberto: 'Em aberto', cancelado: 'Cancelado' };

export function Contas() {
  const { tipo: tipoParam } = useParams();
  const tipo: TipoLancamento = tipoParam === 'receber' ? 'receber' : 'pagar';
  if (tipoParam !== 'pagar' && tipoParam !== 'receber') return <Navigate to="/contas/pagar" replace />;
  return <ContasTipo key={tipo} tipo={tipo} />;
}

function ContasTipo({ tipo }: { tipo: TipoLancamento }) {
  const db = useDb();
  const { pode } = useAuth();
  const acoes = useAcoes();
  const [params, setParams] = useSearchParams();
  const ref = hoje();
  const idx = indices(db);
  const pagar = tipo === 'pagar';

  const periodoInicial = (params.get('de') ? 'dia' : (params.get('periodo') as Periodo)) || '30d';
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);
  const [busca, setBusca] = useState(params.get('q') ?? '');
  const [categoria, setCategoria] = useState('');
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const dia = params.get('de');

  // ?id=… abre o detalhe (links da busca e de outras telas)
  useEffect(() => {
    const id = params.get('id');
    if (id) {
      acoes.verLancamento(id);
      params.delete('id');
      setParams(params, { replace: true });
    }
  }, [params, setParams, acoes]);

  const doTipo = useMemo(() => db.lancamentos.filter((l) => l.tipo === tipo), [db.lancamentos, tipo]);
  const resumo = useMemo(() => resumoTipo(db, tipo, ref), [db, tipo, ref]);

  const filtroPeriodo = (l: Lancamento): boolean => {
    const st = statusDe(l, ref);
    switch (periodo) {
      case 'abertos':
        return st === 'aberto' || st === 'vencido' || st === 'hoje';
      case 'vencidos':
        return st === 'vencido';
      case '7d':
        return (st === 'aberto' || st === 'hoje' || st === 'vencido') && l.vencimento <= addDias(ref, 6);
      case '30d':
        return (st === 'aberto' || st === 'hoje' || st === 'vencido') && l.vencimento <= addDias(ref, 29);
      case 'mes':
        return mesChave(l.vencimento) === mesChave(ref) && st !== 'cancelado';
      case 'quitados':
        return st === 'pago' && !!l.baixa && l.baixa.data >= addDias(ref, -90);
      case 'dia':
        return l.vencimento === dia && st !== 'cancelado';
      default:
        return true;
    }
  };

  const contagens = useMemo(() => {
    const c: Record<Periodo, number> = { abertos: 0, vencidos: 0, '7d': 0, '30d': 0, mes: 0, quitados: 0, todos: doTipo.length, dia: 0 };
    for (const l of doTipo) {
      const st = statusDe(l, ref);
      if (st === 'aberto' || st === 'vencido' || st === 'hoje') c.abertos++;
      if (st === 'vencido') c.vencidos++;
      if ((st === 'aberto' || st === 'hoje' || st === 'vencido') && l.vencimento <= addDias(ref, 6)) c['7d']++;
      if ((st === 'aberto' || st === 'hoje' || st === 'vencido') && l.vencimento <= addDias(ref, 29)) c['30d']++;
      if (mesChave(l.vencimento) === mesChave(ref) && st !== 'cancelado') c.mes++;
      if (st === 'pago' && l.baixa && l.baixa.data >= addDias(ref, -90)) c.quitados++;
    }
    return c;
  }, [doTipo, ref]);

  const lista = useMemo(() => {
    const filtrados = doTipo.filter(filtroPeriodo).filter((l) => {
      if (categoria && l.categoriaId !== categoria) return false;
      if (!busca.trim()) return true;
      const c = l.contatoId ? idx.contatos.get(l.contatoId) : undefined;
      return contem(l.descricao, busca) || contem(l.documento, busca) || contem(c?.nome, busca) || contem(c?.fantasia, busca) || moeda(l.valor).includes(busca);
    });
    const porBaixa = periodo === 'quitados';
    return filtrados.sort((a, b) => {
      if (porBaixa) return (b.baixa?.data ?? '') < (a.baixa?.data ?? '') ? -1 : 1;
      if (periodo === 'todos') return a.vencimento < b.vencimento ? 1 : -1;
      return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : b.valor - a.valor;
    });
  }, [doTipo, periodo, busca, categoria, dia, idx]);

  const grupos = useMemo(() => {
    const g: { chave: string; rotulo: string; itens: Lancamento[]; total: number }[] = [];
    for (const l of lista) {
      const data = periodo === 'quitados' ? l.baixa!.data : l.vencimento;
      const vencidoAgrupado = periodo !== 'quitados' && periodo !== 'todos' && l.vencimento < ref && !l.baixa;
      const chave = vencidoAgrupado ? 'vencidos' : data;
      let grupo = g[g.length - 1];
      if (!grupo || grupo.chave !== chave) {
        const rotulo = vencidoAgrupado
          ? 'Vencidos'
          : data === ref
            ? `Hoje · ${semanaCurta(data)}, ${diaMes(data)}`
            : data === addDias(ref, 1)
              ? `Amanhã · ${semanaCurta(data)}, ${diaMes(data)}`
              : `${semanaCurta(data)}, ${diaMes(data)}${data.slice(0, 4) !== ref.slice(0, 4) ? ` de ${data.slice(0, 4)}` : ''}`;
        grupo = { chave, rotulo, itens: [], total: 0 };
        g.push(grupo);
      }
      grupo.itens.push(l);
      grupo.total += l.baixa?.valorPago ?? l.valor;
    }
    return g;
  }, [lista, periodo, ref]);

  const selecionados = lista.filter((l) => selecao.has(l.id));
  const baixaveis = selecionados.filter((l) => !l.baixa && !l.cancelado);
  const totalSel = selecionados.reduce((a, l) => a + l.valor, 0);
  const todosMarcados = lista.length > 0 && lista.every((l) => selecao.has(l.id));
  const totalLista = lista.reduce((a, l) => a + (l.baixa?.valorPago ?? l.valor), 0);

  const alternar = (id: string) =>
    setSelecao((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exportar = () => {
    const linhas = [
      ['Tipo', 'Descrição', 'Contato', 'CPF/CNPJ', 'Categoria', 'Emissão', 'Vencimento', 'Valor', 'Situação', 'Data da baixa', 'Valor pago', 'Conta', 'Documento'],
      ...lista.map((l) => {
        const c = l.contatoId ? idx.contatos.get(l.contatoId) : undefined;
        return [
          pagar ? 'A pagar' : 'A receber',
          l.descricao,
          c ? c.fantasia || c.nome : '',
          c?.documento ? mascaraDocumento(c.documento) : '',
          idx.categorias.get(l.categoriaId ?? '')?.nome ?? '',
          dataBR(l.emissao),
          dataBR(l.vencimento),
          (l.valor / 100).toFixed(2).replace('.', ','),
          NOMES_STATUS[statusDe(l, ref)],
          l.baixa ? dataBR(l.baixa.data) : '',
          l.baixa ? (l.baixa.valorPago / 100).toFixed(2).replace('.', ',') : '',
          idx.contas.get(l.baixa?.contaId ?? l.contaId ?? '')?.nome ?? '',
          l.documento ?? '',
        ];
      }),
    ];
    baixarArquivo(`prumo-${pagar ? 'contas-a-pagar' : 'contas-a-receber'}-${ref}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  const categorias = db.categorias.filter((c) => c.tipo === (pagar ? 'despesa' : 'receita'));

  return (
    <div className="contas">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">{pagar ? 'Contas a pagar' : 'Contas a receber'}</p>
          <h1>{pagar ? 'A pagar' : 'A receber'}</h1>
          <p className="lede">
            Em aberto: <strong>{moeda(resumo.aberto.total)}</strong> em {plural(resumo.aberto.qtd, 'título', 'títulos')}
            {resumo.vencido.qtd > 0 ? (
              <>
                , dos quais <strong className="critico-txt">{moeda(resumo.vencido.total)}</strong> {pagar ? 'já venceram' : 'estão atrasados'}.{' '}
              </>
            ) : (
              <>, nenhum vencido. </>
            )}
            {pagar ? 'Pago' : 'Recebido'} este mês: <strong>{moeda(resumo.quitadoMes.total)}</strong>.
          </p>
        </div>
        <div className="pagina-cabeca__acoes">
          <Botao icone="baixar" onClick={exportar} title="Exporta a lista filtrada para Excel (CSV)">
            Exportar
          </Botao>
          {pode('lancar') && (
            <Botao variante="primario" icone="mais" onClick={() => acoes.novoLancamento({ tipo })}>
              {pagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
            </Botao>
          )}
        </div>
      </header>

      <div className="filtros">
        <Segmentado
          rotulo="Período"
          valor={periodo}
          aoMudar={(p) => {
            setPeriodo(p);
            setSelecao(new Set());
            if (params.get('de')) {
              params.delete('de');
              params.delete('ate');
              setParams(params, { replace: true });
            }
          }}
          opcoes={[
            ...(periodo === 'dia' && dia ? [{ valor: 'dia' as Periodo, rotulo: `Dia ${dataBR(dia).slice(0, 5)}` }] : []),
            { valor: 'vencidos', rotulo: pagar ? 'Vencidas' : 'Atrasadas', contagem: contagens.vencidos },
            { valor: '7d', rotulo: '7 dias', contagem: contagens['7d'] },
            { valor: '30d', rotulo: '30 dias', contagem: contagens['30d'] },
            { valor: 'mes', rotulo: 'Este mês', contagem: contagens.mes },
            { valor: 'abertos', rotulo: 'Tudo em aberto', contagem: contagens.abertos },
            { valor: 'quitados', rotulo: pagar ? 'Pagas' : 'Recebidas', contagem: contagens.quitados },
            { valor: 'todos', rotulo: 'Todas' },
          ]}
        />
        <div className="filtros__campos">
          <div className="entrada-grupo filtros__busca">
            <span className="entrada-grupo__prefixo">
              <Icone nome="busca" tam={16} />
            </span>
            <Entrada placeholder="Buscar descrição, contato, documento…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
          </div>
          <Selecao aria-label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="filtros__cat">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio
          icone={pagar ? 'pagar' : 'receber'}
          titulo={periodo === 'vencidos' ? 'Nada vencido. Bom sinal.' : 'Nenhum título por aqui'}
          texto={busca ? `Nada encontrado para “${busca}”.` : 'Mude o período ou lance uma conta nova.'}
          acao={
            pode('lancar') ? (
              <Botao icone="mais" onClick={() => acoes.novoLancamento({ tipo })}>
                {pagar ? 'Nova conta a pagar' : 'Nova conta a receber'}
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <div className="livro" role="table" aria-label={pagar ? 'Contas a pagar' : 'Contas a receber'}>
          <div className="livro__cabeca" role="row">
            <span role="columnheader" className="livro__sel">
              {pode('baixar') && (
                <Caixa
                  aria-label="Selecionar todos"
                  checked={todosMarcados}
                  aria-checked={todosMarcados ? 'true' : selecao.size ? 'mixed' : 'false'}
                  onChange={() => setSelecao(todosMarcados ? new Set() : new Set(lista.map((l) => l.id)))}
                />
              )}
            </span>
            <span role="columnheader">{periodo === 'quitados' ? 'Baixa' : 'Vencimento'}</span>
            <span role="columnheader">Descrição</span>
            <span role="columnheader" className="livro__cat">
              Categoria
            </span>
            <span role="columnheader">Situação</span>
            <span role="columnheader" className="livro__valor">
              Valor
            </span>
          </div>
          {grupos.map((g) => (
            <div role="rowgroup" key={g.chave}>
              <div className={`livro__grupo${g.chave === 'vencidos' ? ' livro__grupo--vencido' : ''}`} role="row">
                <span role="cell">{g.rotulo}</span>
                <span role="cell" className="num">
                  {plural(g.itens.length, 'título', 'títulos')} · {moeda(g.total)}
                </span>
              </div>
              {g.itens.map((l) => {
                const st = statusDe(l, ref);
                const c = l.contatoId ? idx.contatos.get(l.contatoId) : undefined;
                const sel = selecao.has(l.id);
                const data = periodo === 'quitados' && l.baixa ? l.baixa.data : l.vencimento;
                return (
                  <div
                    key={l.id}
                    role="row"
                    tabIndex={0}
                    className={`livro__linha${sel ? ' livro__linha--sel' : ''}${st === 'cancelado' ? ' livro__linha--cancelada' : ''}`}
                    onClick={() => acoes.verLancamento(l.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') acoes.verLancamento(l.id);
                      if (e.key === ' ' && pode('baixar')) {
                        e.preventDefault();
                        alternar(l.id);
                      }
                    }}
                  >
                    <span role="cell" className="livro__sel">
                      {pode('baixar') && <Caixa aria-label={`Selecionar ${l.descricao}`} checked={sel} onChange={() => alternar(l.id)} />}
                    </span>
                    <span role="cell" className="livro__venc num">
                      {dataBR(data).slice(0, 5)}
                      <small>{st === 'vencido' ? relativoDias(l.vencimento) : semanaCurta(data)}</small>
                    </span>
                    <span role="cell" className="livro__desc">
                      <strong>{l.descricao}</strong>
                      <span>
                        {[c ? c.fantasia || c.nome : FORMAS.find((f) => f.valor === l.forma)?.rotulo, l.documento].filter(Boolean).join(' · ') || '-'}
                      </span>
                    </span>
                    <span role="cell" className="livro__cat">
                      {idx.categorias.get(l.categoriaId ?? '')?.nome ?? '-'}
                    </span>
                    <span role="cell" className="livro__status">
                      <Carimbo status={st} tipo={tipo} />
                    </span>
                    <span role="cell" className="livro__valor num">
                      {moeda(l.baixa?.valorPago ?? l.valor)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="livro__rodape" role="row">
            <span role="cell">{plural(lista.length, 'título', 'títulos')}</span>
            <span role="cell" className="num">
              {moeda(totalLista)}
            </span>
          </div>
        </div>
      )}

      {selecao.size > 0 && (
        <div className="barra-lote" role="region" aria-label="Ações em lote">
          <span>
            <strong>{plural(selecao.size, 'selecionado', 'selecionados')}</strong> · <span className="num">{moeda(totalSel)}</span>
          </span>
          <span className="espaco" />
          <Botao variante="fantasma" tam="p" onClick={() => setSelecao(new Set())}>
            Limpar
          </Botao>
          {pode('baixar') && (
            <Botao variante="primario" tam="p" icone="carimbo" disabled={baixaveis.length === 0} onClick={() => acoes.darBaixa(baixaveis.map((l) => l.id), () => setSelecao(new Set()))}>
              {pagar ? 'Pagar' : 'Receber'} {baixaveis.length > 0 && baixaveis.length !== selecao.size ? `${baixaveis.length} em aberto` : 'selecionados'}
            </Botao>
          )}
        </div>
      )}
    </div>
  );
}
