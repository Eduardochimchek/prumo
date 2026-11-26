// Importar contas de uma planilha: quem vem do Excel não precisa redigitar nada.
// 1) cola as linhas (ou escolhe um CSV); 2) confere o que é cada coluna e a prévia; 3) importa.

import { useMemo, useRef, useState } from 'react';
import { dataBR, hoje } from '../../lib/dates';
import { moeda, plural } from '../../lib/format';
import {
  CAMPOS_PLANILHA,
  LIMITE_PLANILHA_BYTES,
  LIMITE_PLANILHA_LINHAS,
  decodificarTexto,
  lerTabela,
  montarLinhas,
  pareceCabecalho,
  pareceExcelBinario,
  sugerirMapeamento,
  type Mapeamento,
  type ModoTipo,
} from '../../lib/planilha';
import { baixarArquivo, gerarCsv } from '../../lib/util';
import { useDb } from '../../data/store';
import { importarPlanilha } from '../../data/actions';
import { chaveTitulo } from '../../data/selectors';
import { useUsuario } from '../../auth/auth';
import { Camada } from '../Camada';
import { Icone } from '../Icone';
import { AreaTexto, Botao, Caixa, Campo, CarimboTexto, Segmentado, Selecao } from '../ui';
import { useAvisos } from '../Avisos';

const MODELO = [
  ['Descrição', 'Fornecedor ou cliente', 'Valor', 'Vencimento', 'Categoria', 'Tipo', 'Pago em', 'Documento'],
  ['Aluguel da loja', 'Moinhos Imóveis', '6.800,00', '10/12/2026', 'Aluguel e condomínio', 'Pagar', '', 'Boleto 12/2026'],
  ['Conta de luz', 'Força Sul Energia', '1.180,40', '15/12/2026', 'Energia, água e telefone', 'Pagar', '', ''],
  ['Venda para Laje Forte', 'Laje Forte', '4.320,00', '28/11/2026', 'Venda de mercadorias', 'Receber', '28/11/2026', 'NF 3301'],
];

