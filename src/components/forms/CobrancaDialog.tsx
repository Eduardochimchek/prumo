// Boleto com PIX de uma conta a receber + "simular pagamento" (a baixa automática que,
// no produto real, chega pelo aviso do banco). Tudo simulado na demonstração.

import { dataBR } from '../../lib/dates';
import { moeda } from '../../lib/format';
import { formatarLinhaDigitavel } from '../../lib/boleto';
import { mascaraDocumento } from '../../lib/br';
import { copiarTexto } from '../../lib/util';
import { useDb } from '../../data/store';
import { simularPagamento } from '../../data/actions';
import { useAuth, useUsuario } from '../../auth/auth';
import { Camada } from '../Camada';
import { Icone } from '../Icone';
import { Botao, CarimboTexto } from '../ui';
import { CodigoBarras, QRCode } from '../CodigosVisuais';
import { useAvisos } from '../Avisos';

export function CobrancaDialog({ lancamentoId, aoFechar }: { lancamentoId: string | null; aoFechar: () => void }) {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const l = lancamentoId ? db.lancamentos.find((x) => x.id === lancamentoId) : undefined;
  const c = l?.cobranca;
  const contato = l?.contatoId ? db.contatos.find((x) => x.id === l.contatoId) : undefined;

  if (!l || !c) return <Camada aberta={false} aoFechar={aoFechar}>{null}</Camada>;
  const paga = !!l.baixa;

  const pagar = (como: 'pix' | 'boleto') => {
    try {
      simularPagamento(l.id, como, usuario.id);
      avisar(`Pagamento de ${moeda(l.valor)} recebido por ${como === 'pix' ? 'PIX' : 'boleto'}. Baixa feita sozinha; veja a tela Hoje.`, { duracao: 7000 });
    } catch (e) {
      erro(e);
    }
  };

  return (
    <Camada
      aberta
      aoFechar={aoFechar}
      largo
      sobretitulo={
        <>
          Cobrança <span className="selo-simulacao">simulação</span>
        </>
      }
      titulo={`Boleto com PIX · ${moeda(l.valor)}`}
      rodape={
        <>
          <span className="espaco" />
          {paga ? (
            <CarimboTexto variante="pago">Recebido em {dataBR(l.baixa!.data)}</CarimboTexto>
          ) : (
            pode('baixar') && (
              <>
                <Botao onClick={() => pagar('boleto')}>Simular pagamento do boleto</Botao>
                <Botao variante="primario" icone="check" onClick={() => pagar('pix')}>
                  Simular pagamento por PIX
                </Botao>
              </>
            )
          )}
        </>
      }
    >
      <div className="cobranca">
        <section className="cobranca__pix">
          <span className="rotulo">Pague com PIX</span>
          <QRCode texto={c.pixCopiaECola} />
          <Botao
            tam="p"
            icone="copiar"
            onClick={async () => {
              await copiarTexto(c.pixCopiaECola);
              avisar('Código PIX copiado.');
            }}
          >
            Copiar código PIX
          </Botao>
        </section>
        <section className="cobranca__boleto">
          <div className="cobranca__linha-topo">
            <strong className="mono">999-9</strong>
            <code className="mono">{formatarLinhaDigitavel(c.linhaDigitavel)}</code>
          </div>
          <dl className="cobranca__campos">
            <div>
              <dt>Beneficiário</dt>
              <dd>
                {db.empresa.razaoSocial} · {mascaraDocumento(db.empresa.cnpj)}
              </dd>
            </div>
            <div>
              <dt>Pagador</dt>
              <dd>{contato ? `${contato.nome}${contato.documento ? ` · ${mascaraDocumento(contato.documento)}` : ''}` : '-'}</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd className="num">{dataBR(l.vencimento)}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd className="num">
                <strong>{moeda(l.valor)}</strong>
              </dd>
            </div>
            <div>
              <dt>Nosso número</dt>
              <dd className="mono">{c.nossoNumero}</dd>
            </div>
            <div>
              <dt>Referente a</dt>
              <dd>{l.documento ?? l.descricao}</dd>
            </div>
          </dl>
          {c.codigoBarras && <CodigoBarras codigo={c.codigoBarras} />}
          <Botao
            tam="p"
            icone="copiar"
            onClick={async () => {
              await copiarTexto(c.linhaDigitavel);
              avisar('Linha digitável copiada.');
            }}
          >
            Copiar linha digitável
          </Botao>
        </section>
      </div>
      <p className="aviso-caixa" style={{ marginTop: 16 }}>
        <Icone nome="info" />
        <span>
          Demonstração: este boleto e este PIX são de exemplo e não cobram ninguém. No Prumo de verdade eles saem pelo banco da empresa e, quando o cliente paga, a baixa
          acontece sozinha, como no botão de simular.
        </span>
      </p>
    </Camada>
  );
}
