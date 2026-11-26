// Painel de números: o que se lê primeiro numa tela. Cada número tem rótulo
// escrito, um filete com a cor do que ele significa e, quando faz sentido,
// leva à lista filtrada. Número zerado perde a cor (cor só quando significa algo).

import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router';
import { classes } from './ui';

export type TomPainel = 'entrada' | 'saida' | 'critico' | 'atencao' | 'marca' | 'neutro';

export interface ItemPainel {
  chave: string;
  rotulo: string;
  valor: ReactNode;
  nota?: ReactNode;
  tom?: TomPainel;
  zerado?: boolean;
  /** ocupa a linha inteira no celular (ex.: saldo em caixa) */
  destaque?: boolean;
  para?: string;
  aoClicar?: () => void;
  /** filtro ligado (só com aoClicar) */
  ativo?: boolean;
  valorClasse?: string;
}

export function Painel({ itens, rotulo, className }: { itens: ItemPainel[]; rotulo: string; className?: string }) {
  return (
    <dl className={classes('numeros', `numeros--${itens.length}`, className)} aria-label={rotulo} style={{ '--numeros-n': itens.length } as CSSProperties}>
      {itens.map((i) => (
        <div
          key={i.chave}
          className={classes(
            'numeros__item',
            `numeros__item--${i.zerado ? 'zerado' : (i.tom ?? 'neutro')}`,
            (i.para || i.aoClicar) && 'numeros__item--clicavel',
            i.ativo && 'numeros__item--ativo',
            i.destaque && 'numeros__item--destaque',
          )}
        >
          <dt>
            {i.para ? (
              <Link to={i.para}>{i.rotulo}</Link>
            ) : i.aoClicar ? (
              <button type="button" onClick={i.aoClicar} aria-pressed={i.ativo ?? false}>
                {i.rotulo}
              </button>
            ) : (
              i.rotulo
            )}
          </dt>
          <dd className={classes('numeros__valor', i.valorClasse)}>{i.valor}</dd>
          {i.nota != null && <dd className="numeros__nota">{i.nota}</dd>}
        </div>
      ))}
    </dl>
  );
}
