// Pequenos utilitários sem dependências: ids, aleatório com semente, CSV e download.

export function uid(prefixo = ''): string {
  return prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** Gerador pseudoaleatório determinístico (mulberry32), dados de demonstração estáveis. */
export function aleatorio(semente: number) {
  let s = semente >>> 0;
  const proximo = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    proximo,
    inteiro: (min: number, max: number) => Math.floor(proximo() * (max - min + 1)) + min,
    escolher: <T,>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)],
    chance: (p: number) => proximo() < p,
    /** varia(1000, 0.1) => entre 900 e 1100 */
    varia: (base: number, pct: number) => Math.round(base * (1 + (proximo() * 2 - 1) * pct)),
    digitos: (n: number) => Array.from({ length: n }, () => Math.floor(proximo() * 10)).join(''),
    /** Fisher-Yates determinístico (nunca use sort com comparador aleatório: depende do motor JS). */
    embaralhar: <T,>(lista: readonly T[]): T[] => {
      const a = [...lista];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(proximo() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

export type Aleatorio = ReturnType<typeof aleatorio>;

type Celula = string | number | null | undefined;

/** CSV no padrão do Excel brasileiro: separador ';', BOM UTF-8. */
export function gerarCsv(linhas: Celula[][]): string {
  const esc = (v: Celula) => {
    const s = v == null ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
}

export function baixarArquivo(nome: string, conteudo: string | Blob, tipo = 'text/plain;charset=utf-8'): void {
  const blob = typeof conteudo === 'string' ? new Blob([conteudo], { type: tipo }) : conteudo;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function lerArquivoTexto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ''));
    leitor.onerror = () => reject(leitor.error ?? new Error('Falha ao ler o arquivo'));
    leitor.readAsText(arquivo, 'utf-8');
  });
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function gerarSenha(tamanho = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(tamanho);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(arr);
  else for (let i = 0; i < tamanho; i++) arr[i] = Math.floor(Math.random() * 1e9);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}
