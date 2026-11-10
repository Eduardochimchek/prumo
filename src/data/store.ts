// Armazenamento local-first da V1: o banco inteiro vive em memória e é persistido no
// localStorage do navegador. Toda escrita passa por `atualizar()`, que notifica os componentes.
// Na V2, este módulo é substituído por um cliente HTTP com a MESMA interface (getDb/atualizar/useDb).

import { useSyncExternalStore } from 'react';
import type { Database } from './types';
import { criarBaseDemo } from './seed';

export const VERSAO_BANCO = 1;
const CHAVE = 'prumo:db:v1';

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();
let estado: Database | null = null;
let erroPersistencia: string | null = null;

function carregar(): Database {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const db = JSON.parse(bruto) as Database;
      if (db && db.versao === VERSAO_BANCO && Array.isArray(db.lancamentos)) return db;
    }
  } catch {
    // localStorage indisponível (modo privado) ou JSON corrompido: recomeça com a demonstração
  }
  const db = criarBaseDemo();
  persistir(db);
  return db;
}

function persistir(db: Database) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(db));
    erroPersistencia = null;
  } catch (e) {
    erroPersistencia = e instanceof Error ? e.message : 'Falha ao salvar os dados neste navegador';
  }
}

export function getDb(): Database {
  if (!estado) estado = carregar();
  return estado;
}

export function atualizar(fn: (db: Database) => Database): void {
  estado = fn(getDb());
  persistir(estado);
  ouvintes.forEach((o) => o());
}

export function substituirBanco(db: Database): void {
  atualizar(() => db);
}

export function restaurarDemonstracao(): void {
  substituirBanco(criarBaseDemo());
}

export const ultimoErroPersistencia = () => erroPersistencia;

export function inscrever(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

// Sincroniza abas abertas ao mesmo tempo (outra aba salvou => recarrega aqui).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== CHAVE || !e.newValue) return;
    try {
      estado = JSON.parse(e.newValue) as Database;
      ouvintes.forEach((o) => o());
    } catch {
      /* ignora */
    }
  });
}

/** Hook: devolve o banco inteiro (referência estável até a próxima escrita). Derive com useMemo. */
export function useDb(): Database {
  return useSyncExternalStore(inscrever, getDb, getDb);
}

export function exportarBackup(): string {
  return JSON.stringify(getDb(), null, 2);
}

export function validarBackup(json: string): Database {
  const db = JSON.parse(json) as Database;
  const ok =
    db &&
    typeof db === 'object' &&
    db.versao === VERSAO_BANCO &&
    Array.isArray(db.usuarios) &&
    Array.isArray(db.lancamentos) &&
    Array.isArray(db.contatos) &&
    db.empresa;
  if (!ok) throw new Error('Arquivo de backup inválido ou de outra versão do Prumo.');
  if (!db.usuarios.some((u) => u.papel === 'admin' && u.ativo)) {
    throw new Error('O backup não tem nenhum administrador ativo — importá-lo trancaria o sistema.');
  }
  return db;
}
