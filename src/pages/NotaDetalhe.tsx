// A nota fiscal por inteiro, um DANFE redesenhado para ser lido, não decifrado.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { dataBR, horaBR, tempoRelativo } from '../lib/dates';
import { moeda, numero, plural } from '../lib/format';
import { mascaraDocumento } from '../lib/br';
import { formatarChave, URL_PORTAL_NFE } from '../lib/nfe/chave';
import { copiarTexto } from '../lib/util';
import { useDb } from '../data/store';
import { indices, statusDe } from '../data/selectors';
import { excluirNota, gerarTitulosDeNota } from '../data/actions';
import { useAuth, useUsuario } from '../auth/auth';
import { useAcoes } from '../components/Acoes';
import { useAvisos } from '../components/Avisos';
import { Icone } from '../components/Icone';
import { Botao, Carimbo, CarimboTexto, Selecao, Vazio } from '../components/ui';

export function NotaDetalhe() {
  const { id } = useParams();
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const acoes = useAcoes();
  const navegar = useNavigate();
  const { avisar, erro } = useAvisos();
  const nota = db.notas.find((n) => n.id === id);
  const idx = indices(db);
  const tipoCat = nota?.direcao === 'saida' ? 'receita' : 'despesa';
  const [categoriaId, setCategoriaId] = useState(
    () => db.categorias.find((c) => c.nome === (nota?.direcao === 'saida' ? 'Venda de mercadorias' : 'Compra de mercadorias'))?.id ?? '',
  );

  if (!nota) {
    return (
      <Vazio
        icone="nota"
        titulo="Nota não encontrada"
        texto="Ela pode ter sido excluída."
        acao={
          <Link to="/notas" className="btn btn--secundario">
            Voltar para as notas
          </Link>
        }
      />
    );
  }

  const titulos = (idx.lancamentosPorNota.get(nota.id) ?? []).sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
  const entrada = nota.direcao === 'entrada';
  const outro = entrada ? nota.emitente : nota.destinatario;
  const venda = nota.vendaId ? db.vendas.find((v) => v.id === nota.vendaId) : undefined;
  const t = nota.totais;
  const impostos = t.icms + t.ipi + t.st + t.pis + t.cofins;

  const gerar = () => {
    try {
      const n = gerarTitulosDeNota(nota.id, { categoriaId: categoriaId || undefined }, usuario.id);
      avisar(`${plural(n, 'conta lançada', 'contas lançadas')} a partir da NF ${nota.numero}.`);
    } catch (e) {
      erro(e);
    }
  };

  return (
    <div className="nota">
      <Link to="/notas" className="voltar">
        <Icone nome="voltar" tam={16} /> Notas fiscais
      </Link>

      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">
            NF-e nº {nota.numero} · série {nota.serie} · {entrada ? 'entrada (compra)' : 'saída (venda)'}
          </p>
          <h1>{outro.fantasia || outro.nome}</h1>
          <div className="linha-acoes" style={{ marginTop: 12 }}>
            <CarimboTexto variante={nota.situacao === 'autorizada' ? 'pago' : 'vencido'}>{nota.situacao === 'autorizada' ? 'Autorizada' : nota.situacao}</CarimboTexto>
            {nota.origem === 'emitida' && <span className="selo-simulacao">simulação</span>}
            <span className="etiqueta etiqueta--borda">
              {nota.origem === 'sefaz' ? 'Recebida da SEFAZ' : nota.origem === 'xml' ? 'Importada por XML' : nota.origem === 'emitida' ? 'Emitida pelo Prumo' : 'Lançada à mão'}
            </span>
            {venda && (
              <Link to={`/vendas/${venda.id}`} className="link" style={{ fontSize: 13 }}>
                Pedido nº {venda.numero}
              </Link>
            )}
            <span className="muted" style={{ fontSize: 13 }}>
              por {idx.usuarios.get(nota.importadaPor)?.nome ?? '-'} · {tempoRelativo(nota.importadaEm)}
            </span>
          </div>
        </div>
        <div className="pagina-cabeca__acoes">
          <span className="nota__total">
            <span className="rotulo">Valor da nota</span>
            <strong>{moeda(t.nota)}</strong>
          </span>
        </div>
      </header>

      <div className="danfe">
        <section className="danfe__chave">
          <span className="rotulo">Chave de acesso</span>
          <code className="mono">{formatarChave(nota.chave)}</code>
          <div className="linha-acoes">
            <Botao
              tam="p"
              icone="copiar"
              onClick={async () => {
                await copiarTexto(nota.chave);
                avisar('Chave copiada.');
              }}
            >
              Copiar
            </Botao>
            <Botao
              tam="p"
              icone="externo"
              onClick={async () => {
                await copiarTexto(nota.chave);
                avisar('Chave copiada. Cole no portal da SEFAZ.');
                window.open(URL_PORTAL_NFE, '_blank', 'noopener');
              }}
            >
              Consultar na SEFAZ
            </Botao>
          </div>
        </section>

        <section className="danfe__partes">
          {[
            ['Emitente', nota.emitente],
            ['Destinatário', nota.destinatario],
          ].map(([rotulo, p]) => {
            const parte = p as typeof nota.emitente;
            return (
              <div key={rotulo as string}>
                <span className="rotulo">{rotulo as string}</span>
                <strong>{parte.nome}</strong>
                <span className="mono">{mascaraDocumento(parte.documento)}</span>
                <span className="muted">{[parte.municipio, parte.uf].filter(Boolean).join(' / ')}</span>
              </div>
            );
          })}
          <div>
            <span className="rotulo">Emissão</span>
            <strong className="num">
              {dataBR(nota.emissao.slice(0, 10))} {nota.emissao.length > 10 ? `às ${horaBR(nota.emissao)}` : ''}
            </strong>
            <span className="muted">{nota.naturezaOperacao}</span>
            {nota.protocolo && <span className="mono muted">Protocolo {nota.protocolo}</span>}
          </div>
        </section>

        <section>
          <h2 className="danfe__h2">Itens</h2>
          <div className="tabela-rolagem">
            <table className="razao">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th className="esconder-movel">NCM</th>
                  <th className="esconder-movel">CFOP</th>
                  <th className="dir">Qtd</th>
                  <th className="dir esconder-movel">Unitário</th>
                  <th className="dir">Total</th>
                </tr>
              </thead>
              <tbody>
                {nota.itens.map((it, i) => (
                  <tr key={i}>
                    <td className="mono apertada">{it.codigo}</td>
                    <td>{it.descricao}</td>
                    <td className="mono esconder-movel">{it.ncm}</td>
                    <td className="mono esconder-movel">{it.cfop}</td>
                    <td className="dir num apertada">
                      {numero(it.quantidade, it.quantidade % 1 ? 2 : 0)} {it.unidade}
                    </td>
                    <td className="valor esconder-movel">{moeda(it.valorUnitario)}</td>
                    <td className="valor">{moeda(it.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="danfe__totais">
          <dl>
            <div>
              <dt>Produtos</dt>
              <dd className="num">{moeda(t.produtos)}</dd>
            </div>
            <div>
              <dt>Frete</dt>
              <dd className="num">{moeda(t.frete)}</dd>
            </div>
            <div>
              <dt>Desconto</dt>
              <dd className="num">{moeda(t.desconto)}</dd>
            </div>
            <div>
              <dt>ICMS</dt>
              <dd className="num">{moeda(t.icms)}</dd>
            </div>
            <div>
              <dt>IPI</dt>
              <dd className="num">{moeda(t.ipi)}</dd>
            </div>
            <div>
              <dt>PIS + COFINS</dt>
              <dd className="num">{moeda(t.pis + t.cofins)}</dd>
            </div>
            <div className="danfe__total">
              <dt>Total da nota</dt>
              <dd className="num">{moeda(t.nota)}</dd>
            </div>
          </dl>
          <p className="muted" style={{ fontSize: 13 }}>
            Tributos destacados: {moeda(impostos)} ({t.produtos ? numero((impostos / t.produtos) * 100, 1) : 0}% dos produtos).
          </p>
        </section>

        <section>
          <h2 className="danfe__h2">{entrada ? 'Contas a pagar desta nota' : 'Contas a receber desta nota'}</h2>
          {titulos.length > 0 ? (
            <ul className="lista-titulos">
              {titulos.map((l) => (
                <li key={l.id} className="titulo-linha">
                  <button type="button" className="titulo-linha__principal" onClick={() => acoes.verLancamento(l.id)}>
                    <span className={`titulo-linha__sentido titulo-linha__sentido--${l.tipo}`}>
                      <Icone nome={l.tipo} tam={15} />
                    </span>
                    <span className="titulo-linha__texto">
                      <strong className="truncar">
                        Parcela {l.parcela ? `${l.parcela.n}/${l.parcela.de}` : 'única'} · vence {dataBR(l.vencimento)}
                      </strong>
                      <span className="truncar">{l.documento}</span>
                    </span>
                    <span className="titulo-linha__valor num">{moeda(l.valor)}</span>
                  </button>
                  <span className="titulo-linha__acao">
                    <Carimbo status={statusDe(l)} tipo={l.tipo} />
                  </span>
                </li>
              ))}
            </ul>
          ) : nota.situacao !== 'autorizada' ? (
            <p className="muted">Nota {nota.situacao}, não gera contas.</p>
          ) : (
            <div className="aviso-caixa aviso-caixa--atencao" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <Icone nome="alerta" />
              <span style={{ flex: '1 1 260px' }}>
                Esta nota ainda não virou {entrada ? 'conta a pagar' : 'conta a receber'}.{' '}
                {nota.duplicatas.length
                  ? `Ela tem ${plural(nota.duplicatas.length, 'duplicata', 'duplicatas')}: ${nota.duplicatas.map((d) => `${dataBR(d.vencimento)} (${moeda(d.valor)})`).join(', ')}.`
                  : 'Ela não tem duplicatas, então será lançada à vista.'}
              </span>
              {pode('lancar') && (
                <span className="linha-acoes">
                  <Selecao aria-label="Categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={{ width: 230, height: 36 }}>
                    {db.categorias
                      .filter((c) => c.tipo === tipoCat)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                  </Selecao>
                  <Botao variante="primario" icone="check" onClick={gerar}>
                    Gerar {plural(nota.duplicatas.length || 1, 'conta', 'contas')}
                  </Botao>
                </span>
              )}
            </div>
          )}
        </section>
      </div>

      {pode('config') && !venda && (
        <div style={{ marginTop: 28 }}>
          <Botao
            variante="perigo"
            tam="p"
            icone="lixeira"
            onClick={() => {
              if (!window.confirm(`Excluir a NF ${nota.numero} e as contas em aberto ligadas a ela?`)) return;
              try {
                excluirNota(nota.id, usuario.id);
                avisar('Nota excluída.');
                navegar('/notas');
              } catch (e) {
                erro(e);
              }
            }}
          >
            Excluir nota
          </Botao>
        </div>
      )}
    </div>
  );
}
