// Notas fiscais: importadas por XML, emitidas pela empresa e a caixa de entrada da SEFAZ
// (notas emitidas contra o CNPJ, aguardando manifestação do destinatário).

import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { dataBR, hoje, mesChave, mesLongo, tempoRelativo } from '../lib/dates';
import { contem, moeda, plural } from '../lib/format';
import { mascaraDocumento } from '../lib/br';
import { analisarChave, URL_PORTAL_NFE } from '../lib/nfe/chave';
import { copiarTexto } from '../lib/util';
import { useDb } from '../data/store';
import { indices, statusDe } from '../data/selectors';
import { importarNotas, registrarManifestacao, vincularResumoANota } from '../data/actions';
import type { Manifestacao, ResumoSefaz } from '../data/types';
import { sefaz } from '../services/sefaz';
import { useAuth, useUsuario } from '../auth/auth';
import { useAcoes } from '../components/Acoes';
import { useAvisos } from '../components/Avisos';
import { Camada } from '../components/Camada';
import { Icone } from '../components/Icone';
import { Botao, CarimboTexto, Entrada, ItemMenu, MenuSuspenso, Vazio } from '../components/ui';

type Aba = 'todas' | 'entrada' | 'saida' | 'sefaz';

const SITUACAO: Record<string, { rotulo: string; variante: 'pago' | 'vencido' | 'aberto' }> = {
  autorizada: { rotulo: 'Autorizada', variante: 'pago' },
  cancelada: { rotulo: 'Cancelada', variante: 'vencido' },
  denegada: { rotulo: 'Denegada', variante: 'vencido' },
  sem_protocolo: { rotulo: 'Sem protocolo', variante: 'aberto' },
};

