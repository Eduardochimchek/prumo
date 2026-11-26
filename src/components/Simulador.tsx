// "E se…?": simula mudanças no fluxo de caixa sem gravar nada. Adiar um pagamento, um cliente
// atrasar (ou não pagar), uma entrada/saída extra, recebimentos menores (ex.: split payment).

import { useState } from 'react';
import { addDias, dataBR, diaMes, type ISODate } from '../lib/dates';
import { moeda } from '../lib/format';
import { emAberto, type Cenario } from '../data/selectors';
import type { Database } from '../data/types';
import { Icone } from './Icone';
import { Botao, Campo, Entrada, EntradaMoeda, Segmentado, Selecao } from './ui';

export type Ajuste =
  | { id: string; tipo: 'mover'; lancamentoId: string; data: ISODate | null; texto: string }
  | { id: string; tipo: 'extra'; data: ISODate; valor: number; texto: string }
  | { id: string; tipo: 'reducao'; pct: number; texto: string };

export function cenarioDe(ajustes: Ajuste[]): Cenario {
  const c: Cenario = { mover: {}, extras: [], reducaoRecebimentosPct: 0 };
  for (const a of ajustes) {
    if (a.tipo === 'mover') c.mover![a.lancamentoId] = a.data;
    else if (a.tipo === 'extra') c.extras!.push({ id: a.id, data: a.data, valor: a.valor, descricao: a.texto });
    else c.reducaoRecebimentosPct = a.pct;
  }
  return c;
}

type Modo = 'adiar' | 'atrasar' | 'extra' | 'reducao';
let seq = 0;
const novoId = () => `aj${++seq}`;

