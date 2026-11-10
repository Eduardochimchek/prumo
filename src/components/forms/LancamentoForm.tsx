// Formulário de conta a pagar / a receber. Cola a linha digitável do boleto e ele preenche
// valor e vencimento sozinho. Permite parcelar ou repetir todo mês.

import { useMemo, useState } from 'react';
import { addMeses, hoje, mesChave } from '../../lib/dates';
import { moeda } from '../../lib/format';
import { formatarLinhaDigitavel, lerBoleto } from '../../lib/boleto';
import { useDb } from '../../data/store';
import { criarLancamentos, editarLancamento, type NovoLancamento } from '../../data/actions';
import type { FormaPagamento, Lancamento, TipoLancamento } from '../../data/types';
import { useUsuario } from '../../auth/auth';
import { uid } from '../../lib/util';
import { Camada } from '../Camada';
import { Icone } from '../Icone';
import { AreaTexto, Botao, Campo, Entrada, EntradaMoeda, Segmentado, Selecao } from '../ui';
import { useAvisos } from '../Avisos';

export const FORMAS: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: 'boleto', rotulo: 'Boleto' },
  { valor: 'pix', rotulo: 'PIX' },
  { valor: 'transferencia', rotulo: 'Transferência' },
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'debito', rotulo: 'Débito automático' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'cheque', rotulo: 'Cheque' },
];

type Repeticao = 'unica' | 'parcelado' | 'mensal';

export interface PresetLancamento {
  tipo: TipoLancamento;
  descricao?: string;
  contatoId?: string;
  valor?: number;
  vencimento?: string;
}

