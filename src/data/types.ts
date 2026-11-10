// Modelo de domínio do Prumo. Dinheiro sempre em CENTAVOS (inteiro). Datas de negócio em 'YYYY-MM-DD'.
// Quando a V2 tiver backend, estes tipos viram o contrato da API (mesmos nomes de campo).

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;
export type Centavos = number;

export type Papel = 'admin' | 'financeiro' | 'leitura';

export interface Usuario {
  id: ID;
  nome: string;
  email: string;
  login: string;
  cargo?: string;
  telefone?: string;
  papel: Papel;
  ativo: boolean;
  senhaHash: string;
  senhaSal: string;
  /** Data de cadastro do usuário */
  criadoEm: ISODateTime;
  criadoPor?: ID;
  ultimoAcesso?: ISODateTime;
}

export type Regime = 'simples' | 'presumido' | 'real' | 'mei';

export interface Empresa {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual?: string;
  uf: string;
  municipio: string;
  regime: Regime;
}

export type TipoContato = 'cliente' | 'fornecedor' | 'ambos';

export interface Contato {
  id: ID;
  tipo: TipoContato;
  nome: string;
  fantasia?: string;
  /** CPF ou CNPJ normalizado (sem máscara; CNPJ pode ser alfanumérico) */
  documento: string;
  email?: string;
  telefone?: string;
  cep?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  observacoes?: string;
  criadoEm: ISODateTime;
}

export type TipoCategoria = 'receita' | 'despesa';

export interface Categoria {
  id: ID;
  nome: string;
  tipo: TipoCategoria;
}

export type TipoConta = 'corrente' | 'poupanca' | 'caixa' | 'investimento';

export interface ContaBancaria {
  id: ID;
  nome: string;
  bancoCodigo?: string;
  agencia?: string;
  numero?: string;
  tipo: TipoConta;
  saldoInicial: Centavos;
  /** data a partir da qual o saldo inicial vale */
  saldoInicialEm: ISODate;
  ativa: boolean;
}

export type TipoLancamento = 'pagar' | 'receber';

export type FormaPagamento = 'boleto' | 'pix' | 'transferencia' | 'cartao' | 'dinheiro' | 'debito' | 'cheque';

export interface Baixa {
  data: ISODate;
  valorPago: Centavos;
  juros: Centavos;
  desconto: Centavos;
  contaId: ID;
  usuarioId: ID;
  registradaEm: ISODateTime;
  observacao?: string;
}

/** Um título: conta a pagar ou a receber. */
export interface Lancamento {
  id: ID;
  tipo: TipoLancamento;
  descricao: string;
  contatoId?: ID;
  categoriaId?: ID;
  /** conta bancária prevista para pagar/receber */
  contaId?: ID;
  valor: Centavos;
  emissao: ISODate;
  vencimento: ISODate;
  /** mês de competência 'YYYY-MM' (para o DRE por competência) */
  competencia: string;
  documento?: string;
  parcela?: { n: number; de: number };
  grupoId?: ID;
  forma?: FormaPagamento;
  linhaDigitavel?: string;
  notaId?: ID;
  baixa?: Baixa;
  cancelado?: boolean;
  observacoes?: string;
  criadoEm: ISODateTime;
  criadoPor: ID;
  atualizadoEm?: ISODateTime;
}

export type SituacaoNota = 'autorizada' | 'cancelada' | 'denegada' | 'sem_protocolo';

export interface ItemNota {
  codigo: string;
  descricao: string;
  ncm?: string;
  cfop?: string;
  unidade?: string;
  quantidade: number;
  valorUnitario: Centavos;
  valorTotal: Centavos;
}

export interface NotaFiscal {
  id: ID;
  chave: string;
  modelo: string;
  serie: string;
  numero: string;
  /** do ponto de vista da NOSSA empresa */
  direcao: 'entrada' | 'saida';
  naturezaOperacao?: string;
  emissao: ISODateTime;
  emitente: { documento: string; nome: string; fantasia?: string; uf?: string; municipio?: string };
  destinatario: { documento: string; nome: string; fantasia?: string; uf?: string; municipio?: string };
  itens: ItemNota[];
  totais: {
    produtos: Centavos;
    frete: Centavos;
    desconto: Centavos;
    ipi: Centavos;
    icms: Centavos;
    st: Centavos;
    pis: Centavos;
    cofins: Centavos;
    outros: Centavos;
    nota: Centavos;
  };
  duplicatas: { numero: string; vencimento: ISODate; valor: Centavos }[];
  situacao: SituacaoNota;
  protocolo?: string;
  origem: 'xml' | 'sefaz' | 'manual';
  contatoId?: ID;
  importadaEm: ISODateTime;
  importadaPor: ID;
}

export type Manifestacao = 'pendente' | 'ciencia' | 'confirmada' | 'desconhecida' | 'nao_realizada';

/** Resumo de NF-e emitida contra o CNPJ da empresa (Distribuição DF-e da SEFAZ). */
export interface ResumoSefaz {
  id: ID;
  chave: string;
  emitenteDocumento: string;
  emitenteNome: string;
  emissao: ISODateTime;
  valor: Centavos;
  situacao: SituacaoNota;
  manifestacao: Manifestacao;
  recebidoEm: ISODateTime;
  notaId?: ID;
  /** veio da simulação (modo demonstração) */
  demo: boolean;
}

export type TipoAtividade = 'baixa' | 'estorno' | 'criacao' | 'edicao' | 'exclusao' | 'importacao' | 'usuario' | 'config' | 'sefaz';

export interface Atividade {
  id: ID;
  em: ISODateTime;
  usuarioId: ID;
  tipo: TipoAtividade;
  texto: string;
  ref?: { tipo: 'lancamento' | 'nota' | 'contato' | 'usuario'; id: ID };
}

export interface ConfigSefaz {
  ambiente: 'homologacao' | 'producao';
  uf: string;
  certificado?: { titular: string; validade: ISODate };
  ultimaSincronizacao?: ISODateTime;
}

export interface Database {
  versao: number;
  criadoEm: ISODateTime;
  /** base criada com dados fictícios de demonstração */
  demo: boolean;
  empresa: Empresa;
  usuarios: Usuario[];
  contatos: Contato[];
  categorias: Categoria[];
  contas: ContaBancaria[];
  lancamentos: Lancamento[];
  notas: NotaFiscal[];
  sefaz: ResumoSefaz[];
  atividades: Atividade[];
  configSefaz: ConfigSefaz;
}
