// Tema claro/escuro/sistema — preferência por aparelho (localStorage).
// O index.html aplica o tema antes do React carregar, para não piscar.

import { useEffect, useState } from 'react';

export type Tema = 'sistema' | 'claro' | 'escuro';
const CHAVE = 'prumo:tema';

export function lerTema(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === 'claro' || t === 'escuro' ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function aplicarTema(t: Tema): void {
  const raiz = document.documentElement;
  if (t === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', t === 'escuro' ? 'dark' : 'light');
  const escuro = t === 'escuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#11100d' : '#f3f0e9');
}

export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>(lerTema);
  useEffect(() => {
    aplicarTema(tema);
    try {
      if (tema === 'sistema') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, tema);
    } catch {
      /* ignora */
    }
  }, [tema]);
  return [tema, setTema];
}
