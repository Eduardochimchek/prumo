// Arquivos para o contador: planilhas (CSV com ";") de lançamentos, notas fiscais e contatos.

import { dataBR, hoje } from '../../lib/dates';
import { mascaraDocumento } from '../../lib/br';
import { baixarArquivo, gerarCsv } from '../../lib/util';
import { useDb } from '../../data/store';
import { indices, statusDe } from '../../data/selectors';
import { Icone } from '../../components/Icone';
import { CabecalhoRelatorio, csvValor } from './comum';

export function RelatorioContador() {
  const db = useDb();
  const ref = hoje();
  const idx = indices(db);

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
          csvValor(l.valor),
          statusDe(l),
          l.baixa ? dataBR(l.baixa.data) : '',
          l.baixa ? csvValor(l.baixa.valorPago) : '',
          l.baixa ? csvValor(l.baixa.juros) : '',
          l.baixa ? csvValor(l.baixa.desconto) : '',
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
        csvValor(n.totais.produtos),
        csvValor(n.totais.frete),
        csvValor(n.totais.icms),
        csvValor(n.totais.ipi),
        csvValor(n.totais.pis),
        csvValor(n.totais.cofins),
        csvValor(n.totais.nota),
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

  return (
    <div className="relatorios">
      <CabecalhoRelatorio modulo="financeiro" titulo="Arquivos para o contador" />
      <p className="muted" style={{ fontSize: 14, margin: '0 0 16px' }}>
        Planilhas que abrem no Excel (CSV com “;”). Mande para o contador junto com os XML das notas.
      </p>
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
    </div>
  );
}
