// Passos obrigatórios logo depois do login:
// 1. senha provisória (criada por um administrador) => trocar antes de usar;
// 2. primeiro acesso => ler o aviso de privacidade (transparência, LGPD art. 9º).

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { registrarAceitePrivacidade, trocarPropriaSenha } from '../data/actions';
import { useAuth, useUsuario } from '../auth/auth';
import { Marca } from './Marca';
import { Botao, Campo, EntradaSenha } from './ui';
import { Icone } from './Icone';
import { MedidorSenha } from './MedidorSenha';

export function TrocarSenhaObrigatoria() {
  const usuario = useUsuario();
  const { sair } = useAuth();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (nova !== confirma) return setErro('A confirmação não bate com a nova senha.');
    try {
      trocarPropriaSenha(usuario.id, atual, nova);
    } catch (er) {
      setErro(er instanceof Error ? er.message : 'Não foi possível trocar a senha.');
    }
  };

  return (
    <div className="tela-cheia">
      <form className="tela-cheia__caixa" onSubmit={enviar}>
        <Marca />
        <h1>Crie a sua senha</h1>
        <p className="muted">
          Olá, {usuario.nome.split(' ')[0]}. A senha que você recebeu é provisória. Por segurança, crie uma senha só sua antes de continuar.
        </p>
        <Campo rotulo="Senha provisória" htmlFor="o-atual">
          <EntradaSenha id="o-atual" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} autoFocus />
        </Campo>
        <Campo rotulo="Nova senha" htmlFor="o-nova">
          <EntradaSenha id="o-nova" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
          <MedidorSenha senha={nova} contexto={usuario} />
        </Campo>
        <Campo rotulo="Repita a nova senha" htmlFor="o-conf">
          <EntradaSenha id="o-conf" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </Campo>
        {erro && (
          <div className="aviso-caixa aviso-caixa--critico" role="alert">
            <Icone nome="alerta" />
            <span>{erro}</span>
          </div>
        )}
        <Botao variante="primario" tam="g" bloco type="submit" disabled={!atual || !nova}>
          Salvar e entrar
        </Botao>
        <button type="button" className="link" onClick={() => sair()}>
          Sair
        </button>
      </form>
    </div>
  );
}

export function AvisoPrivacidade() {
  const usuario = useUsuario();
  return (
    <div className="tela-cheia">
      <div className="tela-cheia__caixa tela-cheia__caixa--larga">
        <Marca />
        <h1>Antes de começar: seus dados</h1>
        <ul className="aviso-privacidade">
          <li>
            <Icone nome="cadeado" />
            <span>
              <strong>Ficam neste aparelho.</strong> Nesta versão o Prumo não tem servidor: tudo é guardado no seu navegador.
            </span>
          </li>
          <li>
            <Icone nome="escudo" />
            <span>
              <strong>Sem rastreamento.</strong> Nada de anúncios, cookies de terceiros ou venda de dados. Só o CNPJ/CEP que você buscar vai para a BrasilAPI.
            </span>
          </li>
          <li>
            <Icone nome="usuario" />
            <span>
              <strong>Você manda nos seus dados.</strong> Pode baixar, corrigir ou excluir a sua conta em Configurações → Privacidade.
            </span>
          </li>
          <li>
            <Icone nome="carimbo" />
            <span>
              <strong>Tudo fica registrado.</strong> Cada lançamento e cada baixa guardam quem fez e quando, para a segurança de todos.
            </span>
          </li>
        </ul>
        <p className="muted" style={{ fontSize: 14 }}>
          Detalhes no <Link to="/privacidade">aviso de privacidade completo</Link>.
        </p>
        <Botao variante="primario" tam="g" bloco onClick={() => registrarAceitePrivacidade(usuario.id)}>
          Entendi, vamos lá
        </Botao>
      </div>
    </div>
  );
}
