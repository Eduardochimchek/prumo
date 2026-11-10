// Banco Postgres de teste (PGlite: Postgres de verdade rodando dentro do Node, sem Docker).
// Aplica a simulação do auth do Supabase e TODAS as migrações, na ordem, como em produção.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pastaMigracoes = path.join(aqui, '..', 'migrations');

export async function criarBanco(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(path.join(aqui, 'auth-local.sql'), 'utf8'));
  for (const arquivo of readdirSync(pastaMigracoes).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(pastaMigracoes, arquivo), 'utf8'));
  }
  return db;
}

/** Executa `fn` como um usuário logado (papel authenticated + auth.uid()), como faz o Supabase. */
export async function como<T>(db: PGlite, usuarioId: string | null, fn: () => Promise<T>): Promise<T> {
  if (usuarioId === null) await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  else await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${usuarioId.replace(/[^0-9a-f-]/gi, '')}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Espera que a operação seja recusada pelo banco. Devolve a mensagem de erro. */
export async function recusa(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('esperava que o banco recusasse, mas a operação passou');
}
