import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth';
import { Marca, PrumoPendulo } from '../components/Marca';
import { Botao, Caixa, Campo, CarimboTexto, Entrada, EntradaSenha } from '../components/ui';
import { Icone } from '../components/Icone';
import { useDb } from '../data/store';

export function Login() {
  const { entrar, aviso } = useAuth();
  const db = useDb();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    // pequeno respiro para o botão mostrar que trabalhou (o hash leva alguns ms)
    setTimeout(() => {
      const r = entrar(login, senha, lembrar);
      if (!r.ok) {
        setErro(r.erro);
        setEnviando(false);
      }
    }, 60);
  };

  return (
    <div className="login">
      <aside className="login__arte" aria-hidden="true">
        <div className="login__pauta" />
        <div className="login__topo">
          <Marca tam={26} />
        </div>
        <div className="login__pendulo">
          <PrumoPendulo altura={300} />
        </div>
        <div className="login__manchete">
          <p className="rotulo">Gestão financeira e administrativa</p>
          <h1>
            Sua empresa
            <br />
            no prumo.
          </h1>
          <p>Contas a pagar e a receber, notas fiscais, fluxo de caixa e a equipe num lugar só, do computador ao celular.</p>
        </div>
        <ul className="login__fatos">
          <li>NF-e por XML · SEFAZ</li>
          <li>Fluxo de caixa projetado</li>
          <li>Equipe com permissões</li>
        </ul>
      </aside>

      <main className="login__lado">
        <div className="login__marca-movel">
          <Marca tam={24} />
        </div>
        <form className="login__form" onSubmit={enviar} noValidate>
          <span className="rotulo">Acesso</span>
          <h2>Entrar</h2>
          {aviso && !erro && (
            <div className="aviso-caixa aviso-caixa--atencao" role="status">
              <Icone nome="relogio" />
              <span>{aviso}</span>
            </div>
          )}
          <Campo rotulo="Usuário ou e-mail" htmlFor="l-usuario">
            <Entrada
              id="l-usuario"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoFocus
            />
          </Campo>
          <Campo rotulo="Senha" htmlFor="l-senha">
            <EntradaSenha id="l-senha" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
          <Caixa rotulo="Manter conectado neste aparelho" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
          {erro && (
            <div className="aviso-caixa aviso-caixa--critico" role="alert">
              <Icone nome="alerta" />
              <span>{erro}</span>
            </div>
          )}
          <Botao variante="primario" tam="g" bloco type="submit" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Botao>

          {db.demo && (
            <div className="login__demo">
              <CarimboTexto variante="latao">Demonstração</CarimboTexto>
              <p>
                Administrador: <b className="mono">admin</b> / <b className="mono">admin123</b>
                <br />
                Reginaldo: <b className="mono">reginaldo</b> / <b className="mono">reginaldo123</b>
              </p>
              <Botao
                tam="p"
                onClick={() => {
                  setLogin('admin');
                  setSenha('admin123');
                }}
              >
                Preencher acesso de administrador
              </Botao>
            </div>
          )}
        </form>
        <footer className="login__rodape">
          Prumo 0.1 · os dados desta versão ficam guardados neste navegador · <Link to="/privacidade">Privacidade e termos</Link>
        </footer>
      </main>
    </div>
  );
}
