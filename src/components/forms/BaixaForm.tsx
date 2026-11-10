// "Dar baixa": registrar que a conta foi paga (ou recebida). Individual ou em lote.

import { useState } from 'react';
import { dataBR, hoje } from '../../lib/dates';
import { moeda, plural } from '../../lib/format';
import { useDb } from '../../data/store';
import { darBaixa, estornarBaixa } from '../../data/actions';
import type { Lancamento } from '../../data/types';
import { useUsuario } from '../../auth/auth';
import { Camada } from '../Camada';
import { AreaTexto, Botao, Caixa, Campo, Entrada, EntradaMoeda, Selecao } from '../ui';
import { useAvisos } from '../Avisos';

export function BaixaForm({ aberta, aoFechar, titulos, aoConcluir }: { aberta: boolean; aoFechar: () => void; titulos: Lancamento[]; aoConcluir?: (ids: string[]) => void }) {
  const db = useDb();
  const usuario = useUsuario();
  const { avisar, erro } = useAvisos();
  const individual = titulos.length === 1 ? titulos[0] : null;
  const tipo = titulos[0]?.tipo ?? 'pagar';
  const total = titulos.reduce((a, l) => a + l.valor, 0);

  const [data, setData] = useState(hoje());
  const [contaId, setContaId] = useState(individual?.contaId ?? db.contas.find((c) => c.ativa)?.id ?? '');
  const [juros, setJuros] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [obs, setObs] = useState('');
  const [ehParcial, setEhParcial] = useState(false);
  const [parcial, setParcial] = useState(0);

  const principal = individual && ehParcial ? parcial : individual?.valor ?? total;
  const valorPago = principal + juros - desconto;
  const parcialInvalido = ehParcial && individual ? !(parcial > 0 && parcial < individual.valor) : false;
  const verbo = tipo === 'pagar' ? 'Pagamento' : 'Recebimento';

  const confirmar = () => {
    try {
      const ids = titulos.map((t) => t.id);
      darBaixa(
        ids,
        { data, contaId, juros, desconto, valorPago: individual ? valorPago : undefined, parcial: individual && ehParcial ? parcial : undefined, observacao: obs || undefined },
        usuario.id,
      );
      const restante = individual && ehParcial ? individual.valor - parcial : 0;
      avisar(
        restante > 0
          ? `${verbo} parcial registrado: ${moeda(valorPago)}. O saldo de ${moeda(restante)} ficou em aberto.`
          : individual
            ? `${verbo} registrado: ${moeda(valorPago)}.`
            : `${plural(ids.length, 'título baixado', 'títulos baixados')} · ${moeda(total)}.`,
        {
          acao: restante > 0 ? undefined : { rotulo: 'Desfazer', executar: () => estornarBaixa(ids, usuario.id) },
        },
      );
      aoConcluir?.(ids);
      aoFechar();
    } catch (e) {
      erro(e);
    }
  };

  return (
    <Camada
      aberta={aberta}
      aoFechar={aoFechar}
      sobretitulo={tipo === 'pagar' ? 'Dar baixa · pagamento' : 'Dar baixa · recebimento'}
      titulo={individual ? individual.descricao : `${titulos.length} títulos selecionados`}
      rodape={
        <>
          <span className="espaco" />
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone="carimbo" onClick={confirmar} disabled={valorPago <= 0 || parcialInvalido}>
            Confirmar {tipo === 'pagar' ? 'pagamento' : 'recebimento'}
          </Botao>
        </>
      }
    >
      <div className="baixa__resumo">
        <div>
          <span className="rotulo">{individual ? `Vencimento ${dataBR(individual.vencimento)}` : 'Total dos títulos'}</span>
          <strong>{moeda(individual?.valor ?? total)}</strong>
        </div>
        {individual && (juros > 0 || desconto > 0 || ehParcial) && (
          <div style={{ textAlign: 'right' }}>
            <span className="rotulo">Valor {tipo === 'pagar' ? 'pago' : 'recebido'}</span>
            <strong>{moeda(valorPago)}</strong>
          </div>
        )}
      </div>
      <div className="grade-form" style={{ marginTop: 18 }}>
        <Campo className="c3 m3" rotulo={`Data do ${tipo === 'pagar' ? 'pagamento' : 'recebimento'}`} htmlFor="b-data">
          <Entrada id="b-data" type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo className="c3 m3" rotulo="Conta" htmlFor="b-conta">
          <Selecao id="b-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {db.contas
              .filter((c) => c.ativa)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Selecao>
        </Campo>
        {individual && (
          <>
            <div>
              <Caixa
                rotulo={`Pagamento parcial (o restante continua em aberto)`}
                checked={ehParcial}
                onChange={(e) => {
                  setEhParcial(e.target.checked);
                  if (e.target.checked && !parcial) setParcial(Math.round(individual.valor / 2));
                }}
              />
            </div>
            {ehParcial && (
              <Campo
                rotulo={`Quanto do valor está sendo ${tipo === 'pagar' ? 'pago' : 'recebido'} agora`}
                htmlFor="b-parcial"
                erro={parcialInvalido ? `Informe um valor entre R$ 0,01 e ${moeda(individual.valor - 1)}.` : null}
                dica={!parcialInvalido ? `Fica em aberto: ${moeda(individual.valor - parcial)}, com o mesmo vencimento.` : undefined}
              >
                <EntradaMoeda id="b-parcial" valor={parcial} aoMudar={setParcial} />
              </Campo>
            )}
            <Campo className="c3 m3" rotulo="Juros e multa" htmlFor="b-juros">
              <EntradaMoeda id="b-juros" valor={juros} aoMudar={setJuros} />
            </Campo>
            <Campo className="c3 m3" rotulo="Desconto" htmlFor="b-desc">
              <EntradaMoeda id="b-desc" valor={desconto} aoMudar={setDesconto} />
            </Campo>
          </>
        )}
        <Campo rotulo="Observação" htmlFor="b-obs">
          <AreaTexto id="b-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: pago via PIX, comprovante no e-mail" />
        </Campo>
      </div>
      {!individual && (
        <ul className="baixa__lista">
          {titulos.slice(0, 8).map((t) => (
            <li key={t.id}>
              <span className="truncar">{t.descricao}</span>
              <span className="num">{moeda(t.valor)}</span>
            </li>
          ))}
          {titulos.length > 8 && <li className="muted">e mais {titulos.length - 8}…</li>}
        </ul>
      )}
    </Camada>
  );
}
