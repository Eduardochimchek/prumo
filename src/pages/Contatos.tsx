import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { dataBR, hoje } from '../lib/dates';
import { contem, moeda, plural } from '../lib/format';
import { documentoProtegido, mascaraDocumento, tipoDocumento } from '../lib/br';
import { useDb } from '../data/store';
import { emAberto, statusDe } from '../data/selectors';
import { anonimizarContato, excluirContato } from '../data/actions';
import type { Contato, TipoContato } from '../data/types';
import { useAuth, useUsuario } from '../auth/auth';
import { useAcoes } from '../components/Acoes';
import { useAvisos } from '../components/Avisos';
import { Camada } from '../components/Camada';
import { Icone } from '../components/Icone';
import { Avatar, Botao, Carimbo, Entrada, Segmentado, Vazio } from '../components/ui';

const NOME_TIPO: Record<TipoContato, string> = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Cliente e fornecedor' };

function FichaContato({ contato, aoFechar }: { contato: Contato | null; aoFechar: () => void }) {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const acoes = useAcoes();
  const { avisar, erro } = useAvisos();
  const titulos = useMemo(
    () => (contato ? db.lancamentos.filter((l) => l.contatoId === contato.id && !l.cancelado).sort((a, b) => (a.vencimento < b.vencimento ? 1 : -1)) : []),
    [db.lancamentos, contato],
  );
  const notas = contato ? db.notas.filter((n) => n.contatoId === contato.id) : [];
  const abertoPagar = titulos.filter((l) => l.tipo === 'pagar' && emAberto(l)).reduce((a, l) => a + l.valor, 0);
  const abertoReceber = titulos.filter((l) => l.tipo === 'receber' && emAberto(l)).reduce((a, l) => a + l.valor, 0);
  const vencidos = titulos.filter((l) => statusDe(l) === 'vencido');
  const movimentado = titulos.filter((l) => l.baixa).reduce((a, l) => a + (l.baixa?.valorPago ?? 0), 0);

  return (
    <Camada
      aberta={!!contato}
      aoFechar={aoFechar}
      tipo="gaveta"
      sobretitulo={contato ? NOME_TIPO[contato.tipo] : ''}
      titulo={contato ? contato.fantasia || contato.nome : ''}
      rodape={
        contato && (
          <>
            {pode('contatos') && titulos.length === 0 && notas.length === 0 && (
              <Botao
                variante="fantasma"
                icone="lixeira"
                onClick={() => {
                  if (!window.confirm(`Excluir ${contato.fantasia || contato.nome}?`)) return;
                  try {
                    excluirContato(contato.id, usuario.id);
                    avisar('Contato excluído.');
                    aoFechar();
                  } catch (e) {
                    erro(e);
                  }
                }}
              >
                Excluir
              </Botao>
            )}
            {pode('contatos') && (titulos.length > 0 || notas.length > 0) && !contato.anonimizadoEm && (
              <Botao
                variante="fantasma"
                icone="escudo"
                title="Pedido de exclusão do titular (LGPD): apaga nome, documento e contatos e mantém os valores pelo prazo legal"
                onClick={() => {
                  if (
                    !window.confirm(
                      'Anonimizar os dados pessoais deste contato (LGPD)? Nome, CPF/CNPJ, e-mail, telefone e endereço serão apagados e o nome sai das descrições. Os valores e as notas fiscais ficam guardados pelo prazo legal. Não tem volta.',
                    )
                  )
                    return;
                  try {
                    anonimizarContato(contato.id, usuario.id);
                    avisar('Dados pessoais anonimizados. O histórico financeiro foi mantido.');
                  } catch (e) {
                    erro(e);
                  }
                }}
              >
                Anonimizar
              </Botao>
            )}
            <span className="espaco" />
            {pode('contatos') && !contato.anonimizadoEm && (
              <Botao icone="editar" onClick={() => acoes.editarContato(contato.id)}>
                Editar
              </Botao>
            )}
            {pode('lancar') && (
              <Botao variante="primario" icone="mais" onClick={() => acoes.novoLancamento({ tipo: contato.tipo === 'cliente' ? 'receber' : 'pagar', contatoId: contato.id })}>
                Lançar conta
              </Botao>
            )}
          </>
        )
      }
    >
      {contato && (
        <>
          <p className="muted">{contato.nome}</p>
          {contato.anonimizadoEm && (
            <div className="aviso-caixa" style={{ marginTop: 12 }}>
              <Icone nome="escudo" />
              <span>Dados pessoais anonimizados em {dataBR(contato.anonimizadoEm.slice(0, 10))} a pedido do titular. O histórico financeiro é mantido pelo prazo legal.</span>
            </div>
          )}
          <dl className="lista-definicao" style={{ marginTop: 14 }}>
            <dt>{contato.documento ? tipoDocumento(contato.documento) : 'Documento'}</dt>
            <dd className="mono">{contato.documento ? (pode('contatos') ? mascaraDocumento(contato.documento) : documentoProtegido(contato.documento)) : '-'}</dd>
            <dt>E-mail</dt>
            <dd>{contato.email ? <a href={`mailto:${contato.email}`}>{contato.email}</a> : '-'}</dd>
            <dt>Telefone</dt>
            <dd>{contato.telefone ? <a href={`tel:${contato.telefone.replace(/\D/g, '')}`}>{contato.telefone}</a> : '-'}</dd>
            <dt>Cidade</dt>
            <dd>{[contato.cidade, contato.uf].filter(Boolean).join(' / ') || '-'}</dd>
            {contato.endereco && (
              <>
                <dt>Endereço</dt>
                <dd>{contato.endereco}</dd>
              </>
            )}
            <dt>Cadastrado em</dt>
            <dd className="num">{dataBR(contato.criadoEm.slice(0, 10))}</dd>
          </dl>

          <div className="ficha__numeros">
            {abertoReceber > 0 && (
              <div>
                <span className="rotulo">A receber</span>
                <strong>{moeda(abertoReceber)}</strong>
              </div>
            )}
            {abertoPagar > 0 && (
              <div>
                <span className="rotulo">A pagar</span>
                <strong>{moeda(abertoPagar)}</strong>
              </div>
            )}
            <div>
              <span className="rotulo">Já movimentado</span>
              <strong>{moeda(movimentado)}</strong>
            </div>
            <div>
              <span className="rotulo">Notas</span>
              <strong>{notas.length}</strong>
            </div>
          </div>
          {vencidos.length > 0 && (
            <div className="aviso-caixa aviso-caixa--critico" style={{ marginTop: 14 }}>
              <Icone nome="alerta" />
              <span>
                {plural(vencidos.length, 'título vencido', 'títulos vencidos')} somando {moeda(vencidos.reduce((a, l) => a + l.valor, 0))}.
              </span>
            </div>
          )}

          <h3 className="detalhe__h3" style={{ marginTop: 24 }}>
            Últimos lançamentos
          </h3>
          {titulos.length === 0 ? (
            <p className="muted">Nenhum lançamento ainda.</p>
          ) : (
            <ul className="lista-titulos">
              {titulos.slice(0, 12).map((l) => (
                <li key={l.id} className="titulo-linha">
                  <button type="button" className="titulo-linha__principal" onClick={() => acoes.verLancamento(l.id)}>
                    <span className={`titulo-linha__sentido titulo-linha__sentido--${l.tipo}`}>
                      <Icone nome={l.tipo} tam={15} />
                    </span>
                    <span className="titulo-linha__texto">
                      <strong className="truncar">{l.descricao}</strong>
                      <span className="truncar">vence {dataBR(l.vencimento)}</span>
                    </span>
                    <span className="titulo-linha__valor num">{moeda(l.valor)}</span>
                  </button>
                  <span className="titulo-linha__acao">
                    <Carimbo status={statusDe(l)} tipo={l.tipo} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {contato.observacoes && (
            <>
              <h3 className="detalhe__h3" style={{ marginTop: 24 }}>
                Observações
              </h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{contato.observacoes}</p>
            </>
          )}
        </>
      )}
    </Camada>
  );
}

export function Contatos() {
  const db = useDb();
  const { pode } = useAuth();
  const acoes = useAcoes();
  const [params, setParams] = useSearchParams();
  const [filtro, setFiltro] = useState<'todos' | 'cliente' | 'fornecedor'>('todos');
  const [busca, setBusca] = useState('');
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const ref = hoje();

  useEffect(() => {
    const id = params.get('id');
    if (id) {
      setAbertoId(id);
      params.delete('id');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const saldoPorContato = useMemo(() => {
    const m = new Map<string, { receber: number; pagar: number; vencido: number }>();
    for (const l of db.lancamentos) {
      if (!l.contatoId || !emAberto(l)) continue;
      const s = m.get(l.contatoId) ?? { receber: 0, pagar: 0, vencido: 0 };
      s[l.tipo] += l.valor;
      if (l.vencimento < ref) s.vencido += l.valor;
      m.set(l.contatoId, s);
    }
    return m;
  }, [db.lancamentos, ref]);

  const lista = useMemo(
    () =>
      db.contatos
        .filter((c) => filtro === 'todos' || c.tipo === filtro || c.tipo === 'ambos')
        .filter((c) => !busca.trim() || contem(c.nome, busca) || contem(c.fantasia, busca) || c.documento.includes(busca.replace(/\D/g, '') || '§') || contem(c.cidade, busca))
        .sort((a, b) => (a.fantasia || a.nome).localeCompare(b.fantasia || b.nome, 'pt-BR')),
    [db.contatos, filtro, busca],
  );
  const aberto = abertoId ? db.contatos.find((c) => c.id === abertoId) ?? null : null;
  const nClientes = db.contatos.filter((c) => c.tipo !== 'fornecedor').length;
  const nFornecedores = db.contatos.filter((c) => c.tipo !== 'cliente').length;

  return (
    <div className="contatos">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Cadastros</p>
          <h1>Contatos</h1>
          <p className="lede">
            <strong>{plural(nClientes, 'cliente', 'clientes')}</strong> e <strong>{plural(nFornecedores, 'fornecedor', 'fornecedores')}</strong>. Digite o CNPJ no cadastro e o Prumo
            busca os dados na Receita.
          </p>
        </div>
        <div className="pagina-cabeca__acoes">
          {pode('contatos') && (
            <Botao variante="primario" icone="mais" onClick={() => acoes.novoContato(filtro === 'fornecedor' ? 'fornecedor' : 'cliente', (c) => setAbertoId(c.id))}>
              Novo contato
            </Botao>
          )}
        </div>
      </header>

      <div className="filtros">
        <Segmentado
          rotulo="Tipo"
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: 'todos', rotulo: 'Todos', contagem: db.contatos.length },
            { valor: 'cliente', rotulo: 'Clientes', contagem: nClientes },
            { valor: 'fornecedor', rotulo: 'Fornecedores', contagem: nFornecedores },
          ]}
        />
        <div className="filtros__campos">
          <div className="entrada-grupo filtros__busca">
            <span className="entrada-grupo__prefixo">
              <Icone nome="busca" tam={16} />
            </span>
            <Entrada placeholder="Nome, CNPJ/CPF ou cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar contatos" />
          </div>
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio icone="contatos" titulo="Ninguém por aqui" texto={busca ? `Nada encontrado para “${busca}”.` : 'Cadastre clientes e fornecedores, ou importe um XML de nota, que o Prumo cadastra sozinho.'} />
      ) : (
        <ul className="contatos__grade">
          {lista.map((c) => {
            const s = saldoPorContato.get(c.id);
            return (
              <li key={c.id}>
                <button type="button" className="contato-cartao" onClick={() => setAbertoId(c.id)}>
                  <Avatar nome={c.fantasia || c.nome} />
                  <span className="contato-cartao__texto">
                    <strong className="truncar">{c.fantasia || c.nome}</strong>
                    <span className="truncar mono">{c.documento ? documentoProtegido(c.documento) : c.anonimizadoEm ? 'anonimizado' : 'sem documento'}</span>
                    <span className="truncar">
                      {NOME_TIPO[c.tipo]}
                      {c.cidade ? ` · ${c.cidade}/${c.uf}` : ''}
                    </span>
                  </span>
                  <span className="contato-cartao__saldo">
                    {s?.receber ? <span className="num">+{moeda(s.receber)}</span> : null}
                    {s?.pagar ? <span className="num">−{moeda(s.pagar)}</span> : null}
                    {s?.vencido ? <span className="carimbo carimbo--vencido">Vencido</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <FichaContato contato={aberto} aoFechar={() => setAbertoId(null)} />
    </div>
  );
}
