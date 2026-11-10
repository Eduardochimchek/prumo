// Base de DEMONSTRAÇÃO: uma loja de materiais de construção fictícia em Porto Alegre/RS,
// com 6 meses de histórico e 2 meses de projeção, gerada RELATIVA À DATA DE HOJE
// (o sistema sempre parece "vivo"). Determinística: mesma semente => mesmos dados.
// Todos os nomes, CNPJs e valores são fictícios.

import {
  addDias,
  addMeses,
  addMesesChave,
  diaDoMes,
  hoje,
  inicioMes,
  mesChave,
  mesCurto,
  nDiaUtil,
  parseISO,
  proximoDiaUtil,
  diaSemana,
  dataBR,
  type ISODate,
} from '../lib/dates';
import { calcularDvCnpj } from '../lib/br';
import { aleatorio } from '../lib/util';
import { montarChave } from '../lib/nfe/chave';
import { gerarLinhaDigitavel } from '../lib/boleto';
import type {
  Atividade,
  Categoria,
  ContaBancaria,
  Contato,
  Database,
  FormaPagamento,
  ItemNota,
  Lancamento,
  NotaFiscal,
  Papel,
  Produto as ProdutoCadastro,
  Venda,
  ResumoSefaz,
  TipoCategoria,
  Usuario,
} from './types';

const pad = (n: number) => String(n).padStart(2, '0');