export function Simulador({ db, ref, horizonte, ajustes, aoMudar }: { db: Database; ref: ISODate; horizonte: number; ajustes: Ajuste[]; aoMudar: (a: Ajuste[]) => void }) {
  const [modo, setModo] = useState<Modo>('adiar');
  const [pagarId, setPagarId] = useState('');
  const [novaData, setNovaData] = useState('');
  const [receberId, setReceberId] = useState('');
  const [atraso, setAtraso] = useState('30');
  const [sentido, setSentido] = useState<'saida' | 'entrada'>('saida');
  const [valor, setValor] = useState(0);
  const [dataExtra, setDataExtra] = useState(addDias(ref, 7));
  const [descricao, setDescricao] = useState('');
  const [pct, setPct] = useState('10');

  const ate = addDias(ref, horizonte - 1);
  const movidos = new Set(ajustes.flatMap((a) => (a.tipo === 'mover' ? [a.lancamentoId] : [])));
  const opcoes = (tipo: 'pagar' | 'receber') =>
    db.lancamentos
      .filter((l) => l.tipo === tipo && emAberto(l) && l.vencimento <= ate && !movidos.has(l.id))
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : b.valor - a.valor));
  const aPagar = opcoes('pagar');
  const aReceber = opcoes('receber');
  const rotulo = (l: (typeof aPagar)[number]) => `${dataBR(l.vencimento).slice(0, 5)} · ${l.descricao} · ${moeda(l.valor)}`;

  const pagarSel = aPagar.find((l) => l.id === pagarId);
  const receberSel = aReceber.find((l) => l.id === receberId);
  const temReducao = ajustes.some((a) => a.tipo === 'reducao');

  const adicionar = () => {
    if (modo === 'adiar' && pagarSel) {
      const data = novaData || addDias(pagarSel.vencimento < ref ? ref : pagarSel.vencimento, 15);
      aoMudar([...ajustes, { id: novoId(), tipo: 'mover', lancamentoId: pagarSel.id, data, texto: `Pagar “${pagarSel.descricao}” (${moeda(pagarSel.valor)}) em ${diaMes(data)}` }]);
      setPagarId('');
      setNovaData('');
    } else if (modo === 'atrasar' && receberSel) {
      const data = atraso === 'nunca' ? null : addDias(receberSel.vencimento < ref ? ref : receberSel.vencimento, Number(atraso));
      const quem = receberSel.descricao;
      aoMudar([
        ...ajustes,
        {
          id: novoId(),
          tipo: 'mover',
          lancamentoId: receberSel.id,
          data,
          texto: data ? `“${quem}” (${moeda(receberSel.valor)}) atrasa ${atraso} dias, entra em ${diaMes(data)}` : `“${quem}” (${moeda(receberSel.valor)}) não é pago`,
        },
      ]);
      setReceberId('');
    } else if (modo === 'extra' && valor > 0 && dataExtra) {
      const nome = descricao.trim() || (sentido === 'saida' ? 'Saída extra' : 'Entrada extra');
      aoMudar([...ajustes, { id: novoId(), tipo: 'extra', data: dataExtra, valor: sentido === 'saida' ? -valor : valor, texto: `${nome}: ${sentido === 'saida' ? 'sai' : 'entra'} ${moeda(valor)} em ${diaMes(dataExtra)}` }]);
      setValor(0);
      setDescricao('');
    } else if (modo === 'reducao') {
      const n = Math.min(50, Math.max(1, Math.round(Number(pct) || 0)));
      aoMudar([...ajustes.filter((a) => a.tipo !== 'reducao'), { id: novoId(), tipo: 'reducao', pct: n, texto: `Recebimentos chegam ${n}% menores` }]);
    }
  };

  const pronto =
    (modo === 'adiar' && !!pagarSel) || (modo === 'atrasar' && !!receberSel) || (modo === 'extra' && valor > 0 && !!dataExtra) || (modo === 'reducao' && Number(pct) >= 1 && Number(pct) <= 50);

  return (
    <div className="simulador">
      <Segmentado
        rotulo="O que simular"
        valor={modo}
        aoMudar={setModo}
        opcoes={[
          { valor: 'adiar', rotulo: 'Adiar um pagamento' },
          { valor: 'atrasar', rotulo: 'Cliente atrasar' },
          { valor: 'extra', rotulo: 'Entrada ou saída extra' },
          { valor: 'reducao', rotulo: 'Receber menos' },
        ]}
      />
      <div className="grade-form simulador__form">
        {modo === 'adiar' && (
          <>
            <Campo className="c4" rotulo="Conta a pagar" htmlFor="s-pagar">
              <Selecao id="s-pagar" value={pagarId} onChange={(e) => setPagarId(e.target.value)}>
                <option value="">Escolha a conta</option>
                {aPagar.map((l) => (
                  <option key={l.id} value={l.id}>
                    {rotulo(l)}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo className="c2" rotulo="Pagar em" htmlFor="s-data" dica={pagarSel && !novaData ? 'Se não escolher: 15 dias depois.' : undefined}>
              <Entrada id="s-data" type="date" min={ref} value={novaData} onChange={(e) => setNovaData(e.target.value)} />
            </Campo>
          </>
        )}
        {modo === 'atrasar' && (
          <>
            <Campo className="c4" rotulo="Conta a receber" htmlFor="s-receber">
              <Selecao id="s-receber" value={receberId} onChange={(e) => setReceberId(e.target.value)}>
                <option value="">Escolha a conta</option>
                {aReceber.map((l) => (
                  <option key={l.id} value={l.id}>
                    {rotulo(l)}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo className="c2" rotulo="Atraso" htmlFor="s-atraso">
              <Selecao id="s-atraso" value={atraso} onChange={(e) => setAtraso(e.target.value)}>
                <option value="15">15 dias</option>
                <option value="30">30 dias</option>
                <option value="60">60 dias</option>
                <option value="nunca">Não vai pagar</option>
              </Selecao>
            </Campo>
          </>
        )}
        {modo === 'extra' && (
          <>
            <Campo className="c2 m3" rotulo="Tipo" htmlFor="s-sentido">
              <Selecao id="s-sentido" value={sentido} onChange={(e) => setSentido(e.target.value as 'saida' | 'entrada')}>
                <option value="saida">Saída (compra, reforma…)</option>
                <option value="entrada">Entrada (empréstimo, venda…)</option>
              </Selecao>
            </Campo>
            <Campo className="c2 m3" rotulo="Valor" htmlFor="s-valor">
              <EntradaMoeda id="s-valor" valor={valor} aoMudar={setValor} />
            </Campo>
            <Campo className="c2 m3" rotulo="Data" htmlFor="s-dextra">
              <Entrada id="s-dextra" type="date" min={ref} value={dataExtra} onChange={(e) => setDataExtra(e.target.value)} />
            </Campo>
            <Campo className="c4" rotulo="Descrição (opcional)" htmlFor="s-desc">
              <Entrada id="s-desc" value={descricao} placeholder="Ex.: compra de estoque para o verão" onChange={(e) => setDescricao(e.target.value)} />
            </Campo>
          </>
        )}
        {modo === 'reducao' && (
          <Campo
            className="c3"
            rotulo="Quanto a menos em cada recebimento (%)"
            htmlFor="s-pct"
            dica="Útil para testar o split payment da reforma tributária (a partir de 2027 o imposto pode ser retido quando o cliente paga). Aqui não descontamos a guia de imposto que deixaria de ser paga: é um teste de aperto."
          >
            <Entrada id="s-pct" type="number" min={1} max={50} value={pct} onChange={(e) => setPct(e.target.value)} />
          </Campo>
        )}
        <div className="c2 simulador__botao">
          <Botao icone="mais" variante="primario" disabled={!pronto} onClick={adicionar}>
            {modo === 'reducao' && temReducao ? 'Trocar' : 'Adicionar'}
          </Botao>
        </div>
      </div>

      {ajustes.length > 0 && (
        <ul className="simulador__lista" aria-label="Mudanças simuladas">
          {ajustes.map((a) => (
            <li key={a.id}>
              <Icone nome={a.tipo === 'extra' ? (a.valor < 0 ? 'pagar' : 'receber') : a.tipo === 'reducao' ? 'desce' : 'calendario'} tam={16} />
              <span>{a.texto}</span>
              <Botao tam="p" variante="fantasma" icone="fechar" aria-label={`Tirar: ${a.texto}`} onClick={() => aoMudar(ajustes.filter((x) => x.id !== a.id))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
