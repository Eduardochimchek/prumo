// Detalhe do título: tudo sobre a conta, as parcelas irmãs, a nota de origem e o histórico.
// Quitado => carimbo "PAGO" de verdade, com textura de tinta.

import { Link } from 'react-router';
import { dataBR, diffDias, hoje, mesLongo, relativoDias, tempoRelativo } from '../../lib/dates';
import { moeda } from '../../lib/format';
import { formatarLinhaDigitavel } from '../../lib/boleto';
import { copiarTexto } from '../../lib/util';
import { useDb } from '../../data/store';
import { cancelarLancamento, estornarBaixa, reativarLancamento } from '../../data/actions';
import { indices, statusDe } from '../../data/selectors';
import { useAuth, useUsuario } from '../../auth/auth';
import { Camada } from '../Camada';
import { Icone } from '../Icone';
import { Botao, Carimbo, ItemMenu, MenuSuspenso } from '../ui';
import { useAvisos } from '../Avisos';
import { FORMAS } from './LancamentoForm';

export function DetalheLancamento({
  id,
  aoFechar,
  aoEditar,
  aoBaixar,
  aoDuplicar,
  recemPago,
}: {
  id: string | null;
  aoFechar: () => void;
  aoEditar: (id: string) => void;
  aoBaixar: (ids: string[]) => void;
  aoDuplicar: (id: string) => void;
  recemPago?: boolean;
}) {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const l = id ? db.lancamentos.find((x) => x.id === id) : undefined;
  const idx = indices(db);

  if (!l) return <Camada aberta={false} aoFechar={aoFechar}>{null}</Camada>;

  const status = statusDe(l);
  const contato = l.contatoId ? idx.contatos.get(l.contatoId) : undefined;
  const categoria = l.categoriaId ? idx.categorias.get(l.categoriaId) : undefined;
  const conta = l.contaId ? idx.contas.get(l.contaId) : undefined;
  const nota = l.notaId ? idx.notas.get(l.notaId) : undefined;
  const irmas = l.grupoId ? db.lancamentos.filter((x) => x.grupoId === l.grupoId).sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1)) : [];
  const nome = (uid?: string) => (uid ? idx.usuarios.get(uid)?.nome ?? 'Usuário removido' : '—');
  const atraso = status === 'vencido' ? diffDias(hoje(), l.vencimento) : 0;
  const pagar = l.tipo === 'pagar';

  return (
    <Camada
      aberta={!!l}
      aoFechar={aoFechar}
      tipo="gaveta"
      sobretitulo={`${pagar ? 'A pagar' : 'A receber'}${l.parcela ? ` · parcela ${l.parcela.n} de ${l.parcela.de}` : ''}`}
      titulo={l.descricao}
      rodape={
        <>
          {pode('lancar') && (
            <MenuSuspenso
              rotulo="Mais ações"
              alinhar="esquerda"
              gatilho={(abrir) => <Botao icone="pontos" aria-label="Mais ações" onClick={abrir} />}
            >
              {(fechar) => (
                <>
                  <ItemMenu icone="copiar" onClick={() => { fechar(); aoDuplicar(l.id); }}>
                    Duplicar lançamento
                  </ItemMenu>
                  {status === 'cancelado' ? (
                    <ItemMenu icone="desfazer" onClick={() => { fechar(); reativarLancamento(l.id, usuario.id); avisar('Lançamento reativado.'); }}>
                      Reativar
                    </ItemMenu>
                  ) : (
                    !l.baixa && (
                      <ItemMenu
                        icone="lixeira"
                        perigo
                        onClick={() => {
                          fechar();
                          try {
                            cancelarLancamento(l.id, usuario.id);
                            avisar('Lançamento cancelado.', { acao: { rotulo: 'Desfazer', executar: () => reativarLancamento(l.id, usuario.id) } });
                          } catch (e) {
                            erro(e);
                          }
                        }}
                      >
                        Cancelar lançamento
                      </ItemMenu>
                    )
                  )}
                </>
              )}
            </MenuSuspenso>
          )}
          <span className="espaco" />
          {pode('lancar') && status !== 'cancelado' && !l.baixa && (
            <Botao icone="editar" onClick={() => aoEditar(l.id)}>
              Editar
            </Botao>
          )}
          {pode('baixar') && l.baixa && (
            <Botao
              icone="desfazer"
              onClick={() => {
                estornarBaixa([l.id], usuario.id);
                avisar('Baixa estornada — o título voltou a ficar em aberto.');
              }}
            >
              Estornar baixa
            </Botao>
          )}
          {pode('baixar') && !l.baixa && status !== 'cancelado' && (
            <Botao variante="primario" icone="carimbo" onClick={() => aoBaixar([l.id])}>
              {pagar ? 'Registrar pagamento' : 'Registrar recebimento'}
            </Botao>
          )}
        </>
      }
    >
      <div className="detalhe__topo">
        <div>
          <div className="detalhe__valor">{moeda(l.baixa?.valorPago ?? l.valor)}</div>
          <div className="detalhe__sub">
            <Carimbo status={status} tipo={l.tipo} />
            <span>
              {l.baixa
                ? `${pagar ? 'pago' : 'recebido'} em ${dataBR(l.baixa.data)}`
                : status === 'cancelado'
                  ? 'não entra no fluxo de caixa'
                  : `vence ${relativoDias(l.vencimento)}${status === 'vencido' ? ` · ${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso` : ''}`}
            </span>
          </div>
        </div>
        {l.baixa && (
          <div className={`carimbo-grande carimbo-grande--pago${recemPago ? ' carimbo-grande--animar' : ''}`} aria-hidden="true">
            <strong>{pagar ? 'Pago' : 'Recebido'}</strong>
            <span>{dataBR(l.baixa.data)}</span>
          </div>
        )}
        {status === 'cancelado' && (
          <div className="carimbo-grande carimbo-grande--cancelado" aria-hidden="true">
            <strong>Cancelado</strong>
          </div>
        )}
      </div>

      <dl className="lista-definicao" style={{ marginTop: 22 }}>
        <dt>{pagar ? 'Fornecedor' : 'Cliente'}</dt>
        <dd>{contato ? <Link to={`/contatos?id=${contato.id}`}>{contato.fantasia || contato.nome}</Link> : '—'}</dd>
        <dt>Vencimento</dt>
        <dd className="num">{dataBR(l.vencimento)}</dd>
        <dt>Emissão</dt>
        <dd className="num">{dataBR(l.emissao)}</dd>
        <dt>Competência</dt>
        <dd>{mesLongo(l.competencia)}</dd>
        <dt>Categoria</dt>
        <dd>{categoria?.nome ?? '—'}</dd>
        <dt>{pagar ? 'Pagar pela conta' : 'Receber na conta'}</dt>
        <dd>{conta?.nome ?? '—'}</dd>
        <dt>Forma</dt>
        <dd>{FORMAS.find((f) => f.valor === l.forma)?.rotulo ?? '—'}</dd>
        {l.documento && (
          <>
            <dt>Documento</dt>
            <dd>{l.documento}</dd>
          </>
        )}
        {nota && (
          <>
            <dt>Nota fiscal</dt>
            <dd>
              <Link to={`/notas/${nota.id}`}>
                NF {nota.numero} · {nota.direcao === 'entrada' ? nota.emitente.nome : nota.destinatario.nome}
              </Link>
            </dd>
          </>
        )}
      </dl>

      {l.linhaDigitavel && (
        <div className="detalhe__boleto">
          <span className="rotulo">Linha digitável</span>
          <div className="detalhe__linha">
            <code className="mono">{formatarLinhaDigitavel(l.linhaDigitavel)}</code>
            <Botao
              tam="p"
              icone="copiar"
              onClick={async () => {
                const ok = await copiarTexto(l.linhaDigitavel ?? '');
                avisar(ok ? 'Linha digitável copiada — cole no app do banco.' : 'Não foi possível copiar.');
              }}
            >
              Copiar
            </Botao>
          </div>
        </div>
      )}

      {irmas.length > 1 && (
        <section style={{ marginTop: 24 }}>
          <h3 className="detalhe__h3">Parcelas</h3>
          <ol className="detalhe__parcelas">
            {irmas.map((p) => (
              <li key={p.id} className={p.id === l.id ? 'atual' : ''}>
                <span className="num">{p.parcela ? `${p.parcela.n}/${p.parcela.de}` : '—'}</span>
                <span className="num">{dataBR(p.vencimento)}</span>
                <span className="num">{moeda(p.valor)}</span>
                <Carimbo status={statusDe(p)} tipo={p.tipo} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {l.observacoes && (
        <section style={{ marginTop: 24 }}>
          <h3 className="detalhe__h3">Observações</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{l.observacoes}</p>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h3 className="detalhe__h3">Histórico</h3>
        <ol className="linha-tempo">
          <li>
            <Icone nome="mais" tam={14} />
            <span>
              Lançado por <strong>{nome(l.criadoPor)}</strong> · {tempoRelativo(l.criadoEm)}
            </span>
          </li>
          {l.atualizadoEm && (
            <li>
              <Icone nome="editar" tam={14} />
              <span>Alterado · {tempoRelativo(l.atualizadoEm)}</span>
            </li>
          )}
          {l.baixa && (
            <li>
              <Icone nome="carimbo" tam={14} />
              <span>
                Baixa registrada por <strong>{nome(l.baixa.usuarioId)}</strong> · {tempoRelativo(l.baixa.registradaEm)}
                {l.baixa.juros > 0 && ` · juros ${moeda(l.baixa.juros)}`}
                {l.baixa.desconto > 0 && ` · desconto ${moeda(l.baixa.desconto)}`}
                {l.baixa.observacao && ` · “${l.baixa.observacao}”`}
              </span>
            </li>
          )}
        </ol>
      </section>
    </Camada>
  );
}
