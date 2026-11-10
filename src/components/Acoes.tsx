// Central de ações: qualquer tela pode abrir "nova conta", "dar baixa", "importar XML" etc.
// Os diálogos moram aqui uma vez só (não espalhados pelas páginas).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { addMeses } from '../lib/dates';
import { useDb } from '../data/store';
import type { Contato, TipoContato } from '../data/types';
import { useAuth } from '../auth/auth';
import { LancamentoForm, type PresetLancamento } from './forms/LancamentoForm';
import { BaixaForm } from './forms/BaixaForm';
import { DetalheLancamento } from './forms/DetalheLancamento';
import { ContatoForm } from './forms/ContatoForm';
import { ImportarNotas } from './forms/ImportarNotas';
import { PaletaComandos, type Comando } from './PaletaComandos';

interface Api {
  novoLancamento: (preset: PresetLancamento) => void;
  editarLancamento: (id: string) => void;
  verLancamento: (id: string) => void;
  darBaixa: (ids: string[], aoConcluir?: (ids: string[]) => void) => void;
  novoContato: (tipo?: TipoContato, aoSalvar?: (c: Contato) => void) => void;
  editarContato: (id: string) => void;
  importarNotas: (aoConcluir?: (ids: string[]) => void) => void;
  abrirPaleta: () => void;
}

const Ctx = createContext<Api | null>(null);

export function ProvedorAcoes({ children }: { children: ReactNode }) {
  const db = useDb();
  const { pode } = useAuth();
  const [chave, setChave] = useState(0);
  const novaChave = () => setChave((c) => c + 1);

  const [form, setForm] = useState<{ preset: PresetLancamento; editandoId?: string } | null>(null);
  const [detalhe, setDetalhe] = useState<{ id: string; recemPago?: boolean } | null>(null);
  const [baixa, setBaixa] = useState<{ ids: string[]; aoConcluir?: (ids: string[]) => void } | null>(null);
  const [contato, setContato] = useState<{ editandoId?: string; tipo: TipoContato; aoSalvar?: (c: Contato) => void } | null>(null);
  const [importar, setImportar] = useState<{ aoConcluir?: (ids: string[]) => void } | null>(null);
  const [paleta, setPaleta] = useState(false);

  const api = useMemo<Api>(
    () => ({
      novoLancamento: (preset) => {
        novaChave();
        setForm({ preset });
      },
      editarLancamento: (id) => {
        novaChave();
        setForm({ preset: { tipo: 'pagar' }, editandoId: id });
      },
      verLancamento: (id) => setDetalhe({ id }),
      darBaixa: (ids, aoConcluir) => {
        novaChave();
        setBaixa({ ids, aoConcluir });
      },
      novoContato: (tipo = 'cliente', aoSalvar) => {
        novaChave();
        setContato({ tipo, aoSalvar });
      },
      editarContato: (id) => {
        novaChave();
        setContato({ editandoId: id, tipo: 'cliente' });
      },
      importarNotas: (aoConcluir) => {
        novaChave();
        setImportar({ aoConcluir });
      },
      abrirPaleta: () => setPaleta(true),
    }),
    [],
  );

  // Mudou de página (ex.: clicou no link do fornecedor dentro do detalhe)? Fecha as camadas.
  const { pathname } = useLocation();
  useEffect(() => {
    setDetalhe(null);
    setForm(null);
    setBaixa(null);
    setContato(null);
    setImportar(null);
  }, [pathname]);

  // Atalhos: Ctrl+K / ⌘K e "/" abrem a paleta
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const digitando = alvo.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaleta((p) => !p);
      } else if (e.key === '/' && !digitando && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        setPaleta(true);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const comandos: Comando[] = useMemo(() => {
    const c: Comando[] = [];
    if (pode('lancar')) {
      c.push({ id: 'novo-pagar', titulo: 'Nova conta a pagar', icone: 'pagar', grupo: 'Ações', palavras: 'lancar despesa boleto', executar: () => api.novoLancamento({ tipo: 'pagar' }) });
      c.push({ id: 'novo-receber', titulo: 'Nova conta a receber', icone: 'receber', grupo: 'Ações', palavras: 'lancar receita venda', executar: () => api.novoLancamento({ tipo: 'receber' }) });
    }
    if (pode('importar')) c.push({ id: 'importar', titulo: 'Importar XML de nota fiscal', icone: 'enviar', grupo: 'Ações', palavras: 'nfe xml', executar: () => api.importarNotas() });
    if (pode('contatos')) c.push({ id: 'novo-contato', titulo: 'Cadastrar cliente ou fornecedor', icone: 'contatos', grupo: 'Ações', palavras: 'cnpj contato', executar: () => api.novoContato() });
    return c;
  }, [api, pode]);

  const editando = form?.editandoId ? db.lancamentos.find((l) => l.id === form.editandoId) : undefined;
  const titulosBaixa = baixa ? db.lancamentos.filter((l) => baixa.ids.includes(l.id)) : [];
  const contatoEditando = contato?.editandoId ? db.contatos.find((c) => c.id === contato.editandoId) : undefined;

  const duplicar = useCallback(
    (id: string) => {
      const l = db.lancamentos.find((x) => x.id === id);
      if (!l) return;
      setDetalhe(null);
      novaChave();
      setForm({ preset: { tipo: l.tipo, descricao: l.descricao, contatoId: l.contatoId, valor: l.valor, vencimento: addMeses(l.vencimento, 1) } });
    },
    [db.lancamentos],
  );

  return (
    <Ctx.Provider value={api}>
      {children}

      {form && (
        <LancamentoForm
          key={`f${chave}`}
          aberta
          aoFechar={() => setForm(null)}
          preset={form.preset}
          editando={editando}
          aoCriarContato={(tipo, aoSalvar) => api.novoContato(tipo, (c) => aoSalvar(c.id))}
        />
      )}

      <DetalheLancamento
        id={detalhe?.id ?? null}
        recemPago={detalhe?.recemPago}
        aoFechar={() => setDetalhe(null)}
        aoEditar={(id) => api.editarLancamento(id)}
        aoBaixar={(ids) => api.darBaixa(ids, () => setDetalhe((d) => (d ? { ...d, recemPago: true } : d)))}
        aoDuplicar={duplicar}
      />

      {baixa && titulosBaixa.length > 0 && (
        <BaixaForm
          key={`b${chave}`}
          aberta
          aoFechar={() => setBaixa(null)}
          titulos={titulosBaixa}
          aoConcluir={baixa.aoConcluir}
        />
      )}

      {contato && (
        <ContatoForm
          key={`c${chave}`}
          aberta
          aoFechar={() => setContato(null)}
          editando={contatoEditando}
          tipoInicial={contato.tipo}
          aoSalvar={contato.aoSalvar}
        />
      )}

      {importar && <ImportarNotas key={`i${chave}`} aberta aoFechar={() => setImportar(null)} aoConcluir={importar.aoConcluir} />}

      <PaletaComandos aberta={paleta} aoFechar={() => setPaleta(false)} acoes={comandos} />
    </Ctx.Provider>
  );
}

export function useAcoes(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error('useAcoes fora do ProvedorAcoes');
  return api;
}
