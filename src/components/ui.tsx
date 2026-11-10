// Primitivas de interface do Prumo. Todas usam as classes de styles/components.css.

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icone, type NomeIcone } from './Icone';
import { iniciais, moeda, valorSemSimbolo } from '../lib/format';
import type { Status } from '../data/selectors';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- Botão ----------

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'entrada';

export function Botao({
  variante = 'secundario',
  tam,
  icone,
  iconeDepois,
  bloco,
  className,
  children,
  type = 'button',
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tam?: 'p' | 'g';
  icone?: NomeIcone;
  iconeDepois?: NomeIcone;
  bloco?: boolean;
}) {
  const soIcone = !children && icone;
  return (
    <button
      type={type}
      className={cx('btn', `btn--${variante}`, tam && `btn--${tam}`, bloco && 'btn--bloco', soIcone && 'btn--icone', className)}
      {...resto}
    >
      {icone && <Icone nome={icone} tam={tam === 'p' ? 16 : 18} />}
      {children}
      {iconeDepois && <Icone nome={iconeDepois} tam={16} />}
    </button>
  );
}

// ---------- Campos ----------

export function Campo({
  rotulo,
  dica,
  erro,
  children,
  className,
  htmlFor,
}: {
  rotulo?: ReactNode;
  dica?: ReactNode;
  erro?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx('campo', erro && 'campo--erro', className)}>
      {rotulo && <label htmlFor={htmlFor}>{rotulo}</label>}
      {children}
      {erro ? <span className="campo__erro">{erro}</span> : dica ? <span className="campo__dica">{dica}</span> : null}
    </div>
  );
}

export function Entrada({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('entrada', className)} {...p} />;
}

export function Selecao({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('entrada', className)} {...p}>
      {children}
    </select>
  );
}

export function AreaTexto({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('entrada', className)} {...p} />;
}

export function Caixa({ rotulo, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { rotulo?: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  const indeterminado = p['aria-checked'] === 'mixed';
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminado;
  }, [indeterminado]);
  return (
    <label className={cx('check', className)} onClick={(e) => e.stopPropagation()}>
      <input ref={ref} type="checkbox" {...p} />
      {rotulo}
    </label>
  );
}

/**
 * Entrada de dinheiro no estilo dos apps de banco: os dígitos entram pela direita
 * (digitar 1, 2, 3, 4 mostra 12,34). Trabalha em centavos.
 */
export function EntradaMoeda({
  valor,
  aoMudar,
  id,
  autoFocus,
  disabled,
  placeholder = '0,00',
}: {
  valor: number;
  aoMudar: (centavos: number) => void;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="entrada-grupo">
      <span className="entrada-grupo__prefixo">R$</span>
      <input
        id={id}
        className="entrada entrada--num"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={valor ? valorSemSimbolo(valor) : ''}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').slice(0, 12);
          aoMudar(digitos ? parseInt(digitos, 10) : 0);
        }}
      />
    </div>
  );
}

export function EntradaSenha(p: InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false);
  return (
    <div className="entrada-grupo">
      <input className="entrada" type={ver ? 'text' : 'password'} {...p} />
      <span className="entrada-grupo__acao">
        <button
          type="button"
          className="btn btn--fantasma btn--p btn--icone"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}
          title={ver ? 'Esconder senha' : 'Mostrar senha'}
        >
          <Icone nome={ver ? 'olhoFechado' : 'olho'} tam={17} />
        </button>
      </span>
    </div>
  );
}

// ---------- Segmentado ----------

export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
}: {
  opcoes: { valor: T; rotulo: ReactNode; contagem?: number }[];
  valor: T;
  aoMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div className="segmentado" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={o.valor === valor} onClick={() => aoMudar(o.valor)}>
          {o.rotulo}
          {o.contagem !== undefined && <span className="contagem">{o.contagem}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Status ----------

const TEXTO_STATUS: Record<Status, { pagar: string; receber: string }> = {
  pago: { pagar: 'Pago', receber: 'Recebido' },
  vencido: { pagar: 'Vencido', receber: 'Atrasado' },
  hoje: { pagar: 'Vence hoje', receber: 'Vence hoje' },
  aberto: { pagar: 'Em aberto', receber: 'Em aberto' },
  cancelado: { pagar: 'Cancelado', receber: 'Cancelado' },
};

export function Carimbo({ status, tipo = 'pagar' }: { status: Status; tipo?: 'pagar' | 'receber' }) {
  return <span className={`carimbo carimbo--${status}`}>{TEXTO_STATUS[status][tipo]}</span>;
}

export function CarimboTexto({ variante, children }: { variante: 'pago' | 'vencido' | 'hoje' | 'aberto' | 'cancelado' | 'info' | 'latao'; children: ReactNode }) {
  return <span className={`carimbo carimbo--${variante}`}>{children}</span>;
}

// ---------- Dinheiro ----------

export function Valor({ centavos, tipo, sinal, className }: { centavos: number; tipo?: 'pagar' | 'receber'; sinal?: boolean; className?: string }) {
  const prefixo = sinal && tipo ? (tipo === 'receber' ? '+' : '−') : '';
  return (
    <span className={cx('num', className)}>
      {prefixo && <span aria-hidden="true">{prefixo} </span>}
      {moeda(centavos)}
    </span>
  );
}

// ---------- Avatar ----------

export function Avatar({ nome, tam }: { nome: string; tam?: 'p' | 'g' }) {
  return (
    <span className={cx('avatar', tam && `avatar--${tam}`)} aria-hidden="true" title={nome}>
      {iniciais(nome)}
    </span>
  );
}

// ---------- Vazio ----------

export function Vazio({ titulo, texto, acao, icone = 'arquivo' }: { titulo: string; texto?: ReactNode; acao?: ReactNode; icone?: NomeIcone }) {
  return (
    <div className="vazio">
      <Icone nome={icone} tam={34} traco={1.2} />
      <h3>{titulo}</h3>
      {texto && <p>{texto}</p>}
      {acao}
    </div>
  );
}

// ---------- Menu suspenso ----------

export function MenuSuspenso({
  gatilho,
  children,
  rotulo,
  alinhar = 'direita',
}: {
  gatilho: (abrir: () => void, aberto: boolean) => ReactNode;
  children: (fechar: () => void) => ReactNode;
  rotulo: string;
  alinhar?: 'direita' | 'esquerda';
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {gatilho(() => setAberto((a) => !a), aberto)}
      {aberto && (
        <div id={id} className="menu" role="menu" aria-label={rotulo} style={alinhar === 'esquerda' ? { left: 0, right: 'auto' } : undefined}>
          {children(() => setAberto(false))}
        </div>
      )}
    </div>
  );
}

export function ItemMenu({ icone, children, onClick, perigo }: { icone?: NomeIcone; children: ReactNode; onClick: () => void; perigo?: boolean }) {
  return (
    <button type="button" role="menuitem" className="menu__item" onClick={onClick} style={perigo ? { color: 'var(--critico)' } : undefined}>
      {icone && <Icone nome={icone} tam={17} />}
      {children}
    </button>
  );
}

export const classes = cx;
