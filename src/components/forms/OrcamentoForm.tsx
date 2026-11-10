// Orçamento: cliente, itens do cadastro de produtos e serviços, desconto, frete, condição de pagamento.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { addDias, hoje } from '../../lib/dates';
import { moeda } from '../../lib/format';
import { useDb } from '../../data/store';
import { salvarOrcamento } from '../../data/actions';
import { CONDICOES, descreverCondicao, totaisDaVenda, vencimentosDaCondicao } from '../../data/vendas';
import type { CondicaoPagamento, ItemVenda, Venda } from '../../data/types';
import { useUsuario } from '../../auth/auth';
import { Camada } from '../Camada';
import { AreaTexto, Botao, Campo, Entrada, EntradaMoeda, Selecao } from '../ui';
import { useAvisos } from '../Avisos';

export function OrcamentoForm({
  aoFechar,
  editando,
  clienteInicial,
  aoCriarContato,
}: {
  aoFechar: () => void;
  editando?: Venda;
  clienteInicial?: string;
  aoCriarContato: (aoSalvar: (id: string) => void) => void;
}) {
  const db = useDb();
  const usuario = useUsuario();
  const navegar = useNavigate();
  const { avisar, erro } = useAvisos();
  const [contatoId, setContatoId] = useState(editando?.contatoId ?? clienteInicial ?? '');
  const [itens, setItens] = useState<ItemVenda[]>(editando?.itens ?? []);
  const [desconto, setDesconto] = useState(editando?.desconto ?? 0);
  const [frete, setFrete] = useState(editando?.frete ?? 0);
  const [condicao, setCondicao] = useState<CondicaoPagamento>(editando?.condicao ?? CONDICOES[1].condicao);
  const [validade, setValidade] = useState(editando?.validade ?? addDias(hoje(), 7));
  const [observacoes, setObservacoes] = useState(editando?.observacoes ?? '');
  const [escolhido, setEscolhido] = useState('');

  const clientes = useMemo(
    () => db.contatos.filter((c) => (c.tipo === 'cliente' || c.tipo === 'ambos') && !c.anonimizadoEm).sort((a, b) => (a.fantasia || a.nome).localeCompare(b.fantasia || b.nome, 'pt-BR')),
    [db.contatos],
  );
  const ativos = db.produtos.filter((p) => p.ativo);
  const totais = totaisDaVenda({ itens, desconto, frete });
  const parcelas = vencimentosDaCondicao(condicao, hoje(), totais.total);
  const condicaoAtual = CONDICOES.findIndex((c) => JSON.stringify(c.condicao) === JSON.stringify(condicao));

  const adicionar = (produtoId: string) => {
    const p = db.produtos.find((x) => x.id === produtoId);
    if (!p) return;
    setItens((l) => {
      const ja = l.find((i) => i.produtoId === p.id);
      if (ja) return l.map((i) => (i === ja ? { ...i, quantidade: i.quantidade + 1, total: (i.quantidade + 1) * i.precoUnitario } : i));
      return [...l, { produtoId: p.id, codigo: p.codigo, descricao: p.nome, unidade: p.unidade, quantidade: 1, precoUnitario: p.preco, total: p.preco }];
    });
    setEscolhido('');
  };
  const mudar = (i: number, campo: 'quantidade' | 'precoUnitario', valor: number) =>
    setItens((l) => l.map((it, j) => (j === i ? { ...it, [campo]: valor, total: Math.round((campo === 'quantidade' ? valor : it.quantidade) * (campo === 'precoUnitario' ? valor : it.precoUnitario)) } : it)));

  const salvar = () => {
    try {
      const v = salvarOrcamento({ id: editando?.id, contatoId, itens, desconto, frete, condicao, validade, observacoes: observacoes.trim() || undefined }, usuario.id);
      avisar(editando ? 'Orçamento atualizado.' : `Orçamento nº ${v.numero} criado. Quando o cliente aprovar, ele vira pedido.`);
      aoFechar();
      navegar(`/vendas/${v.id}`);
    } catch (e) {
      erro(e);
    }
  };

  return (
    <Camada
      aberta
      aoFechar={aoFechar}
      tipo="gaveta"
      largo
      sobretitulo={editando ? `Orçamento nº ${editando.numero}` : 'Novo orçamento'}
      titulo={editando ? 'Editar orçamento' : 'Orçamento para o cliente'}
      rodape={
        <>
          <span className="orcamento__total-rodape num">Total {moeda(totais.total)}</span>
          <span className="espaco" />
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone="check" onClick={salvar}>
            Salvar orçamento
          </Botao>
        </>
      }
    >
      <div className="grade-form">
        <Campo rotulo="Cliente" htmlFor="o-cliente">
          <div style={{ display: 'flex', gap: 8 }}>
            <Selecao id="o-cliente" value={contatoId} onChange={(e) => setContatoId(e.target.value)}>
              <option value="">Escolha o cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fantasia || c.nome}
                </option>
              ))}
            </Selecao>
            <Botao icone="mais" aria-label="Cadastrar cliente" title="Cadastrar cliente" onClick={() => aoCriarContato((id) => setContatoId(id))} />
          </div>
        </Campo>

        <div>
          <span className="campo__rotulo">Itens</span>
          {itens.length > 0 && (
            <ul className="orcamento__itens">
              {itens.map((it, i) => (
                <li key={it.produtoId}>
                  <div className="orcamento__item-nome">
                    <strong>{it.descricao}</strong>
                    <span className="mono">{it.codigo}</span>
                  </div>
                  <label className="orcamento__qtd">
                    <span className="sr-only">Quantidade</span>
                    <Entrada type="number" min={1} step="any" inputMode="decimal" value={it.quantidade} onChange={(e) => mudar(i, 'quantidade', Number(e.target.value) || 0)} />
                    <span className="muted">{it.unidade}</span>
                  </label>
                  <div className="orcamento__preco">
                    <EntradaMoeda valor={it.precoUnitario} aoMudar={(v) => mudar(i, 'precoUnitario', v)} />
                  </div>
                  <strong className="num orcamento__linha-total">{moeda(it.total)}</strong>
                  <Botao tam="p" variante="fantasma" icone="fechar" aria-label={`Tirar ${it.descricao}`} onClick={() => setItens((l) => l.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ul>
          )}
          <Selecao aria-label="Adicionar item" value={escolhido} onChange={(e) => adicionar(e.target.value)} style={{ marginTop: 8 }}>
            <option value="">+ Adicionar produto ou serviço…</option>
            <optgroup label="Produtos">
              {ativos
                .filter((p) => p.tipo === 'produto')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {moeda(p.preco)}/{p.unidade}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Serviços">
              {ativos
                .filter((p) => p.tipo === 'servico')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {moeda(p.preco)}/{p.unidade}
                  </option>
                ))}
            </optgroup>
          </Selecao>
        </div>

        <Campo className="c3 m3" rotulo="Desconto" htmlFor="o-desc">
          <EntradaMoeda id="o-desc" valor={desconto} aoMudar={setDesconto} />
        </Campo>
        <Campo className="c3 m3" rotulo="Frete" htmlFor="o-frete">
          <EntradaMoeda id="o-frete" valor={frete} aoMudar={setFrete} />
        </Campo>
        <Campo className="c4" rotulo="Condição de pagamento" htmlFor="o-cond" dica={parcelas.length > 1 ? parcelas.map((p) => moeda(p.valor)).join(' + ') : undefined}>
          <Selecao id="o-cond" value={String(condicaoAtual)} onChange={(e) => setCondicao(CONDICOES[Number(e.target.value)]?.condicao ?? condicao)}>
            {condicaoAtual < 0 && <option value="-1">{descreverCondicao(condicao)}</option>}
            {CONDICOES.map((c, i) => (
              <option key={c.rotulo} value={i}>
                {c.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo className="c2" rotulo="Válido até" htmlFor="o-val">
          <Entrada id="o-val" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
        </Campo>
        <Campo rotulo="Observações para o cliente" htmlFor="o-obs">
          <AreaTexto id="o-obs" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: entrega em duas viagens" />
        </Campo>

        <dl className="orcamento__totais">
          <div>
            <dt>Itens</dt>
            <dd className="num">{moeda(totais.subtotal)}</dd>
          </div>
          {desconto > 0 && (
            <div>
              <dt>Desconto</dt>
              <dd className="num">− {moeda(desconto)}</dd>
            </div>
          )}
          {frete > 0 && (
            <div>
              <dt>Frete</dt>
              <dd className="num">+ {moeda(frete)}</dd>
            </div>
          )}
          <div className="orcamento__total">
            <dt>Total</dt>
            <dd>{moeda(totais.total)}</dd>
          </div>
        </dl>
      </div>
    </Camada>
  );
}
