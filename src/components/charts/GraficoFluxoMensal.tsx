// Fluxo de caixa mensal: entradas sobem, saídas descem a partir da mesma linha de base
// (a posição já codifica o sentido; a cor reforça). Parte prevista em tom suave.
// Linha do saldo no fim de cada mês, tracejada onde é projeção. Um único eixo.

import { useState } from 'react';
import { eixoCompacto, moeda } from '../../lib/format';
import { mesAbrev, mesLongo } from '../../lib/dates';
import type { MesFluxo } from '../../data/selectors';
import { ticksRedondos, useLargura } from './useLargura';

const ALTURA = 300;
const EIXO_X = 30;
const MARGEM = { topo: 14, esq: 52, dir: 14 };

export function GraficoFluxoMensal({ meses, altura = ALTURA }: { meses: MesFluxo[]; altura?: number }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);

  const maxCima = Math.max(1, ...meses.map((m) => Math.max(m.entradas + m.entradasPrevistas, m.saldoFinal)));
  const maxBaixo = Math.max(1, ...meses.map((m) => m.saidas + m.saidasPrevistas));
  const minSaldo = Math.min(0, ...meses.map((m) => m.saldoFinal));
  const topo = maxCima * 1.08;
  const base = -Math.max(maxBaixo, -minSaldo) * 1.08;

  const plotW = Math.max(200, largura - MARGEM.esq - MARGEM.dir);
  const plotH = altura - MARGEM.topo;
  const y = (v: number) => MARGEM.topo + ((topo - v) / (topo - base)) * plotH;
  const banda = plotW / meses.length;
  const barW = Math.min(24, banda * 0.42);
  const cx = (i: number) => MARGEM.esq + banda * i + banda / 2;
  const ticks = ticksRedondos(base, topo, 5);
  const zero = y(0);

  const pontos = meses.map((m, i) => ({ x: cx(i), y: y(m.saldoFinal), futuro: m.tempo === 'futuro' }));
  const iAtual = meses.findIndex((m) => m.tempo === 'atual');
  const realizado = pontos.slice(0, iAtual + 1);
  const projetado = pontos.slice(Math.max(0, iAtual));
  const caminho = (ps: typeof pontos) => ps.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // barra com ponta arredondada (4px) longe da base, reta na base
  const barra = (x: number, y0: number, y1: number) => {
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return '';
    const r = Math.min(4, h, barW / 2);
    const esq = x - barW / 2;
    const dir = x + barW / 2;
    if (y1 < y0) {
      return `M${esq},${y0} V${y1 + r} Q${esq},${y1} ${esq + r},${y1} H${dir - r} Q${dir},${y1} ${dir},${y1 + r} V${y0} Z`;
    }
    return `M${esq},${y0} V${y1 - r} Q${esq},${y1} ${esq + r},${y1} H${dir - r} Q${dir},${y1} ${dir},${y1 - r} V${y0} Z`;
  };
  const retangulo = (x: number, y0: number, y1: number) => {
    const topoR = Math.min(y0, y1);
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return '';
    return `M${x - barW / 2},${topoR} h${barW} v${h} h${-barW} Z`;
  };

  const m = foco !== null ? meses[foco] : null;

  return (
    <div className="grafico" ref={ref} style={{ position: 'relative' }}>
      <svg width={largura} height={altura + EIXO_X} role="img" aria-label="Fluxo de caixa por mês: entradas, saídas e saldo no fim do mês">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--eixo)' : 'var(--grade)'} strokeWidth="1" />
            <text x={MARGEM.esq - 8} y={y(t) + 4} textAnchor="end" className="grafico__eixo">
              {eixoCompacto(t)}
            </text>
          </g>
        ))}

        {meses.map((mes, i) => {
          const x = cx(i);
          const eReal = y(mes.entradas);
          const eTotal = y(mes.entradas + mes.entradasPrevistas);
          const sReal = y(-mes.saidas);
          const sTotal = y(-(mes.saidas + mes.saidasPrevistas));
          const gap = 2;
          const temEReal = mes.entradas > 0;
          const temSReal = mes.saidas > 0;
          return (
            <g key={mes.mes} opacity={foco === null || foco === i ? 1 : 0.45} style={{ transition: 'opacity .15s' }}>
              {/* entradas */}
              {mes.entradasPrevistas > 0 && (
                <path d={temEReal ? barra(x, eReal - gap, eTotal) : barra(x, zero, eTotal)} fill="var(--entrada-suave)" />
              )}
              {temEReal && <path d={mes.entradasPrevistas > 0 ? retangulo(x, zero, eReal) : barra(x, zero, eReal)} fill="var(--entrada)" />}
              {/* saídas */}
              {mes.saidasPrevistas > 0 && (
                <path d={temSReal ? barra(x, sReal + gap, sTotal) : barra(x, zero, sTotal)} fill="var(--saida-suave)" />
              )}
              {temSReal && <path d={mes.saidasPrevistas > 0 ? retangulo(x, zero, sReal) : barra(x, zero, sReal)} fill="var(--saida)" />}
            </g>
          );
        })}

        <path d={caminho(realizado)} fill="none" stroke="var(--tinta)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={caminho(projetado)} fill="none" stroke="var(--tinta)" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />
        {pontos.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={foco === i ? 5.5 : 4} fill={p.futuro ? 'var(--folha)' : 'var(--tinta)'} stroke={p.futuro ? 'var(--tinta)' : 'var(--folha)'} strokeWidth="2" />
        ))}

        {/* rótulo direto: saldo do último mês realizado/atual */}
        {iAtual >= 0 && (
          <text x={pontos[iAtual].x} y={pontos[iAtual].y - 12} textAnchor="middle" className="grafico__rotulo">
            {eixoCompacto(meses[iAtual].saldoFinal)}
          </text>
        )}

        {meses.map((mes, i) => (
          <text
            key={mes.mes}
            x={cx(i)}
            y={altura + 20}
            textAnchor="middle"
            className={`grafico__eixo${mes.tempo === 'atual' ? ' grafico__eixo--forte' : ''}`}
          >
            {mesAbrev(mes.mes)}
          </text>
        ))}

        {/* áreas de foco (maiores que as marcas) */}
        {meses.map((mes, i) => (
          <rect
            key={mes.mes}
            x={MARGEM.esq + banda * i}
            y={0}
            width={banda}
            height={altura + EIXO_X}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${mesLongo(mes.mes)}: entradas ${moeda(mes.entradas + mes.entradasPrevistas)}, saídas ${moeda(mes.saidas + mes.saidasPrevistas)}, saldo no fim do mês ${moeda(mes.saldoFinal)}`}
            onPointerEnter={() => setFoco(i)}
            onPointerLeave={() => setFoco(null)}
            onFocus={() => setFoco(i)}
            onBlur={() => setFoco(null)}
            style={{ outline: 'none' }}
          />
        ))}
      </svg>

      {m && foco !== null && (
        <div className="dica" style={{ left: Math.min(Math.max(cx(foco), 110), largura - 110), top: Math.max(70, y(Math.max(m.entradas + m.entradasPrevistas, m.saldoFinal))) }}>
          <div className="dica__titulo">
            {mesLongo(m.mes)} {m.tempo === 'futuro' ? '· previsão' : m.tempo === 'atual' ? '· mês atual' : ''}
          </div>
          <div className="dica__linha">
            <span className="dica__chave">
              <i style={{ background: 'var(--entrada)' }} /> Entradas
            </span>
            <strong>{moeda(m.entradas + m.entradasPrevistas)}</strong>
          </div>
          <div className="dica__linha">
            <span className="dica__chave">
              <i style={{ background: 'var(--saida)' }} /> Saídas
            </span>
            <strong>{moeda(m.saidas + m.saidasPrevistas)}</strong>
          </div>
          {(m.entradasPrevistas > 0 || m.saidasPrevistas > 0) && m.tempo !== 'futuro' && (
            <div className="dica__linha muted" style={{ fontSize: 12 }}>
              <span>ainda previsto</span>
              <span className="num">
                +{eixoCompacto(m.entradasPrevistas)} / −{eixoCompacto(m.saidasPrevistas)}
              </span>
            </div>
          )}
          <div className="dica__linha" style={{ borderTop: '1px solid var(--regua)', paddingTop: 6, marginTop: 6 }}>
            <span className="dica__chave">
              <i style={{ background: 'var(--tinta)' }} /> Saldo no fim
            </span>
            <strong>{moeda(m.saldoFinal)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
