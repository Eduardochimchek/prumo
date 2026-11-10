import { useLayoutEffect, useRef, useState } from 'react';

/** Mede a largura do container para desenhar o SVG em pixels reais (texto sem distorção). */
export function useLargura<T extends HTMLElement>(inicial = 640) {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(inicial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(el.clientWidth || inicial);
    const ro = new ResizeObserver((entradas) => {
      const w = Math.round(entradas[0].contentRect.width);
      if (w > 0) setLargura(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [inicial]);
  return [ref, largura] as const;
}

/** Ticks "redondos" para um eixo. */
export function ticksRedondos(min: number, max: number, alvo = 4): number[] {
  const span = max - min || 1;
  const passoBruto = span / alvo;
  const mag = Math.pow(10, Math.floor(Math.log10(passoBruto)));
  const norm = passoBruto / mag;
  const passo = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ini = Math.ceil(min / passo) * passo;
  const out: number[] = [];
  for (let v = ini; v <= max + 1e-9; v += passo) out.push(Math.round(v));
  return out;
}
