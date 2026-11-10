// Projeção do saldo dia a dia: linha de 2px, lavagem de 10% abaixo, cruz que segue o ponteiro,
// e o ponto mais baixo anotado (o "dia mais apertado").

import { useState } from 'react';
import { addDias, dataBR, dataExtenso, diaMes } from '../../lib/dates';
import { eixoCompacto, moeda } from '../../lib/format';
import type { DiaFluxo } from '../../data/selectors';
import { ticksRedondos, useLargura } from './useLargura';

const M = { topo: 26, esq: 56, dir: 18, base: 30 };

export function GraficoProjecao({ pontos, menor, altura = 260 }: { pontos: DiaFluxo[]; menor: DiaFluxo; altura?: number }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  if (pontos.length < 2) return null;

  const valores = pontos.map((p) => p.saldo);
  const vMin = Math.min(0, ...valores);
  const vMax = Math.max(...valores);
  const folga = (vMax - vMin) * 0.12 || 1;
  const lo = vMin < 0 ? vMin - folga : 0;
  const hi = vMax + folga;
  const plotW = Math.max(200, largura - M.esq - M.dir);
  const plotH = altura - M.topo - M.base;
  const x = (i: number) => M.esq + (i / (pontos.length - 1)) * plotW;
  const y = (v: number) => M.topo + ((hi - v) / (hi - lo)) * plotH;
  const ticks = ticksRedondos(lo, hi, 4);

  // degraus: o saldo muda no dia do vencimento
  let linha = `M${x(0)},${y(pontos[0].saldo)}`;
  for (let i = 1; i < pontos.length; i++) linha += ` H${x(i)} V${y(pontos[i].saldo)}`;
  const area = `${linha} V${y(lo)} H${x(0)} Z`;

  const iMenor = pontos.findIndex((p) => p.data === menor.data);
  const semanas = pontos.map((p, i) => ({ p, i })).filter(({ i }) => i % 7 === 0);

  const aoMover = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    setFoco(Math.max(0, Math.min(pontos.length - 1, Math.round(rel * (pontos.length - 1)))));
  };

  const f = foco !== null ? pontos[foco] : null;

  return (
    <div ref={ref} style={{ position: 'relative' }} className="grafico">
      <svg width={largura} height={altura} role="img" aria-label={`Projeção do saldo para os próximos ${pontos.length} dias. Menor saldo ${moeda(menor.saldo)} em ${dataBR(menor.data)}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.esq} x2={largura - M.dir} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--eixo)' : 'var(--grade)'} />
            <text x={M.esq - 8} y={y(t) + 4} textAnchor="end" className="grafico__eixo">
              {eixoCompacto(t)}
            </text>
          </g>
        ))}
        {semanas.map(({ p, i }) => (
          <text key={p.data} x={x(i)} y={altura - 8} textAnchor={i === 0 ? 'start' : 'middle'} className="grafico__eixo">
            {i === 0 ? 'hoje' : diaMes(p.data)}
          </text>
        ))}
        <path d={area} fill="var(--tinta)" opacity="0.07" />
        <path d={linha} fill="none" stroke="var(--tinta)" strokeWidth="2" strokeLinejoin="round" />

        {iMenor >= 0 && (
          <g>
            <circle cx={x(iMenor)} cy={y(menor.saldo)} r="5" fill="var(--critico)" stroke="var(--folha)" strokeWidth="2" />
            <text x={Math.min(Math.max(x(iMenor), M.esq + 70), largura - 80)} y={y(menor.saldo) + 22} textAnchor="middle" className="grafico__rotulo">
              menor saldo · {diaMes(menor.data)}
            </text>
          </g>
        )}

        {f && foco !== null && (
          <g pointerEvents="none">
            <line x1={x(foco)} x2={x(foco)} y1={M.topo - 6} y2={altura - M.base} stroke="var(--tinta-3)" strokeWidth="1" />
            <circle cx={x(foco)} cy={y(f.saldo)} r="5" fill="var(--tinta)" stroke="var(--folha)" strokeWidth="2" />
          </g>
        )}
        <rect
          x={M.esq}
          y={0}
          width={plotW}
          height={altura}
          fill="transparent"
          onPointerMove={aoMover}
          onPointerDown={aoMover}
          onPointerLeave={() => setFoco(null)}
        />
      </svg>
      {f && foco !== null && (
        <div className="dica" style={{ left: Math.min(Math.max(x(foco), 100), largura - 100), top: Math.max(84, y(f.saldo) - 4) }}>
          <div className="dica__titulo">{foco === 0 ? 'hoje' : dataExtenso(addDias(pontos[0].data, foco), false)}</div>
          <div className="dica__linha">
            <span className="dica__chave">
              <i style={{ background: 'var(--tinta)' }} /> Saldo previsto
            </span>
            <strong>{moeda(f.saldo)}</strong>
          </div>
          {f.entradas > 0 && (
            <div className="dica__linha">
              <span className="dica__chave">
                <i style={{ background: 'var(--entrada)' }} /> Entram
              </span>
              <strong>{moeda(f.entradas)}</strong>
            </div>
          )}
          {f.saidas > 0 && (
            <div className="dica__linha">
              <span className="dica__chave">
                <i style={{ background: 'var(--saida)' }} /> Saem
              </span>
              <strong>{moeda(f.saidas)}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
