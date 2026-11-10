// Documento da venda: o orçamento que vai para o cliente, o pedido aprovado e, depois da nota,
// as contas a receber com boleto/PIX.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { dataBR, hoje } from '../lib/dates';
import { moeda, numero, plural } from '../lib/format';
import { mascaraDocumento } from '../lib/br';
import { useDb } from '../data/store';
import { indices, statusDe } from '../data/selectors';
import { aprovarOrcamento, emitirNotaDoPedido, recusarOrcamento } from '../data/actions';
import { descreverCondicao, NOME_ETAPA, totaisDaVenda, vencimentosDaCondicao } from '../data/vendas';
import { useAuth, useUsuario } from '../auth/auth';
import { useAcoes } from '../components/Acoes';
import { useAvisos } from '../components/Avisos';
import { Camada } from '../components/Camada';
import { Icone } from '../components/Icone';
import { Botao, Carimbo, CarimboTexto, Vazio } from '../components/ui';

const PASSOS = ['Orçamento', 'Pedido', 'Nota fiscal', 'Contas a receber'];

export function VendaDetalhe() {
  const { id } = useParams();
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const acoes = useAcoes();
  const navegar = useNavigate();
  const { avisar, erro } = useAvisos();
  const [confirmar, setConfirmar] = useState(false);
  const v = db.vendas.find((x) => x.id === id);
  const idx = indices(db);

  if (!v) {
    return (
      <Vazio
        icone="nota"
        titulo="Venda não encontrada"
        acao={
          <Link to="/vendas" className="btn btn--secundario">
            Voltar para vendas
          </Link>
        }
      />
    );
  }

  const c = idx.contatos.get(v.contatoId);
  const t = totaisDaVenda(v);
  const nota = v.notaId ? idx.notas.get(v.notaId) : undefined;
  const titulos = nota ? (idx.lancamentosPorNota.get(nota.id) ?? []).sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1)) : [];
  const previsao = vencimentosDaCondicao(v.condicao, hoje(), t.total);
  const passo = v.etapa === 'orcamento' ? 0 : v.etapa === 'pedido' ? 1 : v.etapa === 'faturada' ? 3 : 0;
  const titulo = v.etapa === 'orcamento' ? `Orçamento nº ${v.numero}` : v.etapa === 'pedido' ? `Pedido nº ${v.numero}` : v.etapa === 'faturada' ? `Venda nº ${v.numero}` : `Orçamento nº ${v.numero} (recusado)`;

  const emitir = () => {
    try {
      const n = emitirNotaDoPedido(v.id, usuario.id);
      const qtd = (idx.lancamentosPorNota.get(n.id) ?? []).length || Math.max(1, n.duplicatas.length);
      setConfirmar(false);
      avisar(`NF ${n.numero} autorizada (simulação). ${plural(qtd, 'conta a receber lançada', 'contas a receber lançadas')}.`, { duracao: 7000 });
    } catch (e) {
      erro(e);
    }
  };

  return (
    <div className="venda">
      <Link to="/vendas" className="voltar nao-imprimir">
        <Icone nome="voltar" tam={16} /> Vendas
      </Link>

      <ol className="trilha-venda nao-imprimir" aria-label="Andamento da venda">
        {PASSOS.map((p, i) => (
          <li key={p} className={v.etapa === 'recusada' ? '' : i < passo || (i === passo && v.etapa === 'faturada') ? 'feito' : i === passo ? 'atual' : ''}>
            <span className="trilha-venda__marca">{i < passo || (v.etapa === 'faturada' && i <= passo) ? <Icone nome="check" tam={13} traco={2.4} /> : i + 1}</span>
            {p}
          </li>
        ))}
      </ol>

      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">
            {NOME_ETAPA[v.etapa]} · criado em {dataBR(v.criadoEm.slice(0, 10))}
            {v.etapa === 'orcamento' ? ` · válido até ${dataBR(v.validade)}` : ''}
          </p>
          <h1>{titulo}</h1>
          <p className="lede">
            Para <strong>{c ? c.fantasia || c.nome : '-'}</strong> · {plural(v.itens.length, 'item', 'itens')} · {descreverCondicao(v.condicao)}
          </p>
        </div>
        <div className="pagina-cabeca__acoes nao-imprimir">
          {v.etapa === 'orcamento' && pode('lancar') && (
            <>
              <Botao icone="imprimir" onClick={() => window.print()}>
                Imprimir
              </Botao>
              <Botao icone="editar" onClick={() => acoes.editarOrcamento(v.id)}>
                Editar
              </Botao>
              <Botao
                variante="fantasma"
                onClick={() => {
                  recusarOrcamento(v.id, usuario.id);
                  avisar('Orçamento marcado como recusado.');
                }}
              >
                Recusado
              </Botao>
              <Botao
                variante="primario"
                icone="check"
                onClick={() => {
                  try {
                    aprovarOrcamento(v.id, usuario.id);
                    avisar(`Aprovado: agora é o pedido nº ${v.numero}. Próximo passo: emitir a nota.`);
                  } catch (e) {
                    erro(e);
                  }
                }}
              >
                Cliente aprovou
              </Botao>
            </>
          )}
          {v.etapa === 'pedido' && pode('lancar') && (
            <Botao variante="primario" icone="nota" onClick={() => setConfirmar(true)}>
              Emitir nota fiscal
            </Botao>
          )}
          {nota && (
            <Botao icone="nota" onClick={() => navegar(`/notas/${nota.id}`)}>
              Ver NF {nota.numero}
            </Botao>
          )}
        </div>
      </header>

      <div className="danfe venda__documento">
        <section className="danfe__partes">
          <div>
            <span className="rotulo">De</span>
            <strong>{db.empresa.razaoSocial}</strong>
            <span className="mono">{mascaraDocumento(db.empresa.cnpj)}</span>
            <span className="muted">
              {db.empresa.municipio} / {db.empresa.uf}
            </span>
          </div>
          <div>
            <span className="rotulo">Para</span>
            <strong>{c?.nome ?? '-'}</strong>
            {c?.documento && <span className="mono">{mascaraDocumento(c.documento)}</span>}
            <span className="muted">{[c?.cidade, c?.uf].filter(Boolean).join(' / ')}</span>
          </div>
          <div>
            <span className="rotulo">Pagamento</span>
            <strong>{descreverCondicao(v.condicao)}</strong>
            <span className="muted">
              {(nota ? nota.duplicatas.length ? nota.duplicatas : [{ vencimento: nota.emissao.slice(0, 10), valor: nota.totais.nota }] : previsao)
                .map((p) => `${dataBR(p.vencimento).slice(0, 5)} ${moeda(p.valor)}`)
                .join(' · ')}
            </span>
          </div>
        </section>

        <section>
          <div className="tabela-rolagem">
            <table className="razao">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="dir">Qtd</th>
                  <th className="dir esconder-movel">Preço</th>
                  <th className="dir">Total</th>
                </tr>
              </thead>
              <tbody>
                {v.itens.map((it) => (
                  <tr key={it.produtoId + it.codigo}>
                    <td>
                      <div className="celula-principal">
                        <strong>{it.descricao}</strong>
                        <span className="mono">{it.codigo}</span>
                      </div>
                    </td>
                    <td className="dir num apertada">
                      {numero(it.quantidade, it.quantidade % 1 ? 2 : 0)} {it.unidade}
                    </td>
                    <td className="valor esconder-movel">{moeda(it.precoUnitario)}</td>
                    <td className="valor">{moeda(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="orcamento__totais" style={{ marginTop: 14 }}>
            <div>
              <dt>Itens</dt>
              <dd className="num">{moeda(t.subtotal)}</dd>
            </div>
            {v.desconto > 0 && (
              <div>
                <dt>Desconto</dt>
                <dd className="num">− {moeda(v.desconto)}</dd>
              </div>
            )}
            {v.frete > 0 && (
              <div>
                <dt>Frete</dt>
                <dd className="num">+ {moeda(v.frete)}</dd>
              </div>
            )}
            <div className="orcamento__total">
              <dt>Total</dt>
              <dd>{moeda(t.total)}</dd>
            </div>
          </dl>
          {v.observacoes && <p className="muted" style={{ marginTop: 12 }}>{v.observacoes}</p>}
        </section>

        {nota && (
          <section>
            <h2 className="danfe__h2">Contas a receber</h2>
            <ul className="lista-titulos">
              {titulos.map((l) => (
                <li key={l.id} className="titulo-linha">
                  <button type="button" className="titulo-linha__principal" onClick={() => acoes.verLancamento(l.id)}>
                    <span className="titulo-linha__sentido titulo-linha__sentido--receber">
                      <Icone nome="receber" tam={15} />
                    </span>
                    <span className="titulo-linha__texto">
                      <strong className="truncar">
                        {l.parcela && l.parcela.de > 1 ? `Parcela ${l.parcela.n}/${l.parcela.de}` : 'Parcela única'} · vence {dataBR(l.vencimento)}
                      </strong>
                      <span className="truncar">{l.cobranca ? (l.baixa ? 'pago pelo boleto/PIX' : 'boleto/PIX gerado') : 'sem boleto ainda'}</span>
                    </span>
                    <span className="titulo-linha__valor num">{moeda(l.valor)}</span>
                  </button>
                  <span className="titulo-linha__acao">
                    <Carimbo status={statusDe(l)} tipo="receber" />
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Toque numa parcela e use <strong>Gerar boleto/PIX</strong>; depois, <strong>Simular pagamento</strong>.
            </p>
          </section>
        )}
      </div>

      {v.etapa === 'pedido' && (
        <p className="muted nao-imprimir" style={{ fontSize: 13, marginTop: 12 }}>
          Aprovado em {dataBR(v.aprovadoEm?.slice(0, 10))}. Ao emitir a nota, as contas a receber são lançadas sozinhas.
        </p>
      )}

      {confirmar && (
        <Camada
          aberta
          aoFechar={() => setConfirmar(false)}
          sobretitulo={
            <>
              Pedido nº {v.numero} <span className="selo-simulacao">simulação</span>
            </>
          }
          titulo="Emitir a nota fiscal?"
          rodape={
            <>
              <span className="espaco" />
              <Botao variante="fantasma" onClick={() => setConfirmar(false)}>
                Voltar
              </Botao>
              <Botao variante="primario" icone="nota" onClick={emitir}>
                Emitir NF-e de {moeda(t.total)}
              </Botao>
            </>
          }
        >
          <dl className="lista-definicao">
            <dt>Cliente</dt>
            <dd>{c?.nome}</dd>
            <dt>Documento</dt>
            <dd className="mono">{c?.documento ? mascaraDocumento(c.documento) : 'sem CPF/CNPJ'}</dd>
            <dt>Valor</dt>
            <dd className="num">{moeda(t.total)}</dd>
            <dt>Parcelas</dt>
            <dd>{previsao.map((p) => `${dataBR(p.vencimento)} · ${moeda(p.valor)}`).join('; ')}</dd>
          </dl>
          <div className="aviso-caixa" style={{ marginTop: 16 }}>
            <Icone nome="info" />
            <span>Nesta demonstração a nota é simulada: recebe número e chave de acesso, mas nada é enviado à SEFAZ.</span>
          </div>
          {!c?.documento && <CarimboTexto variante="vencido">Cadastre o CPF ou CNPJ do cliente antes</CarimboTexto>}
        </Camada>
      )}
    </div>
  );
}
