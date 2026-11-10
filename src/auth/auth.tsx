// Sessão e permissões. V1: autenticação local (o banco de usuários vive no navegador).
// V2: troca `entrar/sair` por chamadas à API (sessão httpOnly) mantendo esta interface.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getDb, useDb } from '../data/store';
import { registrarAcesso } from '../data/actions';
import { hashSenha, iguais } from '../lib/sha256';
import type { Papel, Usuario } from '../data/types';

export type Permissao = 'lancar' | 'baixar' | 'importar' | 'contatos' | 'usuarios' | 'config';

const PERMISSOES: Record<Papel, Permissao[]> = {
  admin: ['lancar', 'baixar', 'importar', 'contatos', 'usuarios', 'config'],
  financeiro: ['lancar', 'baixar', 'importar', 'contatos'],
  leitura: [],
};

export const NOME_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  financeiro: 'Financeiro',
  leitura: 'Consulta',
};

export const DESCRICAO_PAPEL: Record<Papel, string> = {
  admin: 'Tudo, inclusive usuários e configurações da empresa.',
  financeiro: 'Lança contas, dá baixa, importa notas e cadastra contatos.',
  leitura: 'Só visualiza e exporta. Ideal para o contador.',
};

const CHAVE_SESSAO = 'prumo:sessao';

interface Sessao {
  usuarioId: string;
  desde: string;
}

function lerSessao(): Sessao | null {
  try {
    const s = localStorage.getItem(CHAVE_SESSAO) ?? sessionStorage.getItem(CHAVE_SESSAO);
    return s ? (JSON.parse(s) as Sessao) : null;
  } catch {
    return null;
  }
}

interface Api {
  usuario: Usuario | null;
  entrar: (login: string, senha: string, lembrar: boolean) => { ok: true } | { ok: false; erro: string };
  sair: () => void;
  pode: (p: Permissao) => boolean;
}

const Ctx = createContext<Api | null>(null);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const db = useDb();
  const [sessao, setSessao] = useState<Sessao | null>(lerSessao);
  const usuario = sessao ? db.usuarios.find((u) => u.id === sessao.usuarioId && u.ativo) ?? null : null;

  const entrar = useCallback<Api['entrar']>((login, senha, lembrar) => {
    const termo = login.trim().toLowerCase();
    if (!termo || !senha) return { ok: false, erro: 'Informe usuário e senha.' };
    const u = getDb().usuarios.find((x) => x.login === termo || x.email === termo);
    if (!u || !iguais(hashSenha(senha, u.senhaSal), u.senhaHash)) return { ok: false, erro: 'Usuário ou senha incorretos.' };
    if (!u.ativo) return { ok: false, erro: 'Este usuário está desativado. Fale com o administrador.' };
    const s: Sessao = { usuarioId: u.id, desde: new Date().toISOString() };
    try {
      (lembrar ? localStorage : sessionStorage).setItem(CHAVE_SESSAO, JSON.stringify(s));
      (lembrar ? sessionStorage : localStorage).removeItem(CHAVE_SESSAO);
    } catch {
      /* armazenamento indisponível: a sessão vale só enquanto a aba estiver aberta */
    }
    registrarAcesso(u.id);
    setSessao(s);
    return { ok: true };
  }, []);

  const sair = useCallback(() => {
    try {
      localStorage.removeItem(CHAVE_SESSAO);
      sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      /* ignora */
    }
    setSessao(null);
  }, []);

  const api = useMemo<Api>(
    () => ({ usuario, entrar, sair, pode: (p) => (usuario ? PERMISSOES[usuario.papel].includes(p) : false) }),
    [usuario, entrar, sair],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useAuth fora do ProvedorAuth');
  return api;
}

/** Para telas internas (sempre há usuário logado). */
export function useUsuario(): Usuario {
  const { usuario } = useAuth();
  if (!usuario) throw new Error('Sem usuário logado');
  return usuario;
}
