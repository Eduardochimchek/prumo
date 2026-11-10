// Ranking por categoria: uma série só => uma cor só (a cor do sentido: saída ou entrada).

import { moeda, percentual } from '../../lib/format';
import type { LinhaCategoria } from '../../data/selectors';

export function BarrasCategoria({ linhas, tipo, limite = 7 }: { linhas: LinhaCategoria[]; tipo: 'pagar' | 'receber'; limite?: number }) {
  const total = linhas.reduce((a, l) => a + l.total, 0);
  const visiveis = linhas.slice(0, limite);
  const resto = linhas.slice(limite).reduce((a, l) => a + l.total, 0);
  const lista = resto > 0 ? [...visiveis, { categoriaId: 'outras', nome: 'Outras categorias', total: resto }] : visiveis;
  const max = Math.max(1, ...lista.map((l) => l.total));
  const cor = tipo === 'pagar' ? 'var(--saida)' : 'var(--entrada)';
  if (!total) return <p className="muted">Nada lançado neste período.</p>;
  return (
    <ol className="barras-cat">
      {lista.map((l) => (
        <li key={l.categoriaId}>
          <div className="barras-cat__linha">
            <span className="truncar">{l.nome}</span>
            <span className="num barras-cat__valor">
              {moeda(l.total)} <small>{percentual(l.total, total)}</small>
            </span>
          </div>
          <div className="barras-cat__trilho" aria-hidden="true">
            <span style={{ width: `${(l.total / max) * 100}%`, background: cor }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