function dvCpf(base9: string): string {
  const calc = (s: string) => {
    let soma = 0;
    for (let i = 0; i < s.length; i++) soma += Number(s[i]) * (s.length + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(base9);
  return `${d1}${calc(base9 + d1)}`;
}

type Produto = [codigo: string, descricao: string, ncm: string, unidade: string, preco: number];

const CATALOGO: Record<string, Produto[]> = {
  ferragens: [
    ['FER-0114', 'Parafuso sextavado 1/4" x 2" zincado (cx 100)', '73181500', 'CX', 4890],
    ['FER-0420', 'Dobradiça 3 1/2" cromada (par)', '83021000', 'PR', 1290],
    ['FER-0870', 'Cadeado latão 40 mm', '83011000', 'UN', 3450],
    ['FER-1033', 'Fechadura externa cromada', '83014000', 'UN', 8990],
  ],
  tintas: [
    ['TP-AC18', 'Tinta acrílica fosca branco neve 18 L', '32091010', 'GL', 28990],
    ['TP-ES36', 'Esmalte sintético brilhante 3,6 L', '32089010', 'GL', 9450],
    ['TP-MAS25', 'Massa corrida PVA 25 kg', '32149000', 'BD', 6780],
    ['TP-SEL18', 'Selador acrílico 18 L', '32091020', 'GL', 15900],
  ],
  eletrica: [
    ['EG-FIO25', 'Fio flexível 2,5 mm² 750 V (rolo 100 m)', '85444900', 'RL', 21900],
    ['EG-DJ32', 'Disjuntor bipolar 32 A curva C', '85362000', 'UN', 4890],
    ['EG-TOM10', 'Tomada 2P+T 10 A branca', '85366910', 'UN', 1190],
    ['EG-LED12', 'Lâmpada LED bulbo 12 W (cx 10)', '85395200', 'CX', 7990],
  ],
  madeira: [
    ['MSA-V612', 'Viga de pinus tratado 6x12 cm 3 m', '44071100', 'PC', 7450],
    ['MSA-MDF15', 'Chapa MDF cru 15 mm 2,75 x 1,85 m', '44111400', 'CH', 18900],
    ['MSA-COMP', 'Compensado naval 18 mm', '44123100', 'CH', 24900],
    ['MSA-RIP', 'Ripa de eucalipto 5 cm 3 m (dz)', '44072990', 'DZ', 8900],
  ],
  cimento: [
    ['CX-CP2', 'Cimento CP II-F 32 saco 50 kg', '25232910', 'SC', 3890],
    ['CX-ARG', 'Argamassa AC-II 20 kg', '32149000', 'SC', 2475],
    ['CX-CAL', 'Cal hidratada CH-III 20 kg', '25222000', 'SC', 1690],
    ['CX-REJ', 'Rejunte flexível 5 kg', '32149000', 'SC', 2190],
  ],
};

/** sha-256 iterado de 'senha' com o sal `demo-<login>-sal` (senhas documentadas no README). */
const HASHES_DEMO: Record<string, string> = {
  admin: 'e65a2dcfc6d01394d9b5ccad4f8e0f4cca9ef3b7f3449fff087a6c7d312deec9',
  reginaldo: 'daeb96682108456cb367b7470d652b1c187e28c340f89c99691df1a935ff29f8',
  'ana.paula': '5bb113a605cbba4d950479db62aef01b67cbad5cf11347996ec0a3df70724ed9',
  marcos: '8d1b3dca9b040f9cee3ca8e93f7cbdd5e3d8454161ff8b9fe9bacdf2b24a7bc7',
  juliana: 'e92e6622fe66adc3258c5aac07768fca1c6bd76e9a22665fcf1f0ceab82fa867',
};

export function criarBaseDemo(ref: ISODate = hoje()): Database {
  const r = aleatorio(20_261_109);
  let seq = 0;
  const id = (prefixo: string) => `${prefixo}_${(++seq).toString(36).padStart(5, '0')}`;
  const momento = (d: ISODate, h = 10, m = 0) => {
    const x = parseISO(d);
    x.setHours(h, m, 0, 0);
    return x.toISOString();
  };
  const cnpjDe = (base12: string) => base12 + calcularDvCnpj(base12);
  const cnpjAleatorio = () => cnpjDe(r.digitos(8) + '0001');
  // 9 meses de histórico gerado (para os parcelamentos já estarem 'em regime'), 2 de projeção
  const inicio = inicioMes(addMeses(ref, -9));

  // ---------- Empresa ----------
  const empresa = {
    razaoSocial: 'Horizonte Materiais de Construção Ltda',
    nomeFantasia: 'Horizonte Materiais',
    cnpj: cnpjDe('458213760001'),
    inscricaoEstadual: '0961234567',
    uf: 'RS',
    municipio: 'Porto Alegre',
    regime: 'simples' as const,
  };

  // ---------- Usuários (senhas de demonstração documentadas no README) ----------
  const usuario = (
    nome: string,
    login: string,
    email: string,
    papel: Papel,
    cargo: string,
    diasCadastro: number,
    horasUltimoAcesso: number | null,
    _senha: string,
    ativo = true,
  ): Usuario => {
    const sal = `demo-${login}-sal`;
    const cadastro = momento(addDias(ref, -diasCadastro), 9, 12 + (seq % 40));
    return {
      id: id('usr'),
      nome,
      login,
      email,
      papel,
      cargo,
      ativo,
      senhaSal: sal,
      // hashes pré-calculados (20.000 iterações) para a demonstração abrir instantânea
      senhaHash: HASHES_DEMO[login] ?? '',
      senhaIteracoes: 20_000,
      criadoEm: cadastro,
      ultimoAcesso:
        horasUltimoAcesso === null ? undefined : new Date(Date.now() - horasUltimoAcesso * 3_600_000).toISOString(),
    };
  };
  const uAdmin = usuario('Administrador', 'admin', 'admin@prumo.app', 'admin', 'Conta técnica do sistema', 240, 30, 'admin123');
  const uReginaldo = usuario(
    'Reginaldo Jeronimo',
    'reginaldo',
    'reginaldo@horizontemateriais.com.br',
    'admin',
    'Diretor administrativo-financeiro',
    238,
    2,
    'reginaldo123',
  );
  const uAna = usuario('Ana Paula Moreira', 'ana.paula', 'ana.paula@horizontemateriais.com.br', 'financeiro', 'Analista financeira', 176, 0.5, 'ana123');
  const uMarcos = usuario('Marcos Teixeira', 'marcos', 'marcos@limaebento.com.br', 'leitura', 'Contador · Lima & Bento', 52, 70, 'marcos123');
  const uJuliana = usuario(
    'Juliana Castro',
    'juliana',
    'juliana@horizontemateriais.com.br',
    'financeiro',
    'Assistente administrativa',
    201,
    24 * 41,
    'juliana123',
    false,
  );
  uMarcos.criadoPor = uReginaldo.id;
  uAna.criadoPor = uReginaldo.id;
  uJuliana.criadoPor = uReginaldo.id;
  const usuarios = [uAdmin, uReginaldo, uAna, uMarcos, uJuliana];

  // ---------- Categorias ----------
  const categorias: Categoria[] = [];
  const cat = (nome: string, tipo: TipoCategoria) => {
    const c = { id: id('cat'), nome, tipo };
    categorias.push(c);
    return c.id;
  };
  const C = {
    vendas: cat('Venda de mercadorias', 'receita'),
    servicos: cat('Prestação de serviços', 'receita'),
    rendimentos: cat('Rendimentos financeiros', 'receita'),
    outrasReceitas: cat('Outras receitas', 'receita'),
    mercadorias: cat('Compra de mercadorias', 'despesa'),
    folha: cat('Folha de pagamento', 'despesa'),
    prolabore: cat('Pró-labore', 'despesa'),
    impostos: cat('Impostos (DAS)', 'despesa'),
    encargos: cat('Encargos (FGTS)', 'despesa'),
    aluguel: cat('Aluguel e condomínio', 'despesa'),
    utilidades: cat('Energia, água e telefone', 'despesa'),
    frete: cat('Frete e logística', 'despesa'),
    combustivel: cat('Combustível e frota', 'despesa'),
    contabilidade: cat('Serviços contábeis', 'despesa'),
    software: cat('Software e assinaturas', 'despesa'),
    manutencao: cat('Manutenção', 'despesa'),
    marketing: cat('Marketing', 'despesa'),
    tarifas: cat('Tarifas bancárias', 'despesa'),
    administrativas: cat('Despesas administrativas', 'despesa'),
  };

  // ---------- Contas bancárias ----------
  const contas: ContaBancaria[] = [
    { id: id('cta'), nome: 'Banrisul PJ', bancoCodigo: '041', agencia: '0835', numero: '06.123456.0-7', tipo: 'corrente', saldoInicial: 6_884_000, saldoInicialEm: inicio, ativa: true },
    { id: id('cta'), nome: 'Sicredi', bancoCodigo: '748', agencia: '0116', numero: '45231-8', tipo: 'corrente', saldoInicial: 5_962_000, saldoInicialEm: inicio, ativa: true },
    { id: id('cta'), nome: 'Caixa da loja', tipo: 'caixa', saldoInicial: 150_000, saldoInicialEm: inicio, ativa: true },
  ];
  const [banrisul, sicredi, caixaLoja] = contas;

  // ---------- Contatos ----------
  const contatos: Contato[] = [];
  const contato = (
    tipo: Contato['tipo'],
    nome: string,
    fantasia: string,
    cidade: string,
    uf: string,
    dominio: string,
    documento = cnpjAleatorio(),
    diasCadastro = r.inteiro(120, 230),
  ): Contato => {
    const c: Contato = {
      id: id('ctt'),
      tipo,
      nome,
      fantasia: fantasia || undefined,
      documento,
      email: dominio ? (dominio.includes('@') ? dominio : `financeiro@${dominio}`) : undefined,
      telefone: `(51) 3${r.digitos(3)}-${r.digitos(4)}`,
      cidade,
      uf,
      criadoEm: momento(addDias(ref, -diasCadastro), 14, 5),
    };
    contatos.push(c);
    return c;
  };

  const F = {
    ferragens: contato('fornecedor', 'Ferragens Vale do Sinos Ltda', 'Vale do Sinos Ferragens', 'Novo Hamburgo', 'RS', 'valedosinosferragens.com.br'),
    tintas: contato('fornecedor', 'Tintas Pampa Indústria e Comércio Ltda', 'Tintas Pampa', 'Gravataí', 'RS', 'tintaspampa.com.br'),
    eletrica: contato('fornecedor', 'Elétrica Guaíba Distribuidora Ltda', 'Elétrica Guaíba', 'Guaíba', 'RS', 'eletricaguaiba.com.br'),
    madeira: contato('fornecedor', 'Madeireira Serra Alta Ltda', 'Serra Alta', 'Caxias do Sul', 'RS', 'serraalta.ind.br'),
    cimento: contato('fornecedor', 'Cimentos Coxilha Comércio Ltda', 'Coxilha', 'Canoas', 'RS', 'coxilha.com.br'),
    frete: contato('fornecedor', 'Transportes Rota Sul Ltda', 'Rota Sul', 'Canoas', 'RS', 'rotasul.com.br'),
    imobiliaria: contato('fornecedor', 'Moinhos Administração de Imóveis Ltda', 'Moinhos Imóveis', 'Porto Alegre', 'RS', 'moinhosimoveis.com.br'),
    energia: contato('fornecedor', 'Força Sul Distribuidora de Energia S.A.', 'Força Sul Energia', 'Porto Alegre', 'RS', ''),
    agua: contato('fornecedor', 'Águas do Delta Saneamento S.A.', 'Águas do Delta', 'Porto Alegre', 'RS', ''),
    internet: contato('fornecedor', 'Conecta Fibra Telecomunicações Ltda', 'Conecta Fibra', 'Porto Alegre', 'RS', 'conectafibra.net.br'),
    contabil: contato('fornecedor', 'Lima & Bento Contabilidade S/S', 'Lima & Bento', 'Porto Alegre', 'RS', 'limaebento.com.br'),
    posto: contato('fornecedor', 'Posto Avenida Combustíveis Ltda', 'Posto Avenida', 'Porto Alegre', 'RS', ''),
    // CNPJ alfanumérico (emitido a partir de jul/2026), mostra que o sistema já suporta o novo formato
    software: contato('fornecedor', 'NuvemSoft Sistemas Ltda', 'NuvemSoft', 'Florianópolis', 'SC', 'nuvemsoft.app', cnpjDe('R7K2M9QX0001'), 95),
    receita: contato('fornecedor', 'Receita Federal do Brasil', 'DAS · Simples Nacional', 'Brasília', 'DF', '', ''),
  };
  F.receita.telefone = undefined;

  const cpf = () => {
    const b = r.digitos(9);
    return b + dvCpf(b);
  };
  const clientesPJ = [
    contato('cliente', 'Construtora Laje Forte Ltda', 'Laje Forte', 'Porto Alegre', 'RS', 'lajeforte.com.br'),
    contato('cliente', 'Mercado Bom Fim Ltda', 'Mercado Bom Fim', 'Porto Alegre', 'RS', 'mercadobomfim.com.br'),
    contato('cliente', 'Reformas Cidade Baixa Ltda', 'Cidade Baixa Reformas', 'Porto Alegre', 'RS', 'cidadebaixareformas.com.br'),
    contato('cliente', 'Condomínio Edifício Ipê Amarelo', '', 'Porto Alegre', 'RS', 'sindico.ipeamarelo@gmail.com'),
    contato('cliente', 'Traço Livre Arquitetura Ltda', 'Traço Livre', 'Porto Alegre', 'RS', 'tracolivre.arq.br'),
    contato('cliente', 'Hotel Orla do Guaíba Ltda', 'Hotel Orla', 'Porto Alegre', 'RS', 'hotelorla.com.br'),
    contato('cliente', 'Colégio Santa Clara Ltda', 'Colégio Santa Clara', 'Canoas', 'RS', 'santaclara.edu.br'),
    contato('cliente', 'Construtora Alicerce Gaúcho Ltda', 'Alicerce', 'Gravataí', 'RS', 'alicercegaucho.com.br'),
    contato('cliente', 'Clínica Vida Plena Ltda', 'Vida Plena', 'Novo Hamburgo', 'RS', 'vidaplena.med.br'),
  ];
  const clientesPF = [
    contato('cliente', 'João Carlos Ferreira', '', 'Viamão', 'RS', 'joaocarlos.ferreira@gmail.com', cpf()),
    contato('cliente', 'Marina Duarte Souza', '', 'Porto Alegre', 'RS', 'marina.duarte@hotmail.com', cpf()),
  ];
  // Um contato que é cliente E fornecedor (comum no varejo de construção)
  const ambos = contato('ambos', 'Pedreira São Jorge Ltda', 'Pedreira São Jorge', 'Sapucaia do Sul', 'RS', 'pedreirasaojorge.com.br');

  // ---------- Produtos e serviços (preço de venda = custo do catálogo + 42%) ----------
  const produtos: ProdutoCadastro[] = [];
  for (const grupo of Object.values(CATALOGO)) {
    for (const [codigo, descricao, ncm, unidade, preco] of grupo) {
      produtos.push({ id: id('prd'), tipo: 'produto', codigo, nome: descricao, unidade, preco: Math.round(preco * 1.42), ncm, ativo: true, criadoEm: momento(addDias(ref, -220), 10, 0) });
    }
  }
  const servico = (codigo: string, nome: string, unidade: string, preco: number, codigoServico: string) => {
    const p: ProdutoCadastro = { id: id('prd'), tipo: 'servico', codigo, nome, unidade, preco, codigoServico, ativo: true, criadoEm: momento(addDias(ref, -200), 10, 0) };
    produtos.push(p);
    return p;
  };
  const srvEntrega = servico('SRV-ENT', 'Entrega na obra (até 30 km)', 'SV', 9_000, '16.02');
  const srvMontagem = servico('SRV-MON', 'Montagem e instalação de divisórias', 'H', 12_000, '7.02');
  servico('SRV-COR', 'Corte de madeira sob medida', 'SV', 2_500, '14.05');
  const produtoPorCodigo = new Map(produtos.map((p) => [p.codigo, p]));
  const vendas: Venda[] = [];
  let numeroVenda = 1040;

  // ---------- Lançamentos ----------
  const lancamentos: Lancamento[] = [];
  const notas: NotaFiscal[] = [];
  const quemBaixa = () => (r.chance(0.78) ? uAna.id : uReginaldo.id);

  // Distribui os títulos entre os dois bancos mantendo os saldos equilibrados (como um financeiro faria)
  const fluxoConta = new Map<string, number>([[banrisul.id, banrisul.saldoInicial], [sicredi.id, sicredi.saldoInicial]]);
  const contaPara = (tipo: Lancamento['tipo'], valor: number, explicita?: ContaBancaria) => {
    const sa = fluxoConta.get(banrisul.id) ?? 0;
    const sb = fluxoConta.get(sicredi.id) ?? 0;
    const conta = explicita ?? (tipo === 'receber' ? (sa <= sb ? banrisul : sicredi) : sa >= sb ? banrisul : sicredi);
    if (fluxoConta.has(conta.id)) fluxoConta.set(conta.id, (fluxoConta.get(conta.id) ?? 0) + (tipo === 'receber' ? valor : -valor));
    return conta;
  };

  const lanc = (p: {
    tipo: Lancamento['tipo'];
    descricao: string;
    contato?: Contato;
    categoriaId: string;
    valor: number;
    vencimento: ISODate;
    emissao?: ISODate;
    competencia?: string;
    documento?: string;
    forma?: FormaPagamento;
    conta?: ContaBancaria;
    parcela?: { n: number; de: number };
    grupoId?: string;
    notaId?: string;
    linhaDigitavel?: string;
  }): Lancamento => {
    const emissao = p.emissao ?? addDias(p.vencimento, -r.inteiro(5, 15));
    const l: Lancamento = {
      id: id('lan'),
      tipo: p.tipo,
      descricao: p.descricao,
      contatoId: p.contato?.id,
      categoriaId: p.categoriaId,
      contaId: contaPara(p.tipo, p.valor, p.conta).id,
      valor: p.valor,
      emissao,
      vencimento: p.vencimento,
      competencia: p.competencia ?? mesChave(p.vencimento),
      documento: p.documento,
      parcela: p.parcela,
      grupoId: p.grupoId,
      forma: p.forma,
      notaId: p.notaId,
      linhaDigitavel: p.linhaDigitavel,
      criadoEm: momento(emissao <= ref ? emissao : ref, 9 + r.inteiro(0, 7), r.inteiro(0, 59)),
      criadoPor: r.chance(0.8) ? uAna.id : uReginaldo.id,
    };
    lancamentos.push(l);
    return l;
  };

  const sequencial: Record<string, number> = {};
  const proximoNumero = (doc: string) => {
    sequencial[doc] = (sequencial[doc] ?? 1000 + r.inteiro(100, 8000)) + r.inteiro(1, 40);
    return sequencial[doc];
  };

  const criarNota = (p: {
    direcao: 'entrada' | 'saida';
    emitente: { documento: string; nome: string; fantasia?: string; uf?: string; municipio?: string };
    destinatario: { documento: string; nome: string; uf?: string; municipio?: string };
    emissao: ISODate;
    itens: ItemNota[];
    frete?: number;
    duplicatas: { vencimento: ISODate; valor: number }[];
    tributosCheios: boolean;
    contato: Contato;
    origem?: NotaFiscal['origem'];
  }): NotaFiscal => {
    const numero = proximoNumero(p.emitente.documento);
    const ufCodigo = p.emitente.uf === 'SC' ? '42' : '43';
    const chave = montarChave({
      ufCodigo,
      anoMes: mesChave(p.emissao),
      cnpj: p.emitente.documento,
      serie: 1,
      numero,
      codigoNumerico: r.digitos(8),
    });
    const produtos = p.itens.reduce((a, i) => a + i.valorTotal, 0);
    const frete = p.frete ?? 0;
    const nota: NotaFiscal = {
      id: id('nfe'),
      chave,
      modelo: '55',
      serie: '1',
      numero: String(numero),
      direcao: p.direcao,
      naturezaOperacao: 'Venda de mercadoria adquirida de terceiros',
      emissao: `${p.emissao}T${pad(r.inteiro(8, 17))}:${pad(r.inteiro(0, 59))}:00-03:00`,
      emitente: p.emitente,
      destinatario: p.destinatario,
      itens: p.itens,
      totais: {
        produtos,
        frete,
        desconto: 0,
        ipi: 0,
        icms: p.tributosCheios ? Math.round(produtos * 0.17) : 0,
        st: 0,
        pis: p.tributosCheios ? Math.round(produtos * 0.0165) : 0,
        cofins: p.tributosCheios ? Math.round(produtos * 0.076) : 0,
        outros: 0,
        nota: produtos + frete,
      },
      duplicatas: p.duplicatas.map((d, i) => ({ numero: String(i + 1).padStart(3, '0'), vencimento: d.vencimento, valor: d.valor })),
      situacao: 'autorizada',
      protocolo: `143${r.digitos(12)}`,
      origem: p.origem ?? 'xml',
      contatoId: p.contato.id,
      importadaEm: momento(p.emissao <= ref ? p.emissao : ref, 11, r.inteiro(0, 59)),
      importadaPor: r.chance(0.7) ? uAna.id : uReginaldo.id,
    };
    notas.push(nota);
    return nota;
  };

  const montarItens = (produtos: Produto[], alvo: number, margem = 1): ItemNota[] => {
    const escolhidos = r.embaralhar(produtos).slice(0, r.inteiro(2, Math.min(4, produtos.length)));
    const pesos = escolhidos.map(() => 0.5 + r.proximo());
    const somaPesos = pesos.reduce((a, b) => a + b, 0);
    return escolhidos.map(([codigo, descricao, ncm, unidade, preco], i) => {
      const valorUnitario = Math.round(preco * margem);
      const quantidade = Math.max(1, Math.round((alvo * (pesos[i] / somaPesos)) / valorUnitario));
      return { codigo, descricao, ncm, cfop: '5102', unidade, quantidade, valorUnitario, valorTotal: quantidade * valorUnitario };
    });
  };

  const dividir = (total: number, partes: number) => {
    const base = Math.floor(total / partes);
    return Array.from({ length: partes }, (_, i) => (i === partes - 1 ? total - base * (partes - 1) : base));
  };

  const bancoFornecedor: Record<string, string> = { ferragens: '237', tintas: '341', eletrica: '001', madeira: '748', cimento: '041' };
  const meses = Array.from({ length: 12 }, (_, i) => addMesesChave(mesChave(ref), i - 9));
  const mesAnterior = (mk: string) => mesCurto(addMesesChave(mk, -1));

  for (const mk of meses) {
    const nomeMes = mesCurto(mk);
    const util = (dia: number) => proximoDiaUtil(diaDoMes(mk, dia));

    // ---- Despesas recorrentes ----
    lanc({ tipo: 'pagar', descricao: `Aluguel da loja · ${nomeMes}`, contato: F.imobiliaria, categoriaId: C.aluguel, valor: 680_000, vencimento: util(10), forma: 'boleto', documento: `Boleto ${mk.replace('-', '/')}`, linhaDigitavel: gerarLinhaDigitavel('041', util(10), 680_000, r.digitos(25)) });
    lanc({ tipo: 'pagar', descricao: `Folha de pagamento · ${mesAnterior(mk)}`, categoriaId: C.folha, valor: r.varia(3_145_000, 0.025), vencimento: nDiaUtil(mk, 5), forma: 'transferencia', competencia: addMesesChave(mk, -1) });
    lanc({ tipo: 'pagar', descricao: `Pró-labore · ${mesAnterior(mk)}`, categoriaId: C.prolabore, valor: 900_000, vencimento: nDiaUtil(mk, 5), forma: 'transferencia', competencia: addMesesChave(mk, -1) });
    lanc({ tipo: 'pagar', descricao: `DAS Simples Nacional · competência ${mesAnterior(mk)}`, contato: F.receita, categoriaId: C.impostos, valor: r.varia(1_090_000, 0.07), vencimento: util(20), forma: 'boleto', competencia: addMesesChave(mk, -1) });
    lanc({ tipo: 'pagar', descricao: `FGTS · competência ${mesAnterior(mk)}`, categoriaId: C.encargos, valor: r.varia(251_600, 0.02), vencimento: util(20), forma: 'boleto', competencia: addMesesChave(mk, -1) });
    lanc({ tipo: 'pagar', descricao: `Energia elétrica · ${nomeMes}`, contato: F.energia, categoriaId: C.utilidades, valor: r.varia(118_000, 0.16), vencimento: util(15), forma: 'boleto' });
    lanc({ tipo: 'pagar', descricao: `Água e esgoto · ${nomeMes}`, contato: F.agua, categoriaId: C.utilidades, valor: r.varia(26_000, 0.12), vencimento: util(18), forma: 'boleto' });
    lanc({ tipo: 'pagar', descricao: 'Internet fibra 600 Mb + telefonia', contato: F.internet, categoriaId: C.utilidades, valor: 48_990, vencimento: util(12), forma: 'boleto' });
    lanc({ tipo: 'pagar', descricao: `Honorários contábeis · ${nomeMes}`, contato: F.contabil, categoriaId: C.contabilidade, valor: 165_000, vencimento: util(7), forma: 'pix' });
    lanc({ tipo: 'pagar', descricao: 'Assinatura do sistema de PDV', contato: F.software, categoriaId: C.software, valor: 34_900, vencimento: diaDoMes(mk, 1), forma: 'cartao' });
    lanc({ tipo: 'pagar', descricao: 'Tarifa do pacote de serviços PJ', categoriaId: C.tarifas, valor: 8_990, vencimento: diaDoMes(mk, 1), forma: 'debito', conta: banrisul });
    for (const dia of [8, 22]) {
      lanc({ tipo: 'pagar', descricao: 'Abastecimento da caminhonete de entregas', contato: F.posto, categoriaId: C.combustivel, valor: r.varia(42_000, 0.25), vencimento: util(dia), forma: 'cartao' });
    }
    for (let k = 0, n = r.inteiro(2, 3); k < n; k++) {
      const venc = util(r.inteiro(4, 27));
      lanc({ tipo: 'pagar', descricao: `Frete de entregas · CT-e ${r.inteiro(12000, 19999)}`, contato: F.frete, categoriaId: C.frete, valor: r.varia(95_000, 0.45), vencimento: venc, forma: 'boleto' });
    }
    if (r.chance(0.5)) {
      lanc({ tipo: 'pagar', descricao: r.escolher(['Manutenção da empilhadeira', 'Revisão da caminhonete', 'Conserto do portão da loja', 'Troca de lâmpadas do depósito']), categoriaId: C.manutencao, valor: r.varia(110_000, 0.5), vencimento: util(r.inteiro(5, 26)), forma: 'pix' });
    }
    if (r.chance(0.4)) {
      lanc({ tipo: 'pagar', descricao: r.escolher(['Impulsionamento nas redes sociais', 'Panfletos e banner da fachada', 'Anúncio na rádio local']), categoriaId: C.marketing, valor: r.varia(70_000, 0.3), vencimento: util(r.inteiro(5, 26)), forma: 'pix' });
    }

    // ---- Compras de mercadoria com NF-e de entrada (só até hoje) ----
    const fornecedoresMes = r.embaralhar(['ferragens', 'tintas', 'eletrica', 'madeira', 'cimento'] as const).slice(0, r.inteiro(2, 3));
    for (const chaveF of fornecedoresMes) {
      const emissao = proximoDiaUtil(diaDoMes(mk, r.inteiro(2, 24)));
      if (emissao > ref) continue;
      const f = F[chaveF];
      const itens = montarItens(CATALOGO[chaveF], r.inteiro(800_000, 2_000_000));
      const frete = r.chance(0.4) ? r.varia(25_000, 0.4) : 0;
      const total = itens.reduce((a, i) => a + i.valorTotal, 0) + frete;
      const prazos = r.escolher([[28, 56], [30, 60, 90], [28, 56, 84], [21, 42]]);
      const valores = dividir(total, prazos.length);
      const duplicatas = prazos.map((d, i) => ({ vencimento: proximoDiaUtil(addDias(emissao, d)), valor: valores[i] }));
      const nota = criarNota({
        direcao: 'entrada',
        emitente: { documento: f.documento, nome: f.nome, fantasia: f.fantasia, uf: f.uf, municipio: f.cidade },
        destinatario: { documento: empresa.cnpj, nome: empresa.razaoSocial, uf: empresa.uf, municipio: empresa.municipio },
        emissao,
        itens,
        frete,
        duplicatas,
        tributosCheios: chaveF !== 'madeira',
        contato: f,
      });
      const grupo = id('grp');
      duplicatas.forEach((d, i) =>
        lanc({
          tipo: 'pagar',
          descricao: `Mercadorias · NF ${nota.numero} (${f.fantasia ?? f.nome})`,
          contato: f,
          categoriaId: C.mercadorias,
          valor: d.valor,
          vencimento: d.vencimento,
          emissao,
          competencia: mesChave(emissao),
          documento: `NF ${nota.numero} · ${i + 1}/${duplicatas.length}`,
          parcela: { n: i + 1, de: duplicatas.length },
          grupoId: grupo,
          forma: 'boleto',
          notaId: nota.id,
          linhaDigitavel: gerarLinhaDigitavel(bancoFornecedor[chaveF], d.vencimento, d.valor, r.digitos(25)),
        }),
      );
    }

    // ---- Vendas no balcão (fechamento semanal de PIX/cartão/dinheiro) ----
    let sexta = diaDoMes(mk, 1);
    while (diaSemana(sexta) !== 5) sexta = addDias(sexta, 1);
    for (; mesChave(sexta) === mk; sexta = addDias(sexta, 7)) {
      const inicioSemana = addDias(sexta, -4);
      lanc({ tipo: 'receber', descricao: `Vendas no balcão · semana de ${dataBR(inicioSemana).slice(0, 5)}`, categoriaId: C.vendas, valor: r.varia(1_080_000, 0.22), vencimento: sexta, emissao: inicioSemana, forma: 'pix', documento: 'Fechamento de caixa' });
      lanc({ tipo: 'receber', descricao: `Vendas em dinheiro · semana de ${dataBR(inicioSemana).slice(0, 5)}`, categoriaId: C.vendas, valor: r.varia(62_000, 0.3), vencimento: sexta, emissao: inicioSemana, forma: 'dinheiro', conta: caixaLoja, documento: 'Fechamento de caixa' });
      lanc({ tipo: 'pagar', descricao: 'Compras miúdas (copa, limpeza e escritório)', categoriaId: C.administrativas, valor: r.varia(38_000, 0.35), vencimento: addDias(sexta, -1), forma: 'dinheiro', conta: caixaLoja });
    }

    // ---- Vendas a prazo para empresas, com NF-e de saída ----
    for (let k = 0, n = r.inteiro(5, 7); k < n; k++) {
      const emissao = proximoDiaUtil(diaDoMes(mk, r.inteiro(1, 26)));
      if (emissao > ref) continue;
      const cliente = r.chance(0.12) ? r.escolher(clientesPF) : r.chance(0.08) ? ambos : r.escolher(clientesPJ);
      const pf = cliente.documento.length === 11;
      const linha = r.escolher(['cimento', 'tintas', 'eletrica', 'madeira', 'ferragens'] as const);
      const itens = montarItens(CATALOGO[linha], pf ? r.inteiro(150_000, 420_000) : r.inteiro(380_000, 1_900_000), 1.42);
      const total = itens.reduce((a, i) => a + i.valorTotal, 0);
      const prazos = pf ? r.escolher([[30], [30, 60]]) : r.escolher([[28], [30, 60], [28, 56], [30, 60, 90]]);
      const valores = dividir(total, prazos.length);
      const duplicatas = prazos.map((d, i) => ({ vencimento: proximoDiaUtil(addDias(emissao, d)), valor: valores[i] }));
      const nota = criarNota({
        direcao: 'saida',
        emitente: { documento: empresa.cnpj, nome: empresa.razaoSocial, fantasia: empresa.nomeFantasia, uf: empresa.uf, municipio: empresa.municipio },
        destinatario: { documento: cliente.documento, nome: cliente.nome, uf: cliente.uf, municipio: cliente.cidade },
        emissao,
        itens,
        duplicatas,
        tributosCheios: false,
        contato: cliente,
      });
      // a venda (orçamento → pedido → nota) que originou esta nota
      nota.origem = 'emitida';
      const venda: Venda = {
        id: id('vnd'),
        numero: ++numeroVenda,
        etapa: 'faturada',
        contatoId: cliente.id,
        itens: itens.map((it) => ({
          produtoId: produtoPorCodigo.get(it.codigo)?.id ?? '',
          codigo: it.codigo,
          descricao: it.descricao,
          unidade: it.unidade ?? 'UN',
          quantidade: it.quantidade,
          precoUnitario: it.valorUnitario,
          total: it.valorTotal,
        })),
        desconto: 0,
        frete: 0,
        condicao: { forma: 'boleto', parcelas: prazos.length, primeiroEm: prazos[0], intervalo: prazos.length > 1 ? prazos[1] - prazos[0] : 30 },
        validade: addDias(emissao, 7),
        criadoEm: momento(addDias(emissao, -3), 10, 15),
        criadoPor: uAna.id,
        aprovadoEm: momento(addDias(emissao, -1), 15, 40),
        pedidoNumero: numeroVenda,
        faturadoEm: momento(emissao, 11, 5),
        notaId: nota.id,
      };
      nota.vendaId = venda.id;
      vendas.push(venda);
      const grupo = id('grp');
      duplicatas.forEach((d, i) =>
        lanc({
          tipo: 'receber',
          descricao: `Venda · NF ${nota.numero} (${cliente.fantasia ?? cliente.nome})`,
          contato: cliente,
          categoriaId: C.vendas,
          valor: d.valor,
          vencimento: d.vencimento,
          emissao,
          competencia: mesChave(emissao),
          documento: `NF ${nota.numero} · ${i + 1}/${duplicatas.length}`,
          parcela: { n: i + 1, de: duplicatas.length },
          grupoId: grupo,
          forma: 'boleto',
          notaId: nota.id,
        }),
      );
    }

    // ---- Rendimento da aplicação automática ----
    lanc({ tipo: 'receber', descricao: 'Rendimento da aplicação automática', categoriaId: C.rendimentos, valor: r.varia(26_000, 0.25), vencimento: diaDoMes(mk, 31), forma: 'transferencia', conta: banrisul });
  }

  // ---------- Baixas: o passado está quitado, com algumas exceções realistas ----------
  const emAberto = new Set<string>();
  // Contas a pagar esquecidas (sempre as mesmas, para o painel ter o que mostrar)
  emAberto.add(lanc({ tipo: 'pagar', descricao: 'Frete de entregas · CT-e 18452', contato: F.frete, categoriaId: C.frete, valor: 128_460, vencimento: addDias(ref, -4), forma: 'boleto', conta: sicredi }).id);
  emAberto.add(lanc({ tipo: 'pagar', descricao: 'Manutenção da empilhadeira', categoriaId: C.manutencao, valor: 185_000, vencimento: addDias(ref, -9), forma: 'pix', conta: banrisul }).id);
  // Clientes atrasados: boletos vencidos de clientes diferentes
  const atrasados = new Set<string>();
  lancamentos
    .filter((l) => l.tipo === 'receber' && l.forma === 'boleto' && l.vencimento < addDias(ref, -1) && l.vencimento >= addDias(ref, -30))
    .forEach((l) => {
      if (atrasados.size < 3 && l.contatoId && !atrasados.has(l.contatoId)) {
        atrasados.add(l.contatoId);
        emAberto.add(l.id);
      }
    });
  // Recebimento que vence hoje (serviço avulso)
  lanc({ tipo: 'receber', descricao: 'Entrega e montagem de divisórias · Hotel Orla', contato: clientesPJ[5], categoriaId: C.servicos, valor: 145_000, vencimento: ref, emissao: addDias(ref, -12), forma: 'pix', conta: banrisul, documento: 'Recibo 0912' });

  for (const l of lancamentos) {
    if (emAberto.has(l.id)) continue;
    const automatico = l.forma === 'cartao' || l.forma === 'debito';
    if (l.vencimento > ref || (l.vencimento === ref && !automatico)) continue;
    let data = l.vencimento;
    let juros = 0;
    if (l.tipo === 'receber' && l.forma === 'boleto') {
      const atraso = r.chance(0.3) ? r.inteiro(1, 6) : 0;
      if (addDias(l.vencimento, atraso) < ref && atraso > 0) {
        data = addDias(l.vencimento, atraso);
        juros = Math.round(l.valor * 0.02 + l.valor * 0.00033 * atraso);
      }
    } else if (l.tipo === 'pagar' && l.forma === 'boleto' && r.chance(0.2)) {
      data = addDias(l.vencimento, -1);
    }
    l.baixa = {
      data,
      valorPago: l.valor + juros,
      juros,
      desconto: 0,
      contaId: l.contaId ?? banrisul.id,
      usuarioId: quemBaixa(),
      registradaEm: momento(data, 9 + r.inteiro(0, 8), r.inteiro(0, 59)),
    };
  }

  // Uma venda cancelada (NF cancelada => títulos cancelados)
  const vendaCancelar = notas.filter((n) => n.direcao === 'saida' && n.emissao.slice(0, 10) > addDias(ref, -40) && n.emissao.slice(0, 10) < addDias(ref, -10))[0];
  if (vendaCancelar) {
    vendaCancelar.situacao = 'cancelada';
    lancamentos.filter((l) => l.notaId === vendaCancelar.id).forEach((l) => {
      l.cancelado = true;
      l.baixa = undefined;
      l.observacoes = 'Venda cancelada pelo cliente. NF-e cancelada na SEFAZ.';
    });
  }

  // Uma NF de entrada importada ontem que ainda NÃO virou contas a pagar (mostra o fluxo "gerar contas")
  const ontem = addDias(ref, -1);
  const itensPendente = montarItens(CATALOGO.eletrica, 640_000);
  const totalPendente = itensPendente.reduce((a, i) => a + i.valorTotal, 0);
  const [p1, p2] = dividir(totalPendente, 2);
  criarNota({
    direcao: 'entrada',
    emitente: { documento: F.eletrica.documento, nome: F.eletrica.nome, fantasia: F.eletrica.fantasia, uf: 'RS', municipio: F.eletrica.cidade },
    destinatario: { documento: empresa.cnpj, nome: empresa.razaoSocial, uf: empresa.uf, municipio: empresa.municipio },
    emissao: ontem,
    itens: itensPendente,
    duplicatas: [
      { vencimento: proximoDiaUtil(addDias(ontem, 28)), valor: p1 },
      { vencimento: proximoDiaUtil(addDias(ontem, 56)), valor: p2 },
    ],
    tributosCheios: true,
    contato: F.eletrica,
    origem: 'sefaz',
  });

  // ---------- Vendas em andamento: dois orçamentos e um pedido esperando a nota ----------
  const itemDe = (codigo: string, quantidade: number) => {
    const p = produtoPorCodigo.get(codigo)!;
    return { produtoId: p.id, codigo: p.codigo, descricao: p.nome, unidade: p.unidade, quantidade, precoUnitario: p.preco, total: p.preco * quantidade };
  };
  vendas.push({
    id: id('vnd'),
    numero: ++numeroVenda,
    etapa: 'orcamento',
    contatoId: clientesPJ[0].id,
    itens: [itemDe('CX-CP2', 200), itemDe('CX-ARG', 120), itemDe('CX-CAL', 60), itemDe(srvEntrega.codigo, 2)],
    desconto: 25_000,
    frete: 0,
    condicao: { forma: 'boleto', parcelas: 3, primeiroEm: 30, intervalo: 30 },
    validade: addDias(ref, 6),
    observacoes: 'Entrega em duas viagens na obra da Rua Dona Laura.',
    criadoEm: momento(addDias(ref, -1), 9, 20),
    criadoPor: uAna.id,
  });
  vendas.push({
    id: id('vnd'),
    numero: ++numeroVenda,
    etapa: 'orcamento',
    contatoId: clientesPJ[4].id,
    itens: [itemDe('TP-AC18', 14), itemDe('TP-SEL18', 6), itemDe('TP-MAS25', 10)],
    desconto: 0,
    frete: 0,
    condicao: { forma: 'pix', parcelas: 1, primeiroEm: 0, intervalo: 30 },
    validade: addDias(ref, 9),
    criadoEm: momento(ref, 8, 45),
    criadoPor: uReginaldo.id,
  });
  vendas.push({
    id: id('vnd'),
    numero: ++numeroVenda,
    etapa: 'pedido',
    contatoId: clientesPJ[5].id,
    itens: [itemDe('EG-FIO25', 8), itemDe('EG-DJ32', 12), itemDe('EG-LED12', 6), itemDe(srvMontagem.codigo, 16)],
    desconto: 0,
    frete: 0,
    condicao: { forma: 'boleto', parcelas: 2, primeiroEm: 28, intervalo: 28 },
    validade: addDias(ref, 4),
    criadoEm: momento(addDias(ref, -4), 14, 10),
    criadoPor: uAna.id,
    aprovadoEm: momento(addDias(ref, -1), 17, 2),
    pedidoNumero: numeroVenda,
  });

  // ---------- Caixa de entrada SEFAZ (simulada) ----------
  const resumo = (f: Contato, diasAtras: number, valor: number): ResumoSefaz => {
    const emissao = addDias(ref, -diasAtras);
    return {
      id: id('sfz'),
      chave: montarChave({ ufCodigo: '43', anoMes: mesChave(emissao), cnpj: f.documento, serie: 1, numero: proximoNumero(f.documento), codigoNumerico: r.digitos(8) }),
      emitenteDocumento: f.documento,
      emitenteNome: f.nome,
      emissao: `${emissao}T${pad(r.inteiro(8, 17))}:${pad(r.inteiro(0, 59))}:00-03:00`,
      valor,
      situacao: 'autorizada',
      manifestacao: 'pendente',
      recebidoEm: momento(ref, 7, 30),
      demo: true,
    };
  };
  const sefaz: ResumoSefaz[] = [resumo(F.tintas, 0, 734_000), resumo(F.madeira, 1, 1_298_050), resumo(F.cimento, 2, 411_520)];

  // ---------- Atividade recente ----------
  const nomeCurto = (u: Usuario) => u.nome.split(' ')[0];
  const recentes = lancamentos
    .filter((l) => l.baixa && l.baixa.data >= addDias(ref, -4))
    .sort((a, b) => (b.baixa!.registradaEm > a.baixa!.registradaEm ? 1 : -1))
    .slice(0, 9);
  const atividades: Atividade[] = recentes.map((l) => {
    const u = usuarios.find((x) => x.id === l.baixa!.usuarioId) ?? uAna;
    return {
      id: id('atv'),
      em: l.baixa!.registradaEm,
      usuarioId: u.id,
      tipo: 'baixa',
      texto: `${nomeCurto(u)} ${l.tipo === 'pagar' ? 'pagou' : 'recebeu'} “${l.descricao}”`,
      ref: { tipo: 'lancamento', id: l.id },
    };
  });
  const notaPendente = notas[notas.length - 1];
  atividades.push({
    id: id('atv'),
    em: momento(ontem, 16, 48),
    usuarioId: uAna.id,
    tipo: 'importacao',
    texto: `Ana importou a NF ${notaPendente.numero} da ${F.eletrica.fantasia}`,
    ref: { tipo: 'nota', id: notaPendente.id },
  });
  atividades.push({
    id: id('atv'),
    em: uMarcos.criadoEm,
    usuarioId: uReginaldo.id,
    tipo: 'usuario',
    texto: 'Reginaldo cadastrou Marcos Teixeira (contador) com acesso de consulta',
    ref: { tipo: 'usuario', id: uMarcos.id },
  });
  atividades.sort((a, b) => (b.em > a.em ? 1 : -1));

  return {
    versao: 2,
    criadoEm: new Date().toISOString(),
    demo: true,
    empresa,
    usuarios,
    contatos,
    categorias,
    contas,
    lancamentos,
    notas,
    sefaz,
    atividades,
    configSefaz: { ambiente: 'homologacao', uf: 'RS' },
    produtos,
    vendas,
  };
}
