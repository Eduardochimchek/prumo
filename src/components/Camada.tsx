// Modal e gaveta sobre o <dialog> nativo: foco preso, Esc, camada superior e fundo de graça.
// No celular, ambos viram "folha" que sobe de baixo (ver components.css).

import { useEffect, useRef, type ReactNode } from 'react';
import { Icone } from './Icone';

export function Camada({
  aberta,
  aoFechar,
  titulo,
  sobretitulo,
  children,
  rodape,
  tipo = 'modal',
  largo,
  rotulo,
}: {
  aberta: boolean;
  aoFechar: () => void;
  titulo?: ReactNode;
  sobretitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  tipo?: 'modal' | 'gaveta';
  largo?: boolean;
  rotulo?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = 'hidden';
    } else if (!aberta && d.open) {
      d.close();
    }
  }, [aberta]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const aoCancelar = (e: Event) => {
      e.preventDefault();
      fecharRef.current();
    };
    const aoFecharNativo = () => {
      document.documentElement.style.overflow = '';
    };
    d.addEventListener('cancel', aoCancelar);
    d.addEventListener('close', aoFecharNativo);
    return () => {
      d.removeEventListener('cancel', aoCancelar);
      d.removeEventListener('close', aoFecharNativo);
      document.documentElement.style.overflow = '';
    };
  }, []);

  const classe = `camada ${tipo}${largo ? ` ${tipo}--${tipo === 'modal' ? 'largo' : 'larga'}` : ''}`;

  return (
    <dialog
      ref={ref}
      className={classe}
      aria-label={rotulo ?? (typeof titulo === 'string' ? titulo : undefined)}
      onMouseDown={(e) => {
        // clique no fundo (fora da caixa) fecha
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (!dentro) aoFechar();
        }
      }}
    >
      {aberta && (
        <div className="camada__estrutura">
          <div className="alca" />
          {(titulo || sobretitulo) && (
            <header className="camada__cabeca">
              <div style={{ minWidth: 0 }}>
                {sobretitulo && <span className="rotulo">{sobretitulo}</span>}
                {titulo && <h2>{titulo}</h2>}
              </div>
              <button type="button" className="btn btn--fantasma btn--icone btn--p" onClick={aoFechar} aria-label="Fechar">
                <Icone nome="fechar" />
              </button>
            </header>
          )}
          <div className="camada__corpo">{children}</div>
          {rodape && <footer className="camada__rodape">{rodape}</footer>}
        </div>
      )}
    </dialog>
  );
}
