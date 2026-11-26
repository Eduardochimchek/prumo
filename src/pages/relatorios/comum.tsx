// Peças comuns dos relatórios: cabeçalho com volta para a lista do módulo, seletor de período
// e a barrinha de participação usada nas tabelas "por cliente" e "por produto".

import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { NOME_MODULO, type Modulo } from '../../auth/modulos';
import { hoje, mesAbrev } from '../../lib/dates';
import { ultimosMeses } from '../../data/relatorios';
import { Icone } from '../../components/Icone';
import { Caixa, Segmentado } from '../../components/ui';

/** Valor para planilha (o Excel brasileiro entende vírgula). */
export const csvValor = (v: number) => (v / 100).toFixed(2).replace('.', ',');

export function CabecalhoRelatorio({ modulo, titulo, acoes }: { modulo: Modulo; titulo: string; acoes?: ReactNode }) {
  return (
    <>
      <Link to={`/relatorios?m=${modulo}`} className="voltar nao-imprimir">
        <Icone nome="voltar" tam={16} /> Relatórios do {NOME_MODULO[modulo]}
      </Link>
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Relatórios · {NOME_MODULO[modulo]}</p>
          <h1>{titulo}</h1>
        </div>
        {acoes && <div className="pagina-cabeca__acoes nao-imprimir">{acoes}</div>}
      </header>
    </>
  );
}

export type QtdMeses = '3' | '6' | '12';

export function usePeriodo(padrao: QtdMeses = '6', comAtualPadrao = false) {
  const [qtd, setQtd] = useState<QtdMeses>(padrao);
  const [comAtual, setComAtual] = useState(comAtualPadrao);
  const ref = hoje();
  const meses = useMemo(() => ultimosMeses(Number(qtd), comAtual, ref), [qtd, comAtual, ref]);
  const descricao = `${mesAbrev(meses[0])} a ${mesAbrev(meses[meses.length - 1])}${comAtual ? ' (mês atual parcial)' : ''}`;
  return { qtd, setQtd, comAtual, setComAtual, meses, descricao };
}

export function SeletorPeriodo({ periodo, extra }: { periodo: ReturnType<typeof usePeriodo>; extra?: ReactNode }) {
  return (
    <>
      <div className="filtros nao-imprimir">
        {extra}
        <Segmentado
          rotulo="Período"
          valor={periodo.qtd}
          aoMudar={periodo.setQtd}
          opcoes={[
            { valor: '3', rotulo: '3 meses' },
            { valor: '6', rotulo: '6 meses' },
            { valor: '12', rotulo: '12 meses' },
          ]}
        />
      </div>
      <div className="nao-imprimir" style={{ margin: '-4px 0 14px' }}>
        <Caixa rotulo="Incluir o mês atual (ainda em andamento)" checked={periodo.comAtual} onChange={(e) => periodo.setComAtual(e.target.checked)} />
      </div>
    </>
  );
}

/** Participação no total: número + filete proporcional (a cor acompanha o sentido do dinheiro). */
export function Parte({ valor, total, tom = 'entrada' }: { valor: number; total: number; tom?: 'entrada' | 'saida' | 'critico' }) {
  const pct = total ? Math.max(0, Math.min(100, (valor / total) * 100)) : 0;
  return (
    <span className="parte">
      <span className="parte__trilho" aria-hidden="true">
        <i className={`parte__barra parte__barra--${tom}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="num">{pct.toLocaleString('pt-BR', { maximumFractionDigits: pct < 10 ? 1 : 0 })}%</span>
    </span>
  );
}
