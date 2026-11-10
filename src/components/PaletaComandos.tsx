// Paleta de comandos (Ctrl+K / ⌘K / "/"): busca tudo e executa ações sem caçar menus.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { normalizarBusca, moeda } from '../lib/format';
import { useDb } from '../data/store';
import { buscar } from '../data/selectors';
import { useAuth } from '../auth/auth';
import { Icone, type NomeIcone } from './Icone';

export interface Comando {
  id: string;
  titulo: string;
  detalhe?: string;
  icone: NomeIcone;
  grupo: 'Ações' | 'Ir para' | 'Resultados';
  valor?: number;
  executar: () => void;
  palavras?: string;
}

export function PaletaComandos({ aberta, aoFechar, acoes }: { aberta: boolean; aoFechar: () => void; acoes: Comando[] }) {
  const db = useDb();
  const navegar = useNavigate();
  const { pode } = useAuth();
  const [termo, setTermo] = useState('');
  const [ativo, setAtivo] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) {
      d.showModal();
      setTermo('');
      setAtivo(0);
      setTimeout(() => entrada.current?.focus(), 10);
    } else if (!aberta && d.open) d.close();
  }, [aberta]);

  const paginas: Comando[] = useMemo(() => {
    const p: [string, string, NomeIcone, string][] = [
      ['Hoje', '/', 'hoje', 'painel inicio resumo'],
      ['Contas a pagar', '/contas/pagar', 'pagar', 'despesas fornecedores boletos'],
      ['Contas a receber', '/contas/receber', 'receber', 'clientes vendas'],
      ['Notas fiscais', '/notas', 'nota', 'nfe xml sefaz danfe'],
      ['Fluxo de caixa', '/fluxo', 'fluxo', 'projecao saldo'],
      ['Contatos', '/contatos', 'contatos', 'clientes fornecedores cadastro'],
      ['Relatórios', '/relatorios', 'relatorios', 'dre resultado exportar'],
    ];
    if (pode('usuarios')) p.push(['Usuários', '/usuarios', 'usuarios', 'acessos permissoes senha']);
    p.push(['Configurações', '/configuracoes', 'ajustes', 'empresa contas bancarias categorias backup tema sefaz']);
    return p.map(([titulo, rota, icone, palavras]) => ({ id: `ir-${rota}`, titulo, icone, grupo: 'Ir para' as const, palavras, executar: () => navegar(rota) }));
  }, [navegar, pode]);

  const lista = useMemo(() => {
    const t = normalizarBusca(termo);
    const casa = (c: Comando) => !t || normalizarBusca(`${c.titulo} ${c.palavras ?? ''}`).includes(t);
    const base = [...acoes.filter(casa), ...paginas.filter(casa)];
    if (t.length >= 2) {
      for (const r of buscar(db, termo, 6)) {
        base.push({
          id: `${r.tipo}-${r.id}`,
          titulo: r.titulo,
          detalhe: r.detalhe,
          valor: r.valor,
          icone: r.tipo === 'contato' ? 'contatos' : r.tipo === 'nota' ? 'nota' : r.rota.includes('pagar') ? 'pagar' : 'receber',
          grupo: 'Resultados',
          executar: () => navegar(r.rota),
        });
      }
    }
    return base;
  }, [termo, acoes, paginas, db, navegar]);

  const executar = (c?: Comando) => {
    if (!c) return;
    aoFechar();
    setTimeout(c.executar, 0);
  };

  let grupoAnterior = '';

  return (
    <dialog
      ref={ref}
      className="camada paleta"
      aria-label="Buscar ou executar"
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      {aberta && (
        <>
          <div className="paleta__busca">
            <Icone nome="busca" tam={20} />
            <input
              ref={entrada}
              value={termo}
              placeholder="Buscar conta, cliente, nota, valor… ou digite uma ação"
              aria-label="Buscar"
              onChange={(e) => {
                setTermo(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setAtivo((a) => Math.min(lista.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setAtivo((a) => Math.max(0, a - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  executar(lista[ativo]);
                }
              }}
            />
            <span className="kbd">Esc</span>
          </div>
          <div className="paleta__lista" role="listbox">
            {lista.length === 0 && <p className="muted" style={{ padding: 18 }}>Nada encontrado para “{termo}”.</p>}
            {lista.map((c, i) => {
              const cabecalho = c.grupo !== grupoAnterior ? c.grupo : null;
              grupoAnterior = c.grupo;
              return (
                <div key={c.id}>
                  {cabecalho && <div className="paleta__grupo rotulo">{cabecalho}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === ativo}
                    data-ativo={i === ativo}
                    className="paleta__item"
                    onMouseEnter={() => setAtivo(i)}
                    onClick={() => executar(c)}
                  >
                    <Icone nome={c.icone} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="truncar" style={{ display: 'block' }}>
                        {c.titulo}
                      </span>
                      {c.detalhe && <span className="detalhe">{c.detalhe}</span>}
                    </span>
                    {c.valor !== undefined && <span className="num muted">{moeda(c.valor)}</span>}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="paleta__rodape">
            <span>
              <span className="kbd">↑</span> <span className="kbd">↓</span> navegar
            </span>
            <span>
              <span className="kbd">Enter</span> abrir
            </span>
            <span>
              <span className="kbd">Ctrl</span> <span className="kbd">K</span> de qualquer tela
            </span>
          </div>
        </>
      )}
    </dialog>
  );
}
