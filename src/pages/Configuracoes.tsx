import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { dataBR, hoje, tempoRelativo } from '../lib/dates';
import { moeda, plural } from '../lib/format';
import { BANCOS, bancoPorCodigo, cnpjValido, mascaraCnpj, mascaraTelefone, normalizarCnpj, UFS } from '../lib/br';
import { baixarArquivo, lerArquivoTexto, LIMITE_BACKUP_BYTES } from '../lib/util';
import { apagarDadosDoAparelho, exportarBackup, restaurarDemonstracao, substituirBanco, useDb, validarBackup } from '../data/store';
import { saldoConta } from '../data/selectors';
import { editarMeuPerfil, excluirCategoria, excluirMinhaConta, exportarMeusDados, salvarCategoria, salvarContaBancaria, salvarEmpresa, trocarPropriaSenha, zerarDados } from '../data/actions';
import type { ContaBancaria, Empresa, Regime, TipoCategoria, TipoConta } from '../data/types';
import { NOME_PAPEL, useAuth, useUsuario } from '../auth/auth';
import { consultarCnpj } from '../services/brasilapi';
import { useAvisos } from '../components/Avisos';
import { Camada } from '../components/Camada';
import { Icone } from '../components/Icone';
import { Avatar, Botao, Caixa, Campo, CarimboTexto, Entrada, EntradaMoeda, EntradaSenha, Selecao } from '../components/ui';
import { MedidorSenha } from '../components/MedidorSenha';

type Aba = 'empresa' | 'contas' | 'categorias' | 'sefaz' | 'perfil' | 'privacidade' | 'dados';

const REGIMES: Record<Regime, string> = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real', mei: 'MEI' };
const TIPOS_CONTA: Record<TipoConta, string> = { corrente: 'Conta corrente', poupanca: 'Poupança', caixa: 'Caixa (dinheiro)', investimento: 'Investimento' };

