import { useState } from 'react';
import { Navigate } from 'react-router';
import { dataBR, diffDias, hoje, tempoRelativo, toISO } from '../lib/dates';
import { plural } from '../lib/format';
import { mascaraTelefone } from '../lib/br';
import { gerarSenha } from '../lib/util';
import { useDb } from '../data/store';
import { excluirUsuario, salvarUsuario } from '../data/actions';
import type { Papel, Usuario } from '../data/types';
import { DESCRICAO_PAPEL, NOME_PAPEL, useAuth, useUsuario } from '../auth/auth';
import { useAvisos } from '../components/Avisos';
import { Camada } from '../components/Camada';
import { Icone } from '../components/Icone';
import { Avatar, Botao, Caixa, Campo, Entrada, EntradaSenha } from '../components/ui';

const slug = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((p) => !/^(da|de|do|das|dos|e)$/.test(p))
    .slice(0, 2)
    .join('.');

function FormUsuario({ editando, aoFechar }: { editando?: Usuario; aoFechar: () => void }) {
  const eu = useUsuario();
  const { avisar, erro } = useAvisos();
  const [nome, setNome] = useState(editando?.nome ?? '');
  const [email, setEmail] = useState(editando?.email ?? '');
  const [login, setLogin] = useState(editando?.login ?? '');
  const [loginTocado, setLoginTocado] = useState(!!editando);
  const [cargo, setCargo] = useState(editando?.cargo ?? '');
  const [telefone, setTelefone] = useState(editando?.telefone ?? '');
  const [papel, setPapel] = useState<Papel>(editando?.papel ?? 'financeiro');
  const [ativo, setAtivo] = useState(editando?.ativo ?? true);
  const [senha, setSenha] = useState(editando ? '' : gerarSenha());

  const salvar = () => {
    try {
      salvarUsuario({ id: editando?.id, nome, email, login, cargo: cargo || undefined, telefone: telefone || undefined, papel, ativo, senha: senha || undefined }, eu.id);
      avisar(editando ? 'Usuário atualizado.' : `${nome.split(' ')[0]} cadastrado. Passe o login “${login}” e a senha para a pessoa.`, { duracao: 8000 });
      aoFechar();
    } catch (e) {
      erro(e);
    }
  };

  return (
    <Camada
      aberta
      aoFechar={aoFechar}
      tipo="gaveta"
      sobretitulo={editando ? 'Editar usuário' : 'Novo usuário'}
      titulo={editando ? editando.nome : 'Dar acesso ao Prumo'}
      rodape={
        <>
          <span className="espaco" />
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone="check" onClick={salvar}>
            {editando ? 'Salvar' : 'Cadastrar usuário'}
          </Botao>
        </>
      }
    >
      <form
        className="grade-form"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <Campo rotulo="Nome completo" htmlFor="u-nome">
          <Entrada
            id="u-nome"
            autoFocus={!editando}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              if (!loginTocado) setLogin(slug(e.target.value));
            }}
          />
        </Campo>
        <Campo className="c3" rotulo="Login" htmlFor="u-login" dica="Usado para entrar (ou o e-mail).">
          <Entrada
            id="u-login"
            className="entrada--mono"
            autoCapitalize="none"
            value={login}
            onChange={(e) => {
              setLoginTocado(true);
              setLogin(e.target.value.toLowerCase());
            }}
          />
        </Campo>
        <Campo className="c3" rotulo="E-mail" htmlFor="u-email">
          <Entrada id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo className="c3" rotulo="Cargo" htmlFor="u-cargo">
          <Entrada id="u-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Analista financeiro" />
        </Campo>
        <Campo className="c3" rotulo="Telefone" htmlFor="u-tel">
          <Entrada id="u-tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
        </Campo>

        <fieldset className="papeis">
          <legend className="campo__rotulo">Nível de acesso</legend>
          {(['admin', 'financeiro', 'leitura'] as Papel[]).map((p) => (
            <label key={p} className={`papel${papel === p ? ' papel--ativo' : ''}`}>
              <input type="radio" name="papel" value={p} checked={papel === p} onChange={() => setPapel(p)} />
              <span>
                <strong>{NOME_PAPEL[p]}</strong>
                <span>{DESCRICAO_PAPEL[p]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Campo rotulo={editando ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'} htmlFor="u-senha" dica="Mínimo de 6 caracteres. A pessoa pode trocar depois em Meu perfil.">
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <EntradaSenha id="u-senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
            </div>
            <Botao icone="sincronizar" onClick={() => setSenha(gerarSenha())} title="Gerar senha aleatória">
              Gerar
            </Botao>
          </div>
        </Campo>
        <div>
          <Caixa rotulo="Usuário ativo (pode entrar no sistema)" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={editando?.id === eu.id} />
        </div>
        <button type="submit" hidden />
      </form>
    </Camada>
  );
}

export function Usuarios() {
  const db = useDb();
  const eu = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const [form, setForm] = useState<{ id?: string } | null>(null);
  if (!pode('usuarios')) return <Navigate to="/" replace />;

  const ativos = db.usuarios.filter((u) => u.ativo).length;
  const lista = [...db.usuarios].sort((a, b) => Number(b.ativo) - Number(a.ativo) || (a.criadoEm < b.criadoEm ? -1 : 1));
  const editando = form?.id ? db.usuarios.find((u) => u.id === form.id) : undefined;
  const ref = hoje();

  return (
    <div className="usuarios">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Administração</p>
          <h1>Usuários e acessos</h1>
          <p className="lede">
            <strong>{plural(db.usuarios.length, 'usuário', 'usuários')}</strong>, {plural(ativos, 'ativo', 'ativos')}. Cada pessoa entra com o próprio login e tudo o que ela faz fica
            registrado na atividade.
          </p>
        </div>
        <div className="pagina-cabeca__acoes">
          <Botao variante="primario" icone="mais" onClick={() => setForm({})}>
            Novo usuário
          </Botao>
        </div>
      </header>

      <div className="tabela-rolagem painel">
        <table className="razao">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Login</th>
              <th>Acesso</th>
              <th>Situação</th>
              <th>Cadastrado em</th>
              <th>Último acesso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => {
              const criadoPor = u.criadoPor ? db.usuarios.find((x) => x.id === u.criadoPor)?.nome.split(' ')[0] : null;
              const dias = diffDias(ref, toISO(new Date(u.criadoEm)));
              return (
                <tr key={u.id} className="clicavel" onClick={() => setForm({ id: u.id })} style={{ opacity: u.ativo ? 1 : 0.62 }}>
                  <td>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <Avatar nome={u.nome} />
                      <div className="celula-principal">
                        <strong>
                          {u.nome} {u.id === eu.id && <span className="etiqueta" style={{ height: 20, fontSize: 11 }}>você</span>}
                        </strong>
                        <span>{u.cargo ? `${u.cargo} · ` : ''}{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{u.login}</td>
                  <td>
                    <span className={`carimbo ${u.papel === 'admin' ? 'carimbo--latao' : u.papel === 'financeiro' ? 'carimbo--info' : 'carimbo--aberto'}`}>{NOME_PAPEL[u.papel]}</span>
                  </td>
                  <td>{u.ativo ? <span className="carimbo carimbo--pago">Ativo</span> : <span className="carimbo carimbo--cancelado">Inativo</span>}</td>
                  <td className="num apertada">
                    {dataBR(toISO(new Date(u.criadoEm)))}
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {dias === 0 ? 'hoje' : `há ${dias} dias`}
                      {criadoPor ? ` · por ${criadoPor}` : ''}
                    </div>
                  </td>
                  <td className="apertada muted">{u.ultimoAcesso ? tempoRelativo(u.ultimoAcesso) : 'nunca entrou'}</td>
                  <td className="apertada">
                    <Botao tam="p" variante="fantasma" icone="editar" aria-label={`Editar ${u.nome}`} onClick={(e) => { e.stopPropagation(); setForm({ id: u.id }); }} />
                    {u.id !== eu.id && (
                      <Botao
                        tam="p"
                        variante="fantasma"
                        icone="lixeira"
                        aria-label={`Excluir ${u.nome}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Excluir o usuário ${u.nome}? O histórico de atividades é mantido.`)) return;
                          try {
                            excluirUsuario(u.id, eu.id);
                            avisar('Usuário excluído.');
                          } catch (er) {
                            erro(er);
                          }
                        }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section style={{ marginTop: 36 }}>
        <div className="secao-titulo">
          <h2>O que cada acesso permite</h2>
        </div>
        <div className="tabela-rolagem">
        <table className="razao papeis-tabela">
          <thead>
            <tr>
              <th>Ação</th>
              <th className="cen">Administrador</th>
              <th className="cen">Financeiro</th>
              <th className="cen">Consulta</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Ver painel, contas, notas, fluxo e relatórios', true, true, true],
                ['Exportar planilhas para o contador', true, true, true],
                ['Lançar contas e dar baixa', true, true, false],
                ['Importar XML e manifestar notas', true, true, false],
                ['Cadastrar clientes e fornecedores', true, true, false],
                ['Gerenciar usuários e acessos', true, false, false],
                ['Dados da empresa, contas bancárias, backup', true, false, false],
              ] as const
            ).map(([acao, a, f, l]) => (
              <tr key={acao}>
                <td>{acao}</td>
                {[a, f, l].map((ok, i) => (
                  <td key={i} className="cen">
                    {ok ? <Icone nome="check" tam={17} className="entrada-txt" titulo="Permitido" /> : <span className="muted" aria-label="Não permitido">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {form && <FormUsuario key={form.id ?? 'novo'} editando={editando} aoFechar={() => setForm(null)} />}
    </div>
  );
}
