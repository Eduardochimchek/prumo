// Avisos (toasts) com ação opcional, o "Desfazer" depois de uma baixa, por exemplo.
//
// Detalhe importante: um <dialog> modal deixa todo o resto da página inerte (sem clique).
// Por isso os avisos são renderizados DENTRO do diálogo aberto mais recente (via portal),
// senão o botão "Desfazer" ficaria visível mas impossível de clicar.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Aviso {
  id: number;
  texto: string;
  tipo: 'normal' | 'erro';
  acao?: { rotulo: string; executar: () => void };
}

interface Api {
  avisar: (texto: string, opcoes?: { tipo?: Aviso['tipo']; acao?: Aviso['acao']; duracao?: number }) => void;
  erro: (e: unknown) => void;
}

const Ctx = createContext<Api | null>(null);

function dialogoAberto(): HTMLElement {
  const abertos = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'));
  return abertos[abertos.length - 1] ?? document.body;
}

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const seq = useRef(0);

  // acompanha abertura/fechamento de diálogos para mover os avisos para a camada de cima
  useEffect(() => {
    const atualizar = () => setAlvo(dialogoAberto());
    atualizar();
    const obs = new MutationObserver(atualizar);
    obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'], childList: true });
    return () => obs.disconnect();
  }, []);

  const remover = useCallback((id: number) => setLista((l) => l.filter((a) => a.id !== id)), []);

  const avisar = useCallback<Api['avisar']>(
    (texto, opcoes = {}) => {
      const id = ++seq.current;
      setLista((l) => [...l.slice(-2), { id, texto, tipo: opcoes.tipo ?? 'normal', acao: opcoes.acao }]);
      setTimeout(() => remover(id), opcoes.duracao ?? (opcoes.acao ? 7000 : 4200));
    },
    [remover],
  );

  const erro = useCallback<Api['erro']>(
    (e) => avisar(e instanceof Error ? e.message : String(e), { tipo: 'erro', duracao: 6000 }),
    [avisar],
  );

  const api = useMemo(() => ({ avisar, erro }), [avisar, erro]);

  const conteudo = (
    <div className="avisos" role="status" aria-live="polite">
      {lista.map((a) => (
        <div key={a.id} className={`aviso${a.tipo === 'erro' ? ' aviso--erro' : ''}`}>
          <span className="aviso__texto">{a.texto}</span>
          {a.acao && (
            <button
              type="button"
              onClick={() => {
                a.acao?.executar();
                remover(a.id);
              }}
            >
              {a.acao.rotulo}
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {alvo && createPortal(conteudo, alvo)}
    </Ctx.Provider>
  );
}

export function useAvisos(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useAvisos fora do ProvedorAvisos');
  return api;
}