export function ImportarPlanilha({ aoFechar }: { aoFechar: () => void }) {
  const db = useDb();
  const usuario = useUsuario();
  const { avisar, erro } = useAvisos();
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [texto, setTexto] = useState('');
  const [etapa, setEtapa] = useState<'colar' | 'conferir'>('colar');
  const [tabela, setTabela] = useState<string[][]>([]);
  const [temCabecalho, setTemCabecalho] = useState(true);
  const [mapa, setMapa] = useState<Mapeamento | null>(null);
  const [modoTipo, setModoTipo] = useState<ModoTipo>('pagar');
  const [contaId, setContaId] = useState(db.contas.find((c) => c.ativa)?.id ?? '');
  const [criarContatos, setCriarContatos] = useState(true);
  const [pularRepetidas, setPularRepetidas] = useState(true);
  const [problema, setProblema] = useState<string | null>(null);

  const ref = hoje();
  const colunas = useMemo(() => {
    const n = Math.max(0, ...tabela.map((l) => l.length));
    return Array.from({ length: n }, (_, i) => (temCabecalho && tabela[0]?.[i] ? tabela[0][i] : `Coluna ${i + 1}`));
  }, [tabela, temCabecalho]);

  const linhas = useMemo(() => (mapa ? montarLinhas(tabela, mapa, { temCabecalho, modoTipo, hoje: ref }) : []), [tabela, mapa, temCabecalho, modoTipo, ref]);

  // linhas iguais a contas já lançadas (ou repetidas dentro da própria planilha)
  const repetidas = useMemo(() => {
    const existentes = new Set(db.lancamentos.filter((l) => !l.cancelado).map((l) => chaveTitulo(l.tipo, l.valor, l.vencimento, l.descricao)));
    const marcadas = new Set<number>();
    for (const l of linhas) {
      if (l.erros.length || !l.tipo || !l.vencimento) continue;
      const k = chaveTitulo(l.tipo, l.valor, l.vencimento, l.descricao);
      if (existentes.has(k)) marcadas.add(l.n);
      existentes.add(k);
    }
    return marcadas;
  }, [linhas, db.lancamentos]);

  const validas = linhas.filter((l) => l.erros.length === 0 && !(pularRepetidas && repetidas.has(l.n)));
  const comErro = linhas.filter((l) => l.erros.length > 0);
  const pagas = validas.filter((l) => l.pagoEm).length;
  const totalPagar = validas.filter((l) => l.tipo === 'pagar').reduce((a, l) => a + l.valor, 0);
  const totalReceber = validas.filter((l) => l.tipo === 'receber').reduce((a, l) => a + l.valor, 0);
  const faltaObrigatorio = mapa ? CAMPOS_PLANILHA.filter((c) => c.obrigatorio && mapa[c.campo] < 0 && !(c.campo === 'descricao' && mapa.contato >= 0)) : [];

  const continuar = (bruto: string) => {
    setProblema(null);
    if (new Blob([bruto]).size > LIMITE_PLANILHA_BYTES) return setProblema('A planilha passa de 5 MB. Divida em partes menores.');
    const t = lerTabela(bruto);
    if (t.length === 0) return setProblema('Não encontrei nenhuma linha. Copie as células da planilha (com a linha de títulos) e cole aqui.');
    if (t.length > LIMITE_PLANILHA_LINHAS + 1) return setProblema(`São ${t.length} linhas; o limite por vez é ${LIMITE_PLANILHA_LINHAS}. Divida a planilha em partes.`);
    if (Math.max(...t.map((l) => l.length)) < 2) return setProblema('Só encontrei uma coluna. Copie direto do Excel ou do Google Planilhas (as colunas vêm separadas) ou use um CSV com “;”.');
    const cab = pareceCabecalho(t[0]);
    const m = cab ? sugerirMapeamento(t[0]) : (Object.fromEntries(CAMPOS_PLANILHA.map((c) => [c.campo, -1])) as Mapeamento);
    setTabela(t);
    setTemCabecalho(cab);
    setMapa(m);
    setModoTipo(m.tipo >= 0 ? 'coluna' : 'pagar');
    setEtapa('conferir');
  };

  const escolherArquivo = async (f: File | undefined) => {
    if (!f) return;
    setProblema(null);
    if (f.size > LIMITE_PLANILHA_BYTES) return setProblema('O arquivo passa de 5 MB. Divida em partes menores.');
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (pareceExcelBinario(bytes)) {
      return setProblema('Este é um arquivo do Excel (.xlsx). Abra a planilha, selecione as linhas (com os títulos), copie e cole aqui. Ou, no Excel, use “Salvar como” > CSV.');
    }
    const conteudo = decodificarTexto(bytes);
    setTexto(conteudo);
    continuar(conteudo);
  };

  const importar = () => {
    try {
      // a própria ação pula as repetidas (mesma regra da prévia) e devolve quantas pulou
      const r = importarPlanilha(linhas, { contaId: contaId || undefined, criarContatos, pularRepetidas }, usuario.id);
      const partes = [
        `${plural(r.criados, 'conta importada', 'contas importadas')}`,
        r.pagos ? `${r.pagos} já paga${r.pagos > 1 ? 's' : ''}` : '',
        r.contatosNovos ? `${plural(r.contatosNovos, 'contato novo', 'contatos novos')}` : '',
        r.repetidas ? `${plural(r.repetidas, 'repetida pulada', 'repetidas puladas')}` : '',
      ].filter(Boolean);
      avisar(`${partes.join(' · ')}.${r.semCategoria.length ? ` Categorias não encontradas (ficaram sem categoria): ${r.semCategoria.slice(0, 3).join(', ')}${r.semCategoria.length > 3 ? '…' : ''}.` : ''}`, { duracao: 9000 });
      aoFechar();
    } catch (e) {
      erro(e);
    }
  };

  const mudarCampo = (campo: keyof Mapeamento, coluna: number) => setMapa((m) => (m ? { ...m, [campo]: coluna } : m));

  return (
    <Camada
      aberta
      aoFechar={aoFechar}
      largo
      sobretitulo="Importar"
      titulo={etapa === 'colar' ? 'Contas de uma planilha' : 'Confira antes de importar'}
      rodape={
        etapa === 'colar' ? (
          <>
            <Botao icone="baixar" variante="fantasma" onClick={() => baixarArquivo('modelo-prumo-contas.csv', gerarCsv(MODELO), 'text/csv;charset=utf-8')}>
              Baixar modelo
            </Botao>
            <span className="espaco" />
            <Botao variante="fantasma" onClick={aoFechar}>
              Cancelar
            </Botao>
            <Botao variante="primario" iconeDepois="avancar" disabled={!texto.trim()} onClick={() => continuar(texto)}>
              Continuar
            </Botao>
          </>
        ) : (
          <>
            <Botao icone="voltar" variante="fantasma" onClick={() => setEtapa('colar')}>
              Voltar
            </Botao>
            <span className="espaco" />
            <Botao variante="primario" icone="check" disabled={validas.length === 0 || faltaObrigatorio.length > 0 || (pagas > 0 && !contaId)} onClick={importar}>
              {validas.length ? `Importar ${plural(validas.length, 'conta', 'contas')}` : 'Nada para importar'}
            </Botao>
          </>
        )
      }
    >
      {etapa === 'colar' ? (
        <div className="planilha">
          <ol className="planilha__passos">
            <li>Abra sua planilha no Excel ou no Google Planilhas.</li>
            <li>Selecione as linhas das contas, junto com a linha de títulos (Descrição, Valor, Vencimento…).</li>
            <li>Copie (Ctrl+C) e cole aqui embaixo (Ctrl+V).</li>
          </ol>
          <Campo rotulo="Linhas da planilha" htmlFor="p-texto">
            <AreaTexto
              id="p-texto"
              rows={9}
              className="entrada--mono planilha__texto"
              placeholder={'Descrição\tValor\tVencimento\nAluguel da loja\t6.800,00\t10/12/2026'}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </Campo>
          <div className="planilha__ou">
            <span className="muted">ou</span>
            <Botao icone="arquivo" onClick={() => arquivoRef.current?.click()}>
              Escolher arquivo CSV
            </Botao>
            <input
              ref={arquivoRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain"
              hidden
              onChange={(e) => {
                void escolherArquivo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {problema && (
            <p className="aviso-caixa aviso-caixa--critico" role="alert">
              <Icone nome="alerta" />
              <span>{problema}</span>
            </p>
          )}
          <p className="muted" style={{ fontSize: 13 }}>
            Valores como “R$ 1.234,56” e datas como “05/12/2026” são entendidos do jeito que estão. Na próxima tela você confere tudo antes de importar.
          </p>
        </div>
      ) : (
        mapa && (
          <div className="planilha">
            <div>
              <Caixa
                rotulo="A primeira linha tem os títulos das colunas"
                checked={temCabecalho}
                onChange={(e) => {
                  setTemCabecalho(e.target.checked);
                  if (e.target.checked) setMapa(sugerirMapeamento(tabela[0]));
                }}
              />
            </div>

            <section>
              <h3 className="detalhe__h3">O que é cada coluna</h3>
              <div className="grade-form planilha__mapa">
                {CAMPOS_PLANILHA.map((c) => (
                  <Campo key={c.campo} className="c2 m3" rotulo={`${c.rotulo}${c.obrigatorio ? '' : ' (opcional)'}`} htmlFor={`p-${c.campo}`}>
                    <Selecao id={`p-${c.campo}`} value={mapa[c.campo]} onChange={(e) => mudarCampo(c.campo, Number(e.target.value))}>
                      <option value={-1}>Não usar</option>
                      {colunas.map((nome, i) => (
                        <option key={i} value={i}>
                          {nome}
                        </option>
                      ))}
                    </Selecao>
                  </Campo>
                ))}
              </div>
              {faltaObrigatorio.length > 0 && (
                <p className="aviso-caixa aviso-caixa--atencao" style={{ marginTop: 12 }}>
                  <Icone nome="alerta" />
                  <span>Escolha a coluna de: {faltaObrigatorio.map((c) => c.rotulo.toLowerCase()).join(', ')}.</span>
                </p>
              )}
            </section>

            <section>
              <h3 className="detalhe__h3">São contas a pagar ou a receber?</h3>
              <Segmentado
                rotulo="Tipo das contas"
                valor={modoTipo}
                aoMudar={setModoTipo}
                opcoes={[
                  { valor: 'pagar', rotulo: 'Todas a pagar' },
                  { valor: 'receber', rotulo: 'Todas a receber' },
                  { valor: 'coluna', rotulo: 'Pela coluna Tipo' },
                  { valor: 'sinal', rotulo: 'Negativo = a pagar' },
                ]}
              />
              {modoTipo === 'coluna' && mapa.tipo < 0 && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Escolha acima qual é a coluna “Tipo”.</p>}
            </section>

            <div className="grade-form">
              <Campo className="c3" rotulo="Conta bancária" htmlFor="p-conta" dica={pagas ? `Usada nas ${plural(pagas, 'linha que já vem paga', 'linhas que já vêm pagas')}.` : 'Conta prevista para pagar e receber.'}>
                <Selecao id="p-conta" value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  {db.contas
                    .filter((c) => c.ativa)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </Selecao>
              </Campo>
              <div className="c3 planilha__opcoes">
                <Caixa rotulo="Cadastrar fornecedores e clientes que não existem" checked={criarContatos} onChange={(e) => setCriarContatos(e.target.checked)} />
                <Caixa rotulo="Pular contas que já estão lançadas" checked={pularRepetidas} onChange={(e) => setPularRepetidas(e.target.checked)} />
              </div>
            </div>

            <section>
              <div className="secao-titulo" style={{ marginBottom: 8 }}>
                <h3 className="detalhe__h3" style={{ margin: 0 }}>
                  Prévia
                </h3>
                <span className="muted num" style={{ fontSize: 13 }}>
                  {plural(validas.length, 'pronta', 'prontas')}
                  {comErro.length ? ` · ${plural(comErro.length, 'com problema', 'com problema')}` : ''}
                  {pularRepetidas && repetidas.size ? ` · ${plural(repetidas.size, 'repetida', 'repetidas')}` : ''}
                </span>
              </div>
              {(totalPagar > 0 || totalReceber > 0) && (
                <p className="planilha__totais num">
                  {totalPagar > 0 && <span className="saida-txt">A pagar {moeda(totalPagar)}</span>}
                  {totalReceber > 0 && <span className="entrada-txt">A receber {moeda(totalReceber)}</span>}
                </p>
              )}
              <div className="tabela-rolagem painel">
                <table className="razao planilha__previa">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Tipo</th>
                      <th>Vencimento</th>
                      <th>Descrição</th>
                      <th className="dir">Valor</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.slice(0, 100).map((l) => {
                      const repetida = repetidas.has(l.n);
                      return (
                        <tr key={l.n} className={l.erros.length ? 'planilha__erro' : repetida && pularRepetidas ? 'planilha__pulada' : undefined}>
                          <td className="num">{l.n}</td>
                          <td>{l.tipo === 'pagar' ? 'A pagar' : l.tipo === 'receber' ? 'A receber' : '-'}</td>
                          <td className="num">{l.vencimento ? dataBR(l.vencimento) : '-'}</td>
                          <td>
                            <strong>{l.descricao || '-'}</strong>
                            {l.contato && l.contato !== l.descricao && <div className="muted">{l.contato}</div>}
                          </td>
                          <td className="valor">{l.valor ? moeda(l.valor) : '-'}</td>
                          <td>
                            {l.erros.length ? (
                              <span className="critico-txt">{l.erros.join('; ')}</span>
                            ) : repetida ? (
                              <CarimboTexto variante="cancelado">{pularRepetidas ? 'Já lançada' : 'Repetida'}</CarimboTexto>
                            ) : l.pagoEm ? (
                              <CarimboTexto variante="pago">Pago {dataBR(l.pagoEm).slice(0, 5)}</CarimboTexto>
                            ) : (
                              <CarimboTexto variante="aberto">Em aberto</CarimboTexto>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {linhas.length > 100 && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Mostrando 100 de {linhas.length} linhas. Todas as válidas serão importadas.</p>}
              {comErro.length > 0 && (
                <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  As linhas com problema ficam de fora. Corrija na planilha e cole de novo, ou lance à mão depois.
                </p>
              )}
            </section>
          </div>
        )
      )}
    </Camada>
  );
}
