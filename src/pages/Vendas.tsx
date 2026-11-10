// Vendas: orçamentos, pedidos aprovados (esperando nota) e vendas faturadas.

import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { dataBR, hoje, mesChave, mesLongo } from '../lib/dates';
import { contem, moeda, plural } from '../lib/format';
import { useDb } from '../data/store';
import { indices } from '../data/selectors';
import { descreverCondicao, NOME_ETAPA, totaisDaVenda } from '../data/vendas';
import type { EtapaVenda } from '../data/types';
import { useAuth } from '../auth/auth';
import { useAcoes } from '../components/Acoes';
import { Icone } from '../components/Icone';
import { Botao, CarimboTexto, Entrada, Vazio } from '../components/ui';

const VARIANTE: Record<EtapaVenda, 'aberto' | 'hoje' | 'pago' | 'cancelado'> = { orcamento: 'aberto', pedido: 'hoje', faturada: 'pago', recusada: 'cancelado' };

export function Vendas() {
  const db = useDb();
  const { pode } = useAuth();
  const acoes = useAcoes();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as EtapaVenda) || 'orcamento';
  const [busca, setBusca] = useState('');
  const idx = indices(db);
  const mes = mesChave(hoje());

  const porEtapa = (e: EtapaVenda) => db.vendas.filter((v) => v.etapa === e);
  const faturadoMes = db.notas.filter((n) => n.direcao === 'saida' && n.situacao === 'autorizada' && n.emissao.slice(0, 7) === mes);
  const totalMes = faturadoMes.reduce((a, n) => a + n.totais.nota, 0);
  const abertos = porEtapa('orcamento');
  const pedidos = porEtapa('pedido');

  const lista = useMemo(
    () =>
      db.vendas
        .filter((v) => v.etapa === aba)
        .filter((v) => {
          if (!busca.trim()) return true;
          const c = idx.contatos.get(v.contatoId);
          return String(v.numero).includes(busca) || contem(c?.nome, busca) || contem(c?.fantasia, busca) || v.itens.some((i) => contem(i.descricao, busca));
        })
        .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)),
    [db.vendas, aba, busca, idx],
  );

  const mudarAba = (a: EtapaVenda) => {
    params.set('aba', a);
    setParams(params, { replace: true });
  };

  return (
    <div className="vendas">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Faturamento</p>
          <h1>Vendas</h1>
          <p className="lede">
            Em {mesLongo(mes).split(' de ')[0]}: <strong>{moeda(totalMes)}</strong> faturados em {plural(faturadoMes.length, 'nota', 'notas')}.{' '}
            {abertos.length > 0 && (
              <>
                {plural(abertos.length, 'orçamento espera', 'orçamentos esperam')} resposta (<strong>{moeda(abertos.reduce((a, v) => a + totaisDaVenda(v).total, 0))}</strong>).{' '}
              </>
            )}
            {pedidos.length > 0 && <>{plural(pedidos.length, 'pedido aprovado espera', 'pedidos aprovados esperam')} a nota.</>}
          </p>
        </div>
        <div className="pagina-cabeca__acoes">
          {pode('lancar') && (
            <Botao variante="primario" icone="mais" onClick={() => acoes.novoOrcamento()}>
              Novo orçamento
            </Botao>
          )}
        </div>
      </header>

      <ol className="funil-vendas" aria-label="Etapas da venda">
        {(['orcamento', 'pedido', 'faturada'] as const).map((e, i) => (
          <li key={e} className={aba === e ? 'ativo' : ''}>
            <button type="button" onClick={() => mudarAba(e)}>
              <span className="funil-vendas__passo">{i + 1}</span>
              <span>
                <strong>{e === 'orcamento' ? 'Orçamentos' : e === 'pedido' ? 'Pedidos' : 'Faturadas'}</strong>
                <small>{e === 'orcamento' ? 'o cliente decide' : e === 'pedido' ? 'aprovados, falta a nota' : 'nota emitida, contas a receber'}</small>
              </span>
              <span className="funil-vendas__n num">{porEtapa(e).length}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="filtros__campos" style={{ margin: '18px 0 16px', justifyContent: 'space-between' }}>
        <div className="entrada-grupo filtros__busca">
          <span className="entrada-grupo__prefixo">
            <Icone nome="busca" tam={16} />
          </span>
          <Entrada placeholder="Número, cliente ou produto…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar vendas" />
        </div>
        {porEtapa('recusada').length > 0 && (
          <button type="button" className="link" onClick={() => mudarAba('recusada')}>
            Recusados ({porEtapa('recusada').length})
          </button>
        )}
      </div>

      {lista.length === 0 ? (
        <Vazio
          icone="nota"
          titulo={aba === 'pedido' ? 'Nenhum pedido esperando nota' : aba === 'orcamento' ? 'Nenhum orçamento em aberto' : 'Nada por aqui'}
          texto="Comece por um orçamento: quando o cliente aprovar, ele vira pedido e depois nota."
          acao={
            pode('lancar') ? (
              <Botao icone="mais" onClick={() => acoes.novoOrcamento()}>
                Novo orçamento
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <div className="tabela-rolagem painel">
          <table className="razao">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th className="esconder-movel">Data</th>
                <th className="esconder-movel">Pagamento</th>
                <th className="esconder-movel">Etapa</th>
                <th className="dir">Total</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => {
                const c = idx.contatos.get(v.contatoId);
                const nota = v.notaId ? idx.notas.get(v.notaId) : undefined;
                return (
                  <tr key={v.id} className="clicavel" onClick={() => navegar(`/vendas/${v.id}`)}>
                    <td className="num apertada">{v.numero}</td>
                    <td>
                      <div className="celula-principal">
                        <strong className="truncar">{c ? c.fantasia || c.nome : '-'}</strong>
                        <span className="truncar">{plural(v.itens.length, 'item', 'itens')} · {v.itens[0]?.descricao}</span>
                      </div>
                    </td>
                    <td className="num apertada esconder-movel">{dataBR((v.faturadoEm ?? v.aprovadoEm ?? v.criadoEm).slice(0, 10))}</td>
                    <td className="esconder-movel">{descreverCondicao(v.condicao)}</td>
                    <td className="esconder-movel">
                      <CarimboTexto variante={VARIANTE[v.etapa]}>{nota ? `NF ${nota.numero}` : NOME_ETAPA[v.etapa]}</CarimboTexto>
                    </td>
                    <td className="valor">{moeda(totaisDaVenda(v).total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