export function LancamentoForm({
  aberta,
  aoFechar,
  preset,
  editando,
  aoCriarContato,
}: {
  aberta: boolean;
  aoFechar: () => void;
  preset: PresetLancamento;
  editando?: Lancamento;
  aoCriarContato: (tipo: 'cliente' | 'fornecedor', aoSalvar: (id: string) => void) => void;
}) {
  const db = useDb();
  const usuario = useUsuario();
  const { avisar, erro } = useAvisos();
  const base = editando ?? null;

  const [tipo, setTipo] = useState<TipoLancamento>(base?.tipo ?? preset.tipo);
  const [descricao, setDescricao] = useState(base?.descricao ?? preset.descricao ?? '');
  const [valor, setValor] = useState(base?.valor ?? preset.valor ?? 0);
  const [vencimento, setVencimento] = useState(base?.vencimento ?? preset.vencimento ?? hoje());
  const [emissao, setEmissao] = useState(base?.emissao ?? hoje());
  const [competencia, setCompetencia] = useState(base?.competencia ?? '');
  const [contatoId, setContatoId] = useState(base?.contatoId ?? preset.contatoId ?? '');
  const [categoriaId, setCategoriaId] = useState(base?.categoriaId ?? '');
  const [contaId, setContaId] = useState(base?.contaId ?? db.contas.find((c) => c.ativa)?.id ?? '');
  const [forma, setForma] = useState<FormaPagamento | ''>(base?.forma ?? '');
  const [documento, setDocumento] = useState(base?.documento ?? '');
  const [linha, setLinha] = useState(base?.linhaDigitavel ? formatarLinhaDigitavel(base.linhaDigitavel) : '');
  const [observacoes, setObservacoes] = useState(base?.observacoes ?? '');
  const [repeticao, setRepeticao] = useState<Repeticao>('unica');
  const [vezes, setVezes] = useState(3);
  const [tentou, setTentou] = useState(false);

  const boleto = useMemo(() => (linha.replace(/\D/g, '').length >= 44 ? lerBoleto(linha) : null), [linha]);

  const contatos = useMemo(
    () =>
      db.contatos
        .filter((c) => c.tipo === 'ambos' || c.tipo === (tipo === 'pagar' ? 'fornecedor' : 'cliente'))
        .sort((a, b) => (a.fantasia || a.nome).localeCompare(b.fantasia || b.nome, 'pt-BR')),
    [db.contatos, tipo],
  );
  const categorias = db.categorias.filter((c) => c.tipo === (tipo === 'pagar' ? 'despesa' : 'receita'));

  const aoColarLinha = (texto: string) => {
    setLinha(texto);
    const info = texto.replace(/\D/g, '').length >= 44 ? lerBoleto(texto) : null;
    if (info?.valido) {
      if (info.valor && !valor) setValor(info.valor);
      if (info.vencimento && (!base || vencimento === base.vencimento)) setVencimento(info.vencimento);
      if (!forma) setForma('boleto');
    }
  };

  const erros = {
    descricao: !descricao.trim() ? 'Descreva a conta (ex.: “Aluguel de dezembro”).' : null,
    valor: !(valor > 0) ? 'Informe o valor.' : null,
    vencimento: !vencimento ? 'Informe o vencimento.' : null,
  };
  const valido = !erros.descricao && !erros.valor && !erros.vencimento;

  const salvar = () => {
    setTentou(true);
    if (!valido) return;
    try {
      const comum = {
        tipo,
        descricao: descricao.trim(),
        contatoId: contatoId || undefined,
        categoriaId: categoriaId || undefined,
        contaId: contaId || undefined,
        emissao,
        documento: documento.trim() || undefined,
        forma: forma || undefined,
        linhaDigitavel: linha.replace(/\D/g, '') || undefined,
        observacoes: observacoes.trim() || undefined,
      };
      if (base) {
        editarLancamento(base.id, { ...comum, valor, vencimento, competencia: competencia || mesChave(vencimento) }, usuario.id);
        avisar('Alterações salvas.');
        aoFechar();
        return;
      }
      const novos: NovoLancamento[] = [];
      if (repeticao === 'unica') {
        novos.push({ ...comum, valor, vencimento, competencia: competencia || mesChave(vencimento) });
      } else {
        const grupoId = uid('grp_');
        const n = Math.max(2, Math.min(36, vezes));
        const parcela = Math.floor(valor / n);
        for (let i = 0; i < n; i++) {
          const venc = addMeses(vencimento, i);
          const v = repeticao === 'parcelado' ? (i === n - 1 ? valor - parcela * (n - 1) : parcela) : valor;
          novos.push({
            ...comum,
            linhaDigitavel: i === 0 ? comum.linhaDigitavel : undefined,
            valor: v,
            vencimento: venc,
            competencia: mesChave(venc),
            documento: comum.documento ? `${comum.documento} · ${i + 1}/${n}` : undefined,
            parcela: { n: i + 1, de: n },
            grupoId,
          });
        }
      }
      const criados = criarLancamentos(novos, usuario.id);
      avisar(criados.length > 1 ? `${criados.length} lançamentos criados.` : 'Lançamento criado.');
      aoFechar();
    } catch (e) {
      erro(e);
    }
  };

  const valorParcela = repeticao === 'parcelado' && vezes > 1 ? Math.floor(valor / vezes) : valor;

  return (
    <Camada
      aberta={aberta}
      aoFechar={aoFechar}
      tipo="gaveta"
      sobretitulo={base ? 'Editar lançamento' : 'Novo lançamento'}
      titulo={tipo === 'pagar' ? 'Conta a pagar' : 'Conta a receber'}
      rodape={
        <>
          <span className="espaco" />
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" onClick={salvar} icone="check">
            {base ? 'Salvar' : repeticao === 'unica' ? 'Lançar' : `Lançar ${vezes} parcelas`}
          </Botao>
        </>
      }
    >
      <form
        className="grade-form"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {!base && (
          <div>
            <Segmentado
              rotulo="Tipo"
              valor={tipo}
              aoMudar={(t) => {
                setTipo(t);
                setCategoriaId('');
                setContatoId('');
              }}
              opcoes={[
                { valor: 'pagar', rotulo: 'A pagar' },
                { valor: 'receber', rotulo: 'A receber' },
              ]}
            />
          </div>
        )}

        <Campo rotulo="Linha digitável do boleto (opcional)" dica={!boleto ? 'Cole o código e o Prumo preenche valor e vencimento.' : undefined} htmlFor="f-linha">
          <Entrada
            id="f-linha"
            className="entrada--mono"
            inputMode="numeric"
            placeholder="00190.00009 01234.567890 12345.678901 2 00000000000000"
            value={linha}
            onChange={(e) => aoColarLinha(e.target.value)}
          />
        </Campo>
        {boleto && (
          <div className={`aviso-caixa ${boleto.valido ? 'aviso-caixa--ok' : 'aviso-caixa--critico'}`}>
            <Icone nome={boleto.valido ? 'codigoBarras' : 'alerta'} />
            <div>
              {boleto.valido ? (
                <>
                  <strong>{boleto.tipo === 'bancario' ? boleto.banco?.nome : boleto.segmento}</strong>
                  {boleto.valor ? ` · ${moeda(boleto.valor)}` : ''}
                  {boleto.vencimento ? ` · vence ${boleto.vencimento.split('-').reverse().join('/')}` : ''}
                  <div className="muted" style={{ fontSize: 13 }}>Código conferido (dígitos verificadores ok).</div>
                </>
              ) : (
                <>
                  <strong>Código com erro.</strong> {boleto.erros[0]}
                </>
              )}
            </div>
          </div>
        )}

        <Campo rotulo="Descrição" erro={tentou ? erros.descricao : null} htmlFor="f-desc">
          <Entrada id="f-desc" autoFocus value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === 'pagar' ? 'Ex.: Aluguel da loja · dezembro' : 'Ex.: Venda para Construtora Laje Forte'} />
        </Campo>

        <Campo className="c3 m3" rotulo={repeticao === 'parcelado' ? 'Valor total' : 'Valor'} erro={tentou ? erros.valor : null} htmlFor="f-valor">
          <EntradaMoeda id="f-valor" valor={valor} aoMudar={setValor} />
        </Campo>
        <Campo className="c3 m3" rotulo={repeticao === 'unica' ? 'Vencimento' : '1º vencimento'} erro={tentou ? erros.vencimento : null} htmlFor="f-venc">
          <Entrada id="f-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
        </Campo>

        {!base && (
          <>
            <Campo className="c4" rotulo="Repetição" htmlFor="f-rep">
              <Selecao id="f-rep" value={repeticao} onChange={(e) => setRepeticao(e.target.value as Repeticao)}>
                <option value="unica">Conta única</option>
                <option value="parcelado">Parcelar o valor</option>
                <option value="mensal">Repetir todo mês (mesmo valor)</option>
              </Selecao>
            </Campo>
            {repeticao !== 'unica' && (
              <Campo className="c2" rotulo="Vezes" htmlFor="f-vezes" dica={valor ? `${vezes}× de ${moeda(valorParcela)}` : undefined}>
                <Entrada id="f-vezes" type="number" min={2} max={36} value={vezes} onChange={(e) => setVezes(Number(e.target.value) || 2)} />
              </Campo>
            )}
          </>
        )}

        <Campo rotulo={tipo === 'pagar' ? 'Fornecedor' : 'Cliente'} htmlFor="f-contato">
          <div style={{ display: 'flex', gap: 8 }}>
            <Selecao id="f-contato" value={contatoId} onChange={(e) => setContatoId(e.target.value)}>
              <option value="">Sem {tipo === 'pagar' ? 'fornecedor' : 'cliente'}</option>
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fantasia || c.nome}
                </option>
              ))}
            </Selecao>
            <Botao
              icone="mais"
              aria-label="Cadastrar novo contato"
              title="Cadastrar novo contato"
              onClick={() => aoCriarContato(tipo === 'pagar' ? 'fornecedor' : 'cliente', (id) => setContatoId(id))}
            />
          </div>
        </Campo>

        <Campo className="c3" rotulo="Categoria" htmlFor="f-cat">
          <Selecao id="f-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo className="c3" rotulo="Forma de pagamento" htmlFor="f-forma">
          <Selecao id="f-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)}>
            <option value="">Não informada</option>
            {FORMAS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </Selecao>
        </Campo>

        <Campo className="c3" rotulo={tipo === 'pagar' ? 'Pagar pela conta' : 'Receber na conta'} htmlFor="f-conta">
          <Selecao id="f-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
            {db.contas
              .filter((c) => c.ativa)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </Selecao>
        </Campo>
        <Campo className="c3" rotulo="Documento" htmlFor="f-doc" dica="Nº da nota, boleto, contrato…">
          <Entrada id="f-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} />
        </Campo>

        <Campo className="c3 m3" rotulo="Emissão" htmlFor="f-emissao">
          <Entrada id="f-emissao" type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
        </Campo>
        <Campo className="c3 m3" rotulo="Competência" htmlFor="f-comp" dica="Mês a que a conta se refere (para o DRE).">
          <Entrada id="f-comp" type="month" value={competencia || mesChave(vencimento || hoje())} onChange={(e) => setCompetencia(e.target.value)} />
        </Campo>

        <Campo rotulo="Observações" htmlFor="f-obs">
          <AreaTexto id="f-obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
        </Campo>
        <button type="submit" hidden />
      </form>
    </Camada>
  );
}
