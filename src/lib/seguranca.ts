// Regras de segurança da V1 (lado do cliente): política de senha, bloqueio por tentativas e sessão.
// Na V2 as mesmas regras passam a valer no servidor (o cliente continua validando para dar retorno rápido).

import { normalizarBusca } from './format';

/** Iterações do hash de senha para senhas novas (cada usuário guarda as suas: upgrade transparente). */
export const ITERACOES_SENHA = 20_000;
export const ITERACOES_LEGADO = 1_500;

export const TAMANHO_MINIMO_SENHA = 8;

const SENHAS_COMUNS = new Set([
  '12345678', '123456789', '1234567890', '87654321', 'senha123', 'senha1234', 'password', 'password1', 'qwerty123',
  'admin123', 'administrador', 'mudar123', 'trocar123', 'abc12345', 'brasil123', 'prumo123', 'prumo2026', '11111111', '00000000',
]);

export interface AvaliacaoSenha {
  ok: boolean;
  /** 0 (fraca) a 4 (forte) */
  forca: number;
  problemas: string[];
}

export function avaliarSenha(senha: string, contexto: { login?: string; nome?: string; email?: string } = {}): AvaliacaoSenha {
  const problemas: string[] = [];
  if (senha.length < TAMANHO_MINIMO_SENHA) problemas.push(`Use pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) problemas.push('Misture letras e números.');
  if (SENHAS_COMUNS.has(senha.toLowerCase())) problemas.push('Essa senha é muito comum.');
  const s = normalizarBusca(senha);
  const partes = [contexto.login, contexto.email?.split('@')[0], ...(contexto.nome ?? '').split(/\s+/)]
    .map((p) => normalizarBusca(p ?? ''))
    .filter((p) => p.length >= 4);
  if (partes.some((p) => s.includes(p))) problemas.push('Não use seu nome ou login na senha.');
  if (/^(.)\1+$/.test(senha)) problemas.push('Não repita o mesmo caractere.');

  let forca = 0;
  if (senha.length >= TAMANHO_MINIMO_SENHA) forca++;
  if (senha.length >= 12) forca++;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) forca++;
  if (/\d/.test(senha) && /[^a-zA-Z0-9]/.test(senha)) forca++;
  if (problemas.length) forca = Math.min(forca, 1);
  return { ok: problemas.length === 0, forca, problemas };
}

// ---------- Bloqueio por tentativas (contra adivinhação de senha) ----------

export const MAX_TENTATIVAS = 5;
const CHAVE_TENTATIVAS = 'prumo:tentativas';

interface RegistroTentativas {
  falhas: number;
  bloqueios: number;
  bloqueadoAte?: number;
}

type Mapa = Record<string, RegistroTentativas>;

function lerMapa(): Mapa {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_TENTATIVAS) ?? '{}') as Mapa;
  } catch {
    return {};
  }
}

function gravarMapa(m: Mapa) {
  try {
    localStorage.setItem(CHAVE_TENTATIVAS, JSON.stringify(m));
  } catch {
    /* sem armazenamento: o bloqueio vale só nesta aba */
  }
}

const chaveLogin = (login: string) => login.trim().toLowerCase();

/** Milissegundos que ainda faltam de bloqueio (0 = liberado). */
export function tempoBloqueio(login: string, agora = Date.now()): number {
  const r = lerMapa()[chaveLogin(login)];
  return r?.bloqueadoAte && r.bloqueadoAte > agora ? r.bloqueadoAte - agora : 0;
}

/** Registra uma falha. Devolve o bloqueio aplicado (ms) ou 0, e quantas tentativas restam. */
export function registrarFalha(login: string, agora = Date.now()): { bloqueioMs: number; restantes: number } {
  const m = lerMapa();
  const k = chaveLogin(login);
  const r = m[k] ?? { falhas: 0, bloqueios: 0 };
  r.falhas += 1;
  let bloqueioMs = 0;
  if (r.falhas >= MAX_TENTATIVAS) {
    // 1 min, 2 min, 4 min… até 15 min
    bloqueioMs = Math.min(15, 2 ** r.bloqueios) * 60_000;
    r.bloqueios += 1;
    r.falhas = 0;
    r.bloqueadoAte = agora + bloqueioMs;
  }
  m[k] = r;
  gravarMapa(m);
  return { bloqueioMs, restantes: bloqueioMs ? 0 : MAX_TENTATIVAS - r.falhas };
}

export function limparFalhas(login: string): void {
  const m = lerMapa();
  delete m[chaveLogin(login)];
  gravarMapa(m);
}

// ---------- Sessão ----------

/** Sem "manter conectado": encerra após 30 min parado. Com: no máximo 30 dias. */
export const INATIVIDADE_MS = 30 * 60_000;
export const SESSAO_LONGA_MS = 30 * 24 * 60 * 60_000;

export function sessaoExpirada(s: { desde: string; ultimaAtividade?: string; lembrar?: boolean }, agora = Date.now()): boolean {
  const desde = Date.parse(s.desde);
  if (s.lembrar) return agora - desde > SESSAO_LONGA_MS;
  const ultima = Date.parse(s.ultimaAtividade ?? s.desde);
  return agora - ultima > INATIVIDADE_MS;
}