function AbaEmpresa() {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const [e, setE] = useState<Empresa>({ ...db.empresa, cnpj: mascaraCnpj(db.empresa.cnpj) });
  const [buscando, setBuscando] = useState(false);
  const editavel = pode('config');
  const set = <K extends keyof Empresa>(k: K, v: Empresa[K]) => setE((x) => ({ ...x, [k]: v }));

  const buscar = async () => {
    setBuscando(true);
    try {
      const d = await consultarCnpj(e.cnpj);
      setE((x) => ({ ...x, razaoSocial: d.razaoSocial, nomeFantasia: d.nomeFantasia ?? x.nomeFantasia, uf: d.uf ?? x.uf, municipio: d.cidade ?? x.municipio }));
      avisar('Dados preenchidos com o cadastro da Receita.');
    } catch (er) {
      erro(er);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <form
      className="grade-form config__form"
      onSubmit={(ev) => {
        ev.preventDefault();
        try {
          salvarEmpresa({ ...e, cnpj: normalizarCnpj(e.cnpj) }, usuario.id);
          avisar('Dados da empresa salvos.');
        } catch (er) {
          erro(er);
        }
      }}
    >
      <Campo className="c4" rotulo="CNPJ" htmlFor="e-cnpj" erro={e.cnpj && normalizarCnpj(e.cnpj).length === 14 && !cnpjValido(e.cnpj) ? 'CNPJ inválido' : null}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Entrada id="e-cnpj" className="entrada--mono" value={e.cnpj} disabled={!editavel} onChange={(ev) => set('cnpj', mascaraCnpj(ev.target.value))} />
          <Botao icone="busca" disabled={!editavel || buscando || !cnpjValido(e.cnpj)} onClick={buscar}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </Botao>
        </div>
      </Campo>
      <Campo className="c2" rotulo="Inscrição estadual" htmlFor="e-ie">
        <Entrada id="e-ie" value={e.inscricaoEstadual ?? ''} disabled={!editavel} onChange={(ev) => set('inscricaoEstadual', ev.target.value)} />
      </Campo>
      <Campo rotulo="Razão social" htmlFor="e-rs">
        <Entrada id="e-rs" value={e.razaoSocial} disabled={!editavel} onChange={(ev) => set('razaoSocial', ev.target.value)} />
      </Campo>
      <Campo className="c3" rotulo="Nome fantasia" htmlFor="e-nf">
        <Entrada id="e-nf" value={e.nomeFantasia} disabled={!editavel} onChange={(ev) => set('nomeFantasia', ev.target.value)} />
      </Campo>
      <Campo className="c3" rotulo="Regime tributário" htmlFor="e-reg">
        <Selecao id="e-reg" value={e.regime} disabled={!editavel} onChange={(ev) => set('regime', ev.target.value as Regime)}>
          {Object.entries(REGIMES).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo className="c4" rotulo="Município" htmlFor="e-mun">
        <Entrada id="e-mun" value={e.municipio} disabled={!editavel} onChange={(ev) => set('municipio', ev.target.value)} />
      </Campo>
      <Campo className="c2" rotulo="UF" htmlFor="e-uf">
        <Selecao id="e-uf" value={e.uf} disabled={!editavel} onChange={(ev) => set('uf', ev.target.value)}>
          {UFS.map((u) => (
            <option key={u.sigla} value={u.sigla}>
              {u.sigla} · {u.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <div className="aviso-caixa">
        <Icone nome="info" />
        <span>O CNPJ da empresa é o que o Prumo usa para saber se uma nota importada é de compra (você é o destinatário) ou de venda (você é o emitente).</span>
      </div>
      {editavel && (
        <div>
          <Botao variante="primario" type="submit" icone="check">
            Salvar dados da empresa
          </Botao>
        </div>
      )}
    </form>
  );
}

function AbaContas() {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const [form, setForm] = useState<(Omit<ContaBancaria, 'id'> & { id?: string }) | null>(null);
  const novo = (): Omit<ContaBancaria, 'id'> => ({ nome: '', tipo: 'corrente', saldoInicial: 0, saldoInicialEm: hoje(), ativa: true });

  return (
    <div>
      <ul className="contas-lista">
        {db.contas.map((c) => (
          <li key={c.id} className="contas-lista__item" style={{ opacity: c.ativa ? 1 : 0.55 }}>
            <Icone nome={c.tipo === 'caixa' ? 'dinheiro' : 'banco'} tam={22} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{c.nome}</strong>
              <div className="muted" style={{ fontSize: 13 }}>
                {[bancoPorCodigo(c.bancoCodigo)?.nome, c.agencia && `ag. ${c.agencia}`, c.numero && `c/c ${c.numero}`, TIPOS_CONTA[c.tipo]].filter(Boolean).join(' · ')}
              </div>
            </div>
            <strong className="num">{moeda(saldoConta(db, c))}</strong>
            {pode('config') && <Botao tam="p" variante="fantasma" icone="editar" aria-label={`Editar ${c.nome}`} onClick={() => setForm({ ...c })} />}
          </li>
        ))}
      </ul>
      {pode('config') && (
        <Botao icone="mais" onClick={() => setForm(novo())} style={{ marginTop: 14 }}>
          Adicionar conta
        </Botao>
      )}
      {form && (
        <Camada
          aberta
          aoFechar={() => setForm(null)}
          sobretitulo="Contas bancárias"
          titulo={form.id ? 'Editar conta' : 'Nova conta'}
          rodape={
            <>
              <span className="espaco" />
              <Botao variante="fantasma" onClick={() => setForm(null)}>
                Cancelar
              </Botao>
              <Botao
                variante="primario"
                icone="check"
                onClick={() => {
                  try {
                    salvarContaBancaria(form, usuario.id);
                    avisar('Conta salva.');
                    setForm(null);
                  } catch (e) {
                    erro(e);
                  }
                }}
              >
                Salvar
              </Botao>
            </>
          }
        >
          <div className="grade-form">
            <Campo rotulo="Nome (como aparece no sistema)" htmlFor="cb-nome">
              <Entrada id="cb-nome" autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Itaú PJ" />
            </Campo>
            <Campo className="c3" rotulo="Banco" htmlFor="cb-banco">
              <Selecao id="cb-banco" value={form.bancoCodigo ?? ''} onChange={(e) => setForm({ ...form, bancoCodigo: e.target.value || undefined })}>
                <option value="">Nenhum</option>
                {BANCOS.map((b) => (
                  <option key={b.codigo} value={b.codigo}>
                    {b.codigo} · {b.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo className="c3" rotulo="Tipo" htmlFor="cb-tipo">
              <Selecao id="cb-tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoConta })}>
                {Object.entries(TIPOS_CONTA).map(([v, r]) => (
                  <option key={v} value={v}>
                    {r}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo className="c3 m3" rotulo="Agência" htmlFor="cb-ag">
              <Entrada id="cb-ag" value={form.agencia ?? ''} onChange={(e) => setForm({ ...form, agencia: e.target.value })} />
            </Campo>
            <Campo className="c3 m3" rotulo="Conta" htmlFor="cb-num">
              <Entrada id="cb-num" value={form.numero ?? ''} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </Campo>
            <Campo className="c3 m3" rotulo="Saldo inicial" htmlFor="cb-saldo" dica="O saldo da conta no dia abaixo.">
              <EntradaMoeda id="cb-saldo" valor={form.saldoInicial} aoMudar={(v) => setForm({ ...form, saldoInicial: v })} />
            </Campo>
            <Campo className="c3 m3" rotulo="Saldo em" htmlFor="cb-data">
              <Entrada id="cb-data" type="date" value={form.saldoInicialEm} onChange={(e) => setForm({ ...form, saldoInicialEm: e.target.value })} />
            </Campo>
            <div>
              <Caixa rotulo="Conta ativa" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />
            </div>
          </div>
        </Camada>
      )}
    </div>
  );
}

function AbaCategorias() {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const [nova, setNova] = useState<Record<TipoCategoria, string>>({ receita: '', despesa: '' });
  const uso = (id: string) => db.lancamentos.filter((l) => l.categoriaId === id).length;

  return (
    <div className="categorias">
      {(['receita', 'despesa'] as TipoCategoria[]).map((tipo) => (
        <section key={tipo}>
          <h3 className="detalhe__h3">{tipo === 'receita' ? 'Receitas' : 'Despesas'}</h3>
          <ul className="categorias__lista">
            {db.categorias
              .filter((c) => c.tipo === tipo)
              .map((c) => {
                const n = uso(c.id);
                return (
                  <li key={c.id}>
                    <span>{c.nome}</span>
                    <span className="muted num" style={{ fontSize: 12.5 }}>
                      {plural(n, 'lançamento', 'lançamentos')}
                    </span>
                    {pode('config') && (
                      <Botao
                        tam="p"
                        variante="fantasma"
                        icone="lixeira"
                        aria-label={`Excluir ${c.nome}`}
                        disabled={n > 0}
                        title={n > 0 ? 'Em uso, não pode ser excluída' : 'Excluir'}
                        onClick={() => {
                          try {
                            excluirCategoria(c.id, usuario.id);
                            avisar('Categoria excluída.');
                          } catch (e) {
                            erro(e);
                          }
                        }}
                      />
                    )}
                  </li>
                );
              })}
          </ul>
          {pode('config') && (
            <form
              className="categorias__nova"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  salvarCategoria({ nome: nova[tipo].trim(), tipo }, usuario.id);
                  setNova({ ...nova, [tipo]: '' });
                } catch (er) {
                  erro(er);
                }
              }}
            >
              <Entrada placeholder={`Nova categoria de ${tipo}`} value={nova[tipo]} onChange={(e) => setNova({ ...nova, [tipo]: e.target.value })} aria-label={`Nova categoria de ${tipo}`} />
              <Botao type="submit" icone="mais" disabled={!nova[tipo].trim()}>
                Adicionar
              </Botao>
            </form>
          )}
        </section>
      ))}
    </div>
  );
}

function AbaSefaz() {
  const db = useDb();
  const c = db.configSefaz;
  return (
    <div className="config__form">
      <div className="sefaz__status">
        <div className="sefaz__status-texto">
          <span className="rotulo">Situação</span>
          <h3>
            <span className="ponto" style={{ color: 'var(--atencao)' }} /> Modo demonstração
          </h3>
          <p className="muted">
            UF {c.uf} · ambiente de {c.ambiente === 'homologacao' ? 'homologação (testes)' : 'produção'}
            {c.ultimaSincronizacao ? ` · última consulta ${tempoRelativo(c.ultimaSincronizacao)}` : ''}
          </p>
        </div>
        <CarimboTexto variante="hoje">Certificado não instalado</CarimboTexto>
      </div>

      <h3 className="detalhe__h3" style={{ marginTop: 26 }}>
        O que a integração faz
      </h3>
      <ol className="passos">
        <li>
          <strong>Busca as notas emitidas contra o seu CNPJ</strong> direto na SEFAZ (Distribuição DF-e), sem depender do fornecedor mandar o XML.
        </li>
        <li>
          <strong>Manifesta o destinatário</strong> (ciência, confirmação, desconhecimento), que protege a empresa de notas frias no seu nome.
        </li>
        <li>
          <strong>Gera as contas a pagar</strong> pelas duplicatas de cada nota, com o fornecedor já cadastrado.
        </li>
        <li>
          <strong>Confere a situação</strong> das notas (autorizada, cancelada) antes de pagar.
        </li>
      </ol>

      <h3 className="detalhe__h3" style={{ marginTop: 26 }}>
        Para ativar (próxima versão)
      </h3>
      <div className="grade-form">
        <Campo className="c3" rotulo="Certificado digital A1 (.pfx)" dica="O e-CNPJ A1 da empresa, emitido por uma certificadora.">
          <Entrada type="file" accept=".pfx,.p12" disabled />
        </Campo>
        <Campo className="c3" rotulo="Senha do certificado">
          <EntradaSenha disabled />
        </Campo>
      </div>
      <div className="aviso-caixa" style={{ marginTop: 16 }}>
        <Icone nome="escudo" />
        <span>
          Por segurança, o certificado nunca fica no navegador: a V2 traz um servidor que guarda o certificado criptografado e conversa com a SEFAZ. O caminho e as opções (certificado
          próprio ou provedor de API fiscal) estão em <span className="mono">docs/SEFAZ.md</span> no repositório.
        </span>
      </div>
    </div>
  );
}

function AbaPerfil() {
  const usuario = useUsuario();
  const { avisar, erro } = useAvisos();
  const [nome, setNome] = useState(usuario.nome);
  const [email, setEmail] = useState(usuario.email);
  const [telefone, setTelefone] = useState(usuario.telefone ?? '');
  const [cargo, setCargo] = useState(usuario.cargo ?? '');
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  return (
    <div className="config__form">
      <div className="mais__usuario" style={{ borderBottom: 'none' }}>
        <Avatar nome={usuario.nome} tam="g" />
        <div>
          <strong style={{ fontSize: 18 }}>{usuario.nome}</strong>
          <div className="muted">
            {NOME_PAPEL[usuario.papel]} · login <span className="mono">{usuario.login}</span> · cadastrado em {dataBR(usuario.criadoEm.slice(0, 10))}
          </div>
        </div>
      </div>

      <h3 className="detalhe__h3" style={{ marginTop: 18 }}>
        Meus dados
      </h3>
      <form
        className="grade-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            editarMeuPerfil(usuario.id, { nome, email, telefone: telefone || undefined, cargo: cargo || undefined });
            avisar('Dados atualizados.');
          } catch (er) {
            erro(er);
          }
        }}
      >
        <Campo rotulo="Nome completo" htmlFor="p-nome">
          <Entrada id="p-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo className="c3" rotulo="E-mail" htmlFor="p-email">
          <Entrada id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo className="c3" rotulo="Telefone" htmlFor="p-tel">
          <Entrada id="p-tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
        </Campo>
        <Campo rotulo="Cargo" htmlFor="p-cargo">
          <Entrada id="p-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
        </Campo>
        <div>
          <Botao type="submit" icone="check">
            Salvar meus dados
          </Botao>
        </div>
      </form>

      <h3 className="detalhe__h3" style={{ marginTop: 30 }}>
        Trocar senha
      </h3>
      <form
        className="grade-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (nova !== confirma) return erro(new Error('A confirmação não bate com a nova senha.'));
          try {
            trocarPropriaSenha(usuario.id, atual, nova);
            setAtual('');
            setNova('');
            setConfirma('');
            avisar('Senha trocada.');
          } catch (er) {
            erro(er);
          }
        }}
      >
        <Campo rotulo="Senha atual" htmlFor="p-atual">
          <EntradaSenha id="p-atual" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" />
        </Campo>
        <Campo className="c3" rotulo="Nova senha" htmlFor="p-nova" dica="8+ caracteres, letras e números.">
          <EntradaSenha id="p-nova" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" />
          <MedidorSenha senha={nova} contexto={usuario} />
        </Campo>
        <Campo className="c3" rotulo="Confirmar nova senha" htmlFor="p-conf">
          <EntradaSenha id="p-conf" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
        </Campo>
        <div>
          <Botao variante="primario" type="submit" icone="cadeado" disabled={!atual || !nova}>
            Trocar senha
          </Botao>
        </div>
      </form>
    </div>
  );
}

function AbaPrivacidade() {
  const db = useDb();
  const usuario = useUsuario();
  const { pode, sair } = useAuth();
  const { erro } = useAvisos();
  const [excluindo, setExcluindo] = useState(false);
  const [senhaConf, setSenhaConf] = useState('');
  const eventos = db.atividades.filter((a) => a.tipo === 'seguranca' || a.tipo === 'privacidade').slice(0, 40);

  return (
    <div className="config__form dados">
      <div className="aviso-caixa">
        <Icone nome="escudo" />
        <span>
          Você controla os seus dados pessoais (LGPD, art. 18). Aqui você baixa uma cópia, corrige em <strong>Meu perfil</strong> ou exclui a sua conta.{' '}
          <Link to="/privacidade">Ler o aviso de privacidade</Link>.
        </span>
      </div>
      <ul className="dados__lista">
        <li>
          <div>
            <strong>Baixar meus dados</strong>
            <span>Um arquivo com o seu perfil e tudo o que você fez no sistema (sem a senha).</span>
          </div>
          <Botao
            icone="baixar"
            onClick={() => {
              try {
                baixarArquivo(`prumo-meus-dados-${usuario.login}-${hoje()}.json`, exportarMeusDados(usuario.id), 'application/json');
              } catch (e) {
                erro(e);
              }
            }}
          >
            Baixar
          </Botao>
        </li>
        <li>
          <div>
            <strong>Excluir minha conta</strong>
            <span>Apaga seu nome, e-mail, login e telefone. O que você lançou fica no histórico da empresa como “Usuário removido” (guarda obrigatória).</span>
          </div>
          <Botao variante="perigo" icone="lixeira" onClick={() => setExcluindo(true)}>
            Excluir conta
          </Botao>
        </li>
        <li>
          <div>
            <strong>Apagar tudo deste aparelho</strong>
            <span>Remove deste navegador todos os dados do Prumo (empresa, lançamentos, usuários, sessão). Use antes de devolver ou vender o computador.</span>
          </div>
          <Botao
            variante="perigo"
            icone="lixeira"
            disabled={!pode('config')}
            title={pode('config') ? undefined : 'Só administradores'}
            onClick={() => {
              if (!window.confirm('Apagar TODOS os dados do Prumo deste aparelho? Sem backup, não há como recuperar.')) return;
              apagarDadosDoAparelho();
            }}
          >
            Apagar tudo
          </Botao>
        </li>
      </ul>

      {pode('config') && (
        <section style={{ marginTop: 30 }}>
          <h3 className="detalhe__h3">Registro de segurança e privacidade</h3>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 8 }}>
            Entradas no sistema, bloqueios por senha errada, trocas de senha, exportações e exclusões de dados pessoais.
          </p>
          {eventos.length === 0 ? (
            <p className="muted">Nenhum evento ainda.</p>
          ) : (
            <ol className="atividades">
              {eventos.map((a) => (
                <li key={a.id}>
                  <Icone nome={a.tipo === 'privacidade' ? 'escudo' : 'cadeado'} tam={16} />
                  <span className="atividades__texto">
                    {a.texto}
                  </span>
                  <time className="atividades__quando">{tempoRelativo(a.em)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {excluindo && (
        <Camada
          aberta
          aoFechar={() => setExcluindo(false)}
          sobretitulo="Privacidade"
          titulo="Excluir minha conta"
          rodape={
            <>
              <span className="espaco" />
              <Botao variante="fantasma" onClick={() => setExcluindo(false)}>
                Cancelar
              </Botao>
              <Botao
                variante="perigo"
                icone="lixeira"
                disabled={!senhaConf}
                onClick={() => {
                  try {
                    excluirMinhaConta(usuario.id, senhaConf);
                    sair('Sua conta foi excluída e os seus dados pessoais foram apagados.');
                  } catch (e) {
                    erro(e);
                  }
                }}
              >
                Excluir definitivamente
              </Botao>
            </>
          }
        >
          <p>Isto não tem volta. Serão apagados:</p>
          <ul className="passos" style={{ margin: '10px 0 16px' }}>
            <li>seu nome, e-mail, login, cargo e telefone;</li>
            <li>seu nome nas atividades registradas.</li>
          </ul>
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
            Lançamentos, baixas e notas que você registrou continuam na empresa (são registros financeiros de guarda obrigatória), sem identificar você.
          </p>
          <Campo rotulo="Confirme com a sua senha" htmlFor="x-senha">
            <EntradaSenha id="x-senha" value={senhaConf} onChange={(e) => setSenhaConf(e.target.value)} autoComplete="current-password" autoFocus />
          </Campo>
        </Camada>
      )}
    </div>
  );
}

function AbaDados() {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const admin = pode('config');
  return (
    <div className="config__form dados">
      <div className="aviso-caixa aviso-caixa--atencao">
        <Icone nome="alerta" />
        <span>
          Nesta versão os dados ficam <strong>guardados neste navegador, neste aparelho</strong>. Faça backup com frequência. Na V2 eles passam para um servidor na nuvem, compartilhados
          entre todos os usuários e aparelhos.
        </span>
      </div>
      <ul className="dados__lista">
        <li>
          <div>
            <strong>Exportar backup</strong>
            <span>Um arquivo .json com tudo: {plural(db.lancamentos.length, 'lançamento', 'lançamentos')}, {plural(db.notas.length, 'nota', 'notas')}, contatos e usuários.</span>
          </div>
          <Botao icone="baixar" onClick={() => baixarArquivo(`prumo-backup-${hoje()}.json`, exportarBackup(), 'application/json')}>
            Baixar backup
          </Botao>
        </li>
        {admin && (
          <li>
            <div>
              <strong>Restaurar backup</strong>
              <span>Substitui os dados deste navegador pelos do arquivo.</span>
            </div>
            <label className="btn btn--secundario">
              <Icone nome="enviar" /> Escolher arquivo
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    if (f.size > LIMITE_BACKUP_BYTES) throw new Error('Arquivo grande demais para um backup do Prumo (limite de 25 MB).');
                    const novo = validarBackup(await lerArquivoTexto(f));
                    if (!window.confirm('Substituir TODOS os dados deste navegador pelos do backup?')) return;
                    substituirBanco(novo);
                    avisar('Backup restaurado.');
                  } catch (er) {
                    erro(er);
                  }
                }}
              />
            </label>
          </li>
        )}
        {admin && (
          <li>
            <div>
              <strong>Começar de verdade</strong>
              <span>Apaga lançamentos, notas e contatos de demonstração. Mantém usuários, empresa, categorias e contas (com saldo zerado).</span>
            </div>
            <Botao
              variante="perigo"
              icone="lixeira"
              onClick={() => {
                if (!window.confirm('Apagar os dados de demonstração e começar do zero? Faça um backup antes se quiser guardar algo.')) return;
                zerarDados(usuario.id);
                avisar('Pronto: base limpa. Ajuste os saldos iniciais em Contas bancárias.');
              }}
            >
              Zerar dados
            </Botao>
          </li>
        )}
        {admin && (
          <li>
            <div>
              <strong>Recarregar demonstração</strong>
              <span>Volta para a loja fictícia, com dados gerados a partir da data de hoje.</span>
            </div>
            <Botao
              icone="sincronizar"
              onClick={() => {
                if (!window.confirm('Substituir os dados atuais pela demonstração?')) return;
                restaurarDemonstracao();
                avisar('Demonstração recarregada.');
              }}
            >
              Recarregar
            </Botao>
          </li>
        )}
      </ul>
    </div>
  );
}

export function Configuracoes() {
  const { pode } = useAuth();
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as Aba) || 'empresa';
  const abas: [Aba, string][] = [
    ['empresa', 'Empresa'],
    ['contas', 'Contas bancárias'],
    ['categorias', 'Categorias'],
    ['sefaz', 'SEFAZ'],
    ['perfil', 'Meu perfil'],
    ['privacidade', 'Privacidade'],
    ['dados', 'Dados e backup'],
  ];
  return (
    <div className="configuracoes">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Administração</p>
          <h1>Configurações</h1>
          {!pode('config') && <p className="lede">Você pode ver as configurações; só administradores alteram.</p>}
        </div>
      </header>
      <div className="abas" role="tablist" style={{ marginBottom: 24 }}>
        {abas.map(([v, r]) => (
          <button
            key={v}
            role="tab"
            aria-selected={aba === v}
            onClick={() => {
              params.set('aba', v);
              setParams(params, { replace: true });
            }}
          >
            {r}
          </button>
        ))}
      </div>
      {aba === 'empresa' && <AbaEmpresa />}
      {aba === 'contas' && <AbaContas />}
      {aba === 'categorias' && <AbaCategorias />}
      {aba === 'sefaz' && <AbaSefaz />}
      {aba === 'perfil' && <AbaPerfil />}
      {aba === 'privacidade' && <AbaPrivacidade />}
      {aba === 'dados' && <AbaDados />}
    </div>
  );
}
