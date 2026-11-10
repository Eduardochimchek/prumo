// Marca do Prumo: o fio de prumo — ferramenta que mostra o que está "a prumo", na vertical certa.
// "Pôr a empresa no prumo" = pôr em ordem. O peso do prumo é feito de latão, daí a cor.

export function MarcaSimbolo({ tam = 22, cor = 'var(--latao)', fio = 'currentColor' }: { tam?: number; cor?: string; fio?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} aria-hidden="true">
      <path d="M12 0.5v7" stroke={fio} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.1 7.6h5.8l1.3 3.6L12 23.2 7.8 11.2z" fill={cor} />
      <path d="M9.1 7.6h5.8" stroke={fio} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Marca({ tam = 22, mostrarNome = true }: { tam?: number; mostrarNome?: boolean }) {
  return (
    <span className="marca" aria-label="Prumo">
      <MarcaSimbolo tam={tam} />
      {mostrarNome && <span className="marca__nome">Prumo</span>}
    </span>
  );
}

/** Prumo animado: balança e assenta — usado no login e como "carregando". */
export function PrumoPendulo({ altura = 240 }: { altura?: number }) {
  return (
    <svg className="pendulo" viewBox="0 0 120 300" height={altura} aria-hidden="true">
      <g className="pendulo__corpo">
        <line x1="60" y1="0" x2="60" y2="208" stroke="currentColor" strokeWidth="1.2" />
        <rect x="52" y="204" width="16" height="7" rx="1.5" fill="var(--latao)" />
        <path d="M50 212h20l4.5 13L60 292 45.5 225z" fill="var(--latao)" />
        <path d="M60 212v80" stroke="rgb(0 0 0 / 0.18)" strokeWidth="1" />
      </g>
    </svg>
  );
}
