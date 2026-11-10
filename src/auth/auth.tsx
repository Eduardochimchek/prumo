// Sessão e permissões. V1: autenticação local (o banco de usuários vive no navegador).
// Proteções: bloqueio após tentativas erradas, sessão que expira por inatividade,
// senha provisória obrigando troca e hash refeito automaticamente quando antigo.
// V2: troca `entrar/sair` por chamadas à API (sessão httpOnly) mantendo esta interface.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDb, useDb } from '../data/store';
import { conferirSenha, registrarAcesso, registrarEventoSeguranca } from '../data/actions';
import { limparFalhas, registrarFalha, sessaoExpirada, tempoBloqueio } from '../lib/seguranca';
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
  ultimaAtividade?: string;
  lembrar?: boolean;
}

function armazenamento(lembrar?: boolean): Storage {
  return lembrar ? localStorage : sessionStorage;
}

function lerSessao(): Sessao | null {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO) ?? sessionStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Sessao;
    if (sessaoExpirada(s)) {
      apagarSessao();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function gravarSessao(s: Sessao) {
  try {
    armazenamento(s.lembrar).setItem(CHAVE_SESSAO, JSON.stringify(s));
    armazenamento(!s.lembrar).removeItem(CHAVE_SESSAO);
  } catch {
    /* sem armazenamento: a sessão vale só enquanto a aba estiver aberta */
  }
}

function apagarSessao() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
    sessionStorage.removeItem(CHAVE_SESSAO);
  } catch {
    /* ignora */
  }
}

type ResultadoEntrar = { ok: true } | { ok: false; erro: string };

interface Api {
  usuario: Usuario | null;
  entrar: (login: string, senha: string, lembrar: boolean) => ResultadoEntrar;
  sair: (motivo?: string) => void;
  pode: (p: Permissao) => boolean;
  /** mensagem para mostrar na tela de login (ex.: sessão encerrada por inatividade) */
  aviso: string | null;
}

const Ctx = createContext<Api | null>(null);

const minutos = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const db = useDb();
  const [sessao, setSessao] = useState<Sessao | null>(lerSessao);
  const [aviso, setAviso] = useState<string | null>(null);
  const usuario = sessao ? db.usuarios.find((u) => u.id === sessao.usuarioId && u.ativo) ?? null : null;

  const entrar = useCallback<Api['entrar']>((login, senha, lembrar) => {
    const termo = login.trim().toLowerCase();
    if (!termo || !senha) return { ok: false, erro: 'Informe usuário e senha.' };
    const bloqueio = tempoBloqueio(termo);
    if (bloqueio) return { ok: false, erro: `Muitas tentativas erradas. Tente de novo em ${minutos(bloqueio)} min.` };
    const u = getDb().usuarios.find((x) => x.login === termo || x.email === termo);
    if (!u || !conferirSenha(u, senha)) {
      const r = registrarFalha(termo);
      if (r.bloqueioMs) {
        if (u) registrarEventoSeguranca(u.id, `teve o acesso bloqueado por ${minutos(r.bloqueioMs)} min após tentativas de senha erradas`);
        return { ok: false, erro: `Muitas tentativas erradas. Acesso bloqueado por ${minutos(r.bloqueioMs)} min.` };
      }
      // mesma mensagem para usuário inexistente e senha errada (não revela quem existe)
      return { ok: false, erro: `Usuário ou senha incorretos.${r.restantes <= 2 ? ` Restam ${r.restantes} tentativa(s).` : ''}` };
    }
    if (!u.ativo) return { ok: false, erro: 'Este usuário está desativado. Fale com o administrador.' };
    limparFalhas(termo);
    const agora = new Date().toISOString();
    const s: Sessao = { usuarioId: u.id, desde: agora, ultimaAtividade: agora, lembrar };
    gravarSessao(s);
    registrarAcesso(u.id, senha);
    setAviso(null);
    setSessao(s);
    return { ok: true };
  }, []);

  const sair = useCallback((motivo?: string) => {
    apagarSessao();
    setAviso(motivo ?? null);
    setSessao(null);
  }, []);

  // Inatividade: renova a sessão ao usar o sistema e encerra quando passar do limite.
  useEffect(() => {
    if (!sessao) return;
    let ultimaGravacao = 0;
    const tocar = () => {
      const agora = Date.now();
      if (agora - ultimaGravacao < 30_000) return;
      ultimaGravacao = agora;
      gravarSessao({ ...sessao, ultimaAtividade: new Date(agora).toISOString() });
    };
    const verificar = () => {
      const atual = lerSessao();
      if (!atual) sair(sessao.lembrar ? 'Sua sessão expirou. Entre de novo.' : 'Sessão encerrada por inatividade (30 minutos). Entre de novo.');
    };
    const eventos = ['pointerdown', 'keydown', 'scroll'] as const;
    eventos.forEach((e) => window.addEventListener(e, tocar, { passive: true }));
    const intervalo = window.setInterval(verificar, 60_000);
    document.addEventListener('visibilitychange', verificar);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, tocar));
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', verificar);
    };
  }, [sessao, sair]);

  const api = useMemo<Api>(
    () => ({ usuario, entrar, sair, aviso, pode: (p) => (usuario ? PERMISSOES[usuario.papel].includes(p) : false) }),
    [usuario, entrar, sair, aviso],
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
