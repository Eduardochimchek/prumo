// Agenda dos próximos dias: cada coluna é um dia. Recebimentos sobem (verde),
// pagamentos descem (laranja) a partir da linha do meio. Clique para ver o dia.

import { diaSemana, hoje, semanaCurta, dataExtenso } from '../../lib/dates';
import { moeda, moedaCompacta } from '../../lib/format';
import type { DiaAgenda } from '../../data/selectors';

export function Agenda({ dias, selecionado, aoSelecionar }: { dias: DiaAgenda[]; selecionado: string; aoSelecionar: (d: string) => void }) {
  const ref = hoje();
  const max = Math.max(1, ...dias.map((d) => Math.max(d.receber, d.pagar)));
  const ALT = 58; // altura de cada metade, em px
  return (
    <div className="agenda" role="list" aria-label="Vencimentos dos próximos dias">
      {dias.map((d) => {
        const fds = [0, 6].includes(diaSemana(d.data));
        const ehHoje = d.data === ref;
        const hR = d.receber ? Math.max(3, (d.receber / max) * ALT) : 0;
        const hP = d.pagar ? Math.max(3, (d.pagar / max) * ALT) : 0;
        return (
          <button
            key={d.data}
            type="button"
            role="listitem"
            className={`agenda__dia${fds ? ' agenda__dia--fds' : ''}${ehHoje ? ' agenda__dia--hoje' : ''}${selecionado === d.data ? ' agenda__dia--sel' : ''}`}
            onClick={() => aoSelecionar(d.data)}
            aria-pressed={selecionado === d.data}
            aria-label={`${dataExtenso(d.data, false)}: a receber ${moeda(d.receber)}, a pagar ${moeda(d.pagar)}`}
            title={`A receber ${moeda(d.receber)} · A pagar ${moeda(d.pagar)}`}
          >
            <span className="agenda__semana">{ehHoje ? 'hoje' : semanaCurta(d.data)}</span>
            <span className="agenda__num">{Number(d.data.slice(8, 10))}</span>
            <span className="agenda__barras" style={{ height: ALT * 2 + 1 }}>
              <span className="agenda__metade agenda__metade--cima">
                {hR > 0 && <i style={{ height: hR }} className="agenda__barra agenda__barra--receber" />}
              </span>
              <span className="agenda__linha" />
              <span className="agenda__metade agenda__metade--baixo">
                {hP > 0 && <i style={{ height: hP }} className="agenda__barra agenda__barra--pagar" />}
              </span>
            </span>
            <span className="agenda__valores num">
              <span>{d.receber ? moedaCompacta(d.receber).replace('R$ ', '') : '·'}</span>
              <span>{d.pagar ? moedaCompacta(d.pagar).replace('R$ ', '') : '·'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
