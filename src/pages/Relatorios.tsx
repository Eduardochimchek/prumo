import { useMemo, useState } from 'react';
import { addMesesChave, dataBR, hoje, mesAbrev, mesChave, mesLongo } from '../lib/dates';
import { moeda, numero } from '../lib/format';
import { mascaraDocumento } from '../lib/br';
import { baixarArquivo, gerarCsv } from '../lib/util';
import { useDb } from '../data/store';
import { dre, indices, statusDe, type Regime } from '../data/selectors';
import { Botao, Caixa, Segmentado } from '../components/ui';
import { Icone } from '../components/Icone';

const f = (v: number) => (v / 100).toFixed(2).replace('.', ',');

export function Relatorios() {
  const db = useDb();
  const ref = hoje();
  const [regime, setRegime] = useState<Regime>('caixa');
  const [qtd, setQtd] = useState<'3' | '6' | '12'>('6');
  const idx = indices(db);

  const [comAtual, setComAtual] = useState(false);
  const meses = useMemo(() => {
    const n = Number(qtd);
    // por padrão, só meses fechados (o mês em andamento distorce a margem)
    const fim = comAtual ? 0 : -1;
    return Array.from({ length: n }, (_, i) => addMesesChave(mesChave(ref), fim - n + 1 + i));
  }, [qtd, ref, comAtual]);
  const r = useMemo(() => dre(db, meses, regime), [db, meses, regime]);
  const totalRec = r.totalReceitas.reduce((a, b) => a + b, 0);
  const totalDesp = r.totalDespesas.reduce((a, b) => a + b, 0);
  const resultado = totalRec - totalDesp;
  const margem = totalRec ? (resultado / totalRec) * 100 : 0;

  const exportarDre = () => {
    const linhas: (string | number)[][] = [['Linha', ...meses.map(mesAbrev), 'Total']];
    linhas.push(['RECEITAS', ...r.totalReceitas.map(f), f(totalRec)]);
    r.receitas.forEach((l) => linhas.push([`  ${l.nome}`, ...l.valores.map(f), f(l.total)]));
    linhas.push(['DESPESAS', ...r.totalDespesas.map(f), f(totalDesp)]);
    r.despesas.forEach((l) => linhas.push([`  ${l.nome}`, ...l.valores.map(f), f(l.total)]));
    linhas.push(['RESULTADO', ...r.resultado.map(f), f(resultado)]);
    baixarArquivo(`prumo-dre-${regime}-${ref}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  const exportarLancamentos = () => {
    const linhas = [
      ['Tipo', 'Descrição', 'Contato', 'CPF/CNPJ', 'Categoria', 'Competência', 'Emissão', 'Vencimento', 'Valor', 'Situação', 'Baixa', 'Valor pago', 'Juros', 'Desconto', 'Conta', 'Documento'],
      ...db.lancamentos.map((l) => {
        const c = l.contatoId ? idx.contatos.get(l.contatoId) : undefined;
        return [
          l.tipo === 'pagar' ? 'Pagar' : 'Receber',
          l.descricao,
          c?.nome ?? '',
          c?.documento ? mascaraDocumento(c.documento) : '',
          idx.categorias.get(l.categoriaId ?? '')?.nome ?? '',
          l.competencia,
          dataBR(l.emissao),
          dataBR(l.vencimento),
          f(l.valor),
          statusDe(l),
          l.baixa ? dataBR(l.baixa.data) : '',
          l.baixa ? f(l.baixa.valorPago) : '',
          l.baixa ? f(l.baixa.juros) : '',
          l.baixa ? f(l.baixa.desconto) : '',
          idx.contas.get(l.baixa?.contaId ?? l.contaId ?? '')?.nome ?? '',
          l.documento ?? '',
        ];
      }),
    ];
    baixarArquivo(`prumo-lancamentos-${ref}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  const exportarNotas = () => {
    const linhas = [
      ['Chave', 'Número', 'Série', 'Emissão', 'Sentido', 'Emitente', 'CNPJ emitente', 'Destinatário', 'CNPJ destinatário', 'Situação', 'Produtos', 'Frete', 'ICMS', 'IPI', 'PIS', 'COFINS', 'Total'],
      ...db.notas.map((n) => [
        n.chave,
        n.numero,
        n.serie,
        dataBR(n.emissao.slice(0, 10)),
        n.direcao,
        n.emitente.nome,
        mascaraDocumento(n.emitente.documento),
        n.destinatario.nome,
        mascaraDocumento(n.destinatario.documento),
        n.situacao,
        f(n.totais.produtos),
        f(n.totais.frete),
        f(n.totais.icms),
        f(n.totais.ipi),
        f(n.totais.pis),
        f(n.totais.cofins),
        f(n.totais.nota),
      ]),
    ];
    baixarArquivo(`prumo-notas-fiscais-${ref}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  const exportarContatos = () => {
    const linhas = [
      ['Tipo', 'Nome', 'Fantasia', 'CPF/CNPJ', 'E-mail', 'Telefone', 'Cidade', 'UF', 'Cadastrado em'],
      ...db.contatos.map((c) => [c.tipo, c.nome, c.fantasia ?? '', c.documento ? mascaraDocumento(c.documento) : '', c.email ?? '', c.telefone ?? '', c.cidade ?? '', c.uf ?? '', dataBR(c.criadoEm.slice(0, 10))]),
    ];
    baixarArquivo(`prumo-contatos-${ref}.csv`, gerarCsv(linhas), 'text/csv;charset=utf-8');
  };

  const Linha = ({ nome, valores, total, classe }: { nome: string; valores: number[]; total: number; classe?: string }) => (
    <tr className={classe}>
      <td>{nome}</td>
      {valores.map((v, i) => (
        <td key={i} className="valor">
          {v ? moeda(v) : '-'}
        </td>
      ))}
      <td className="valor dre__total">{moeda(total)}</td>
    </tr>
  );

  return (
    <div className="relatorios">
      <header className="pagina-cabeca">
        <div className="pagina-cabeca__texto">
          <p className="rotulo">Relatórios · DRE gerencial</p>
          <h1>Resultado da empresa</h1>
          <p className="lede">
            De {mesLongo(meses[0])} a {mesLongo(meses[meses.length - 1])}{comAtual ? ' (parcial)' : ''}, entraram <strong>{moeda(totalRec)}</strong> e saíram <strong>{moeda(totalDesp)}</strong>: resultado de{' '}
            <strong className={resultado >= 0 ? 'entrada-txt' : 'critico-txt'}>{moeda(resultado, { sinal: true })}</strong> ({numero(margem, 1)}% do faturamento).
          </p>
        </div>
        <div className="pagina-cabeca__acoes">
          <Botao icone="baixar" onClick={exportarDre}>
            Exportar DRE
          </Botao>
        </div>
      </header>

      <div className="filtros">
        <Segmentado
          rotulo="Regime"
          valor={regime}
          aoMudar={setRegime}
          opcoes={[
            { valor: 'caixa', rotulo: 'Regime de caixa' },
            { valor: 'competencia', rotulo: 'Competência' },
          ]}
        />
        <Segmentado
          rotulo="Período"
          valor={qtd}
          aoMudar={setQtd}
          opcoes={[
            { valor: '3', rotulo: '3 meses' },
            { valor: '6', rotulo: '6 meses' },
            { valor: '12', rotulo: '12 meses' },
          ]}
        />
      </div>
      <div style={{ margin: '-4px 0 10px' }}>
        <Caixa rotulo="Incluir o mês atual (ainda em andamento)" checked={comAtual} onChange={(e) => setComAtual(e.target.checked)} />
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
        {regime === 'caixa'
          ? 'Caixa: conta o que efetivamente foi pago e recebido, no mês da baixa.'
          : 'Competência: conta pelo mês a que a receita ou despesa se refere, pago ou não.'}{' '}
        Este é um demonstrativo gerencial e não substitui a contabilidade oficial.
      </p>

      <div className="tabela-rolagem painel">
        <table className="razao dre">
          <thead>
            <tr>
              <th>Linha</th>
              {meses.map((m) => (
                <th key={m} className="dir">
                  {mesAbrev(m)}
                </th>
              ))}
              <th className="dir">Total</th>
            </tr>
          </thead>
          <tbody>
            <Linha nome="Receitas" valores={r.totalReceitas} total={totalRec} classe="dre__grupo" />
            {r.receitas.map((l) => (
              <Linha key={l.categoriaId} nome={l.nome} valores={l.valores} total={l.total} classe="dre__item" />
            ))}
            <Linha nome="Despesas" valores={r.totalDespesas} total={totalDesp} classe="dre__grupo" />
            {r.despesas.map((l) => (
              <Linha key={l.categoriaId} nome={l.nome} valores={l.valores} total={l.total} classe="dre__item" />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Resultado</td>
              {r.resultado.map((v, i) => (
                <td key={i} className={`valor ${v >= 0 ? 'entrada-txt' : 'critico-txt'}`}>
                  {moeda(v, { sinal: true })}
                </td>
              ))}
              <td className={`valor ${resultado >= 0 ? 'entrada-txt' : 'critico-txt'}`}>{moeda(resultado, { sinal: true })}</td>
            </tr>
            <tr className="dre__margem">
              <td>Margem</td>
              {r.resultado.map((v, i) => (
                <td key={i} className="valor muted">
                  {r.totalReceitas[i] ? `${numero((v / r.totalReceitas[i]) * 100, 1)}%` : '-'}
                </td>
              ))}
              <td className="valor">{numero(margem, 1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section style={{ marginTop: 40 }}>
        <div className="secao-titulo">
          <h2>Para o contador</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            planilhas abrem no Excel (CSV com “;”)
          </span>
        </div>
        <div className="exportacoes">
          {(
            [
              ['Lançamentos', `${db.lancamentos.length} títulos, com baixas, juros e descontos`, exportarLancamentos],
              ['Notas fiscais', `${db.notas.length} notas com chave, impostos e totais`, exportarNotas],
              ['Contatos', `${db.contatos.length} clientes e fornecedores`, exportarContatos],
            ] as const
          ).map(([titulo, texto, fn]) => (
            <button key={titulo} type="button" className="exportacao" onClick={fn}>
              <Icone nome="baixar" />
              <span>
                <strong>{titulo}</strong>
                <span>{texto}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