export function ConsultaChave({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const [chave, setChave] = useState('');
  const { avisar } = useAvisos();
  const info = chave.replace(/[^0-9A-Za-z]/g, '').length > 0 ? analisarChave(chave) : null;
  return (
    <Camada aberta={aberta} aoFechar={aoFechar} sobretitulo="Notas fiscais" titulo="Consultar chave de acesso">
      <p className="muted" style={{ marginBottom: 14 }}>
        Cole os 44 dígitos que aparecem no DANFE (abaixo do código de barras). O Prumo confere o dígito verificador e mostra o que a chave revela.
      </p>
      <Entrada className="entrada--mono" autoFocus value={chave} placeholder="4326 1145 8213 7600 0100 5500 1000 0048 2110 0001 7840" onChange={(e) => setChave(e.target.value)} />
      {info && !info.completa && <p className="campo__dica" style={{ marginTop: 8 }}>{info.erros[0]}</p>}
      {info?.completa && (
        <div style={{ marginTop: 18 }}>
          <div className={`aviso-caixa ${info.valida ? 'aviso-caixa--ok' : 'aviso-caixa--critico'}`}>
            <Icone nome={info.valida ? 'check' : 'alerta'} />
            <span>{info.valida ? 'Chave válida — os dígitos conferem.' : info.erros.join(' ')}</span>
          </div>
          <dl className="lista-definicao" style={{ marginTop: 16 }}>
            <dt>Documento</dt>
            <dd>
              {info.modelo?.nome} (modelo {info.modelo?.codigo})
            </dd>
            <dt>Número / série</dt>
            <dd className="num">
              {info.numero} / {info.serie}
            </dd>
            <dt>Emitente</dt>
            <dd className="mono">
              {info.emitente?.tipo} {info.emitente?.formatado}
            </dd>
            <dt>UF de emissão</dt>
            <dd>{info.uf ? `${info.uf.nome} (${info.uf.sigla})` : '—'}</dd>
            <dt>Mês de emissão</dt>
            <dd>{info.anoMes ? mesLongo(info.anoMes) : '—'}</dd>
            <dt>Tipo de emissão</dt>
            <dd>{info.tipoEmissao?.nome}</dd>
          </dl>
          <div className="linha-acoes" style={{ marginTop: 18 }}>
            <Botao
              icone="externo"
              variante="primario"
              onClick={async () => {
                await copiarTexto(info.chave);
                avisar('Chave copiada. Cole no portal da SEFAZ e resolva o captcha.');
                window.open(URL_PORTAL_NFE, '_blank', 'noopener');
              }}
            >
              Copiar e abrir portal da SEFAZ
            </Botao>
          </div>
        </div>
      )}
    </Camada>
  );
}

function CaixaSefaz() {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const navegar = useNavigate();
  const [sincronizando, setSincronizando] = useState(false);
  const [processando, setProcessando] = useState<string | null>(null);
  const status = sefaz.status(db);
  const lista = [...db.sefaz].sort((a, b) => (a.emissao < b.emissao ? 1 : -1));
  const pendentes = lista.filter((s) => s.manifestacao === 'pendente');

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      const n = await sefaz.sincronizar(db);
      avisar(n ? `${plural(n, 'nota nova chegou', 'notas novas chegaram')} da SEFAZ (simulação).` : 'Nenhuma nota nova desde a última consulta.');
    } catch (e) {
      erro(e);
    } finally {
      setSincronizando(false);
    }
  };

  const importar = async (r: ResumoSefaz) => {
    setProcessando(r.id);
    try {
      registrarManifestacao(r.id, 'ciencia', usuario.id);
      const dados = await sefaz.obterNota(db, r);
      const cat = db.categorias.find((c) => c.nome === 'Compra de mercadorias')?.id;
      const res = importarNotas([{ dados, gerarTitulos: true, categoriaId: cat }], usuario.id, 'sefaz');
      if (res.notas[0]) {
        vincularResumoANota(r.id, res.notas[0].id);
        avisar(`NF ${res.notas[0].numero} importada com ${plural(res.titulos, 'conta a pagar', 'contas a pagar')}.`, {
          acao: { rotulo: 'Ver nota', executar: () => navegar(`/notas/${res.notas[0].id}`) },
        });
      } else avisar(res.ignoradas[0] ?? 'Nota já importada.');
    } catch (e) {
      erro(e);
    } finally {
      setProcessando(null);
    }
  };

  const manifestar = (r: ResumoSefaz, m: Manifestacao) => {
    registrarManifestacao(r.id, m, usuario.id);
    avisar('Manifestação registrada (simulação).');
  };

  const nomeManifestacao: Record<Manifestacao, string> = {
    pendente: 'Aguardando',
    ciencia: 'Ciência',
    confirmada: 'Confirmada',
    desconhecida: 'Desconhecida',
    nao_realizada: 'Não realizada',
  };

  return (
    <div className="sefaz">
      <div className="sefaz__status">
        <div className="sefaz__status-texto">
          <span className="rotulo">Conexão com a SEFAZ</span>
          <h3>
            <span className="ponto" style={{ color: 'var(--atencao)' }} /> Modo demonstração
          </h3>
          <p className="muted">
            Ambiente de {status.ambiente === 'homologacao' ? 'homologação' : 'produção'} · {status.uf} · certificado digital A1 {status.certificado ? `de ${status.certificado.titular}` : 'não instalado'}
            {status.ultimaSincronizacao ? ` · última consulta ${tempoRelativo(status.ultimaSincronizacao)}` : ''}
          </p>
        </div>
        <div className="linha-acoes">
          <Link to="/configuracoes?aba=sefaz" className="btn btn--fantasma">
            Configurar
          </Link>
          <Botao icone="sincronizar" onClick={sincronizar} disabled={sincronizando}>
            {sincronizando ? 'Consultando…' : 'Consultar agora'}
          </Botao>
        </div>
      </div>

      <div className="aviso-caixa" style={{ margin: '16px 0 22px' }}>
        <Icone nome="info" />
        <span>
          Aqui chegam as NF-e que <strong>outras empresas emitiram contra o seu CNPJ</strong>. Para baixar o XML completo, a SEFAZ exige a <em>ciência da operação</em>.
          Depois, confirme (recebeu a mercadoria) ou registre <em>desconhecimento</em> — isso protege a empresa de notas emitidas indevidamente. Nesta versão a consulta é
          simulada; com o certificado A1 ela passa a ser real (ver roadmap).
        </span>
      </div>

      {lista.length === 0 ? (
        <Vazio icone="escudo" titulo="Caixa de entrada vazia" texto="Quando a integração estiver ativa, as notas emitidas contra o seu CNPJ aparecem aqui sozinhas." />
      ) : (
        <ul className="sefaz__lista">
          {lista.map((r) => (
            <li key={r.id} className="sefaz__item">
              <div className="sefaz__dados">
                <span className="rotulo">
                  NF {Number(r.chave.slice(25, 34))} · {dataBR(r.emissao.slice(0, 10))} {r.demo && '· simulada'}
                </span>
                <strong className="truncar">{r.emitenteNome}</strong>
                <span className="mono muted" style={{ fontSize: 12.5 }}>
                  {mascaraDocumento(r.emitenteDocumento)}
                </span>
              </div>
              <div className="sefaz__valor num">{moeda(r.valor)}</div>
              <div className="sefaz__acoes">
                {r.notaId ? (
                  <Link to={`/notas/${r.notaId}`} className="btn btn--secundario btn--p">
                    Ver nota
                  </Link>
                ) : r.manifestacao === 'pendente' || r.manifestacao === 'ciencia' || r.manifestacao === 'confirmada' ? (
                  pode('importar') && (
                    <Botao tam="p" variante="primario" icone="baixar" disabled={processando === r.id} onClick={() => importar(r)}>
                      {processando === r.id ? 'Baixando…' : 'Dar ciência e importar'}
                    </Botao>
                  )
                ) : null}
                <CarimboTexto variante={r.manifestacao === 'pendente' ? 'hoje' : r.manifestacao === 'desconhecida' || r.manifestacao === 'nao_realizada' ? 'vencido' : 'pago'}>
                  {nomeManifestacao[r.manifestacao]}
                </CarimboTexto>
                {pode('importar') && (
                  <MenuSuspenso rotulo="Manifestar" gatilho={(abrir) => <Botao tam="p" variante="fantasma" icone="pontos" aria-label="Outras manifestações" onClick={abrir} />}>
                    {(fechar) => (
                      <>
                        <ItemMenu icone="check" onClick={() => { fechar(); manifestar(r, 'confirmada'); }}>
                          Confirmar operação
                        </ItemMenu>
                        <ItemMenu icone="alerta" onClick={() => { fechar(); manifestar(r, 'desconhecida'); }}>
                          Desconheço esta operação
                        </ItemMenu>
                        <ItemMenu icone="fechar" onClick={() => { fechar(); manifestar(r, 'nao_realizada'); }}>
                          Operação não realizada
                        </ItemMenu>
                      </>
                    )}
                  </MenuSuspenso>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {pendentes.length > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{plural(pendentes.length, 'nota aguarda', 'notas aguardam')} manifestação.</p>}
    </div>
  );
}

export function Notas() {
  const db = useDb();
  const { pode } = useAuth();
  const acoes = useAcoes();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as Aba) || 'todas';
  const [busca, setBusca] = useState('');
  const [consulta, setConsulta] = useState(false);
  const idx = indices(db);
  const ref = hoje();

  const mes = mesChave(ref);
  const doMes = db.notas.filter((n) => n.emissao.slice(0, 7) === mes && n.situacao === 'autorizada');
  const compras = doMes.filter((n) => n.direcao === 'entrada').reduce((a, n) => a + n.totais.nota, 0);
  const vendas = doMes.filter((n) => n.direcao === 'saida').reduce((a, n) => a + n.totais.nota, 0);
  const pendentesSefaz = db.sefaz.filter((s) => s.manifestacao === 'pendente').length;

  const lista = useMemo(
    () =>
      db.notas
        .filter((n) => aba === 'todas' || n.direcao === aba)
        .filter((n) => {
          if (!busca.trim()) return true;
          const outro = n.direcao === 'entrada' ? n.emitente : n.destinatario;
          return n.numero.includes(busca) || contem(outro.nome, busca) || contem(outro.fantasia, busca) || n.chave.includes(busca.replace(/\s/g, ''));
        })
        .sort((a, b) => (a.emissao < b.emissao ? 1 : -1)),
    [db.notas, aba, busca],
  );

  const mudarAba = (a: Aba) => {
    if (a === 'todas') params.delete('aba');
    else params.set('aba', a);
    setParams(params, { replace: true });
  };

  return (
    <div className="notas">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Notas fiscais eletrônicas</p>
          <h1>Notas fiscais</h1>
          <p className="lede">
            Em {mesLongo(mes).split(' de ')[0]}: <strong>{moeda(compras)}</strong> em notas de compra e <strong>{moeda(vendas)}</strong> em notas de venda.
            {pendentesSefaz > 0 && (
              <>
                {' '}
                {plural(pendentesSefaz, 'nota emitida contra o seu CNPJ espera', 'notas emitidas contra o seu CNPJ esperam')} manifestação.
              </>
            )}
          </p>
        </div>
        <div className="pagina-cabeca__acoes">
          <Botao icone="busca" onClick={() => setConsulta(true)}>
            Consultar chave
          </Botao>
          {pode('importar') && (
            <Botao variante="primario" icone="enviar" onClick={() => acoes.importarNotas((ids) => ids[0] && navegar(`/notas/${ids[0]}`))}>
              Importar XML
            </Botao>
          )}
        </div>
      </header>

      <div className="abas" role="tablist" style={{ marginBottom: 20 }}>
        {(
          [
            ['todas', 'Todas', db.notas.length],
            ['entrada', 'Entradas', db.notas.filter((n) => n.direcao === 'entrada').length],
            ['saida', 'Saídas', db.notas.filter((n) => n.direcao === 'saida').length],
            ['sefaz', 'Caixa de entrada SEFAZ', pendentesSefaz],
          ] as const
        ).map(([v, r, n]) => (
          <button key={v} role="tab" aria-selected={aba === v} onClick={() => mudarAba(v)}>
            {r}
            {n > 0 && <span className={`secoes__contagem${v === 'sefaz' ? ' secoes__contagem--alerta' : ''}`}>{n}</span>}
          </button>
        ))}
      </div>

      {aba === 'sefaz' ? (
        <CaixaSefaz />
      ) : (
        <>
          <div className="filtros__campos" style={{ marginBottom: 16 }}>
            <div className="entrada-grupo filtros__busca">
              <span className="entrada-grupo__prefixo">
                <Icone nome="busca" tam={16} />
              </span>
              <Entrada placeholder="Número, empresa ou chave…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar notas" />
            </div>
          </div>
          {lista.length === 0 ? (
            <Vazio icone="nota" titulo="Nenhuma nota" texto="Importe os XML das notas de compra e venda — o Prumo gera as contas sozinho." />
          ) : (
            <div className="tabela-rolagem painel">
              <table className="razao">
                <thead>
                  <tr>
                    <th>Emissão</th>
                    <th>Nº</th>
                    <th>{aba === 'saida' ? 'Destinatário' : aba === 'entrada' ? 'Emitente' : 'Empresa'}</th>
                    <th className="esconder-movel">Sentido</th>
                    <th>Situação</th>
                    <th className="esconder-movel">Contas</th>
                    <th className="dir">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((n) => {
                    const titulos = idx.lancamentosPorNota.get(n.id) ?? [];
                    const quitados = titulos.filter((t) => statusDe(t) === 'pago').length;
                    const outro = n.direcao === 'entrada' ? n.emitente : n.destinatario;
                    const s = SITUACAO[n.situacao];
                    return (
                      <tr key={n.id} className={`clicavel${n.situacao === 'cancelada' ? ' cancelado' : ''}`} onClick={() => navegar(`/notas/${n.id}`)}>
                        <td className="num apertada">{dataBR(n.emissao.slice(0, 10))}</td>
                        <td className="num apertada">{n.numero}</td>
                        <td>
                          <div className="celula-principal">
                            <strong className="truncar descricao">{outro.fantasia || outro.nome}</strong>
                            <span className="mono">{mascaraDocumento(outro.documento)}</span>
                          </div>
                        </td>
                        <td className="esconder-movel">
                          <span className="etiqueta etiqueta--borda">
                            <Icone nome={n.direcao === 'entrada' ? 'receber' : 'pagar'} tam={13} />
                            {n.direcao === 'entrada' ? 'Entrada' : 'Saída'}
                          </span>
                        </td>
                        <td>
                          <CarimboTexto variante={s.variante}>{s.rotulo}</CarimboTexto>
                        </td>
                        <td className="esconder-movel">
                          {titulos.length ? (
                            <span className="muted" style={{ fontSize: 13 }}>
                              {quitados}/{titulos.length} {n.direcao === 'entrada' ? 'pagas' : 'recebidas'}
                            </span>
                          ) : n.situacao === 'autorizada' ? (
                            <CarimboTexto variante="hoje">Sem contas</CarimboTexto>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="valor">{moeda(n.totais.nota)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
            {plural(lista.length, 'nota', 'notas')} · {moeda(lista.filter((n) => n.situacao === 'autorizada').reduce((a, n) => a + n.totais.nota, 0))} em notas autorizadas
          </p>
        </>
      )}
      <ConsultaChave aberta={consulta} aoFechar={() => setConsulta(false)} />
    </div>
  );
}
