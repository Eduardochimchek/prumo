// Módulos do Prumo e o que cada login enxerga.
// O Administrador vê todos os módulos e troca entre eles com um clique. Quem é da Equipe ou de
// Consulta vê só os módulos marcados no cadastro (Usuários e acessos): o vendedor entra e só
// aparece o Comercial; o financeiro entra e só aparece o Financeiro.
// Funções puras: a mesma regra serve para o menu, para a guarda das rotas e para a busca.

import type { Modulo, Papel, Usuario } from '../data/types';

export type { Modulo };

export type Permissao =
  | 'vender' // orçamento, aprovação do cliente, produtos
  | 'faturar' // emitir a nota de um pedido
  | 'importar' // importar XML de nota e manifestar na SEFAZ
  | 'lancar' // lançar e editar contas a pagar e a receber
  | 'baixar' // registrar pagamento e recebimento, estornar, cobrar
  | 'planilha' // importar contas de uma planilha
  | 'contatos' // cadastrar e editar clientes e fornecedores
  | 'usuarios'
  | 'config'
  | 'aprovar';

export const MODULOS: Modulo[] = ['comercial', 'faturamento', 'financeiro'];

export const NOME_MODULO: Record<Modulo, string> = {
  comercial: 'Comercial',
  faturamento: 'Faturamento',
  financeiro: 'Financeiro',
};

export const DESCRICAO_MODULO: Record<Modulo, string> = {
  comercial: 'Orçamentos, pedidos, produtos e clientes.',
  faturamento: 'Emitir as notas dos pedidos, notas de fornecedores e SEFAZ.',
  financeiro: 'Contas a pagar e a receber, caixa, cobrança e resultado.',
};

/** O que cada módulo libera para quem é da Equipe (Consulta só olha; Administrador faz tudo). */
export const PERMISSOES_DO_MODULO: Record<Modulo, Permissao[]> = {
  comercial: ['vender', 'contatos'],
  faturamento: ['faturar', 'importar', 'contatos'],
  financeiro: ['lancar', 'baixar', 'planilha', 'contatos'],
};

const SO_ADMIN: Permissao[] = ['usuarios', 'config', 'aprovar'];

export const NOME_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  equipe: 'Equipe',
  leitura: 'Consulta',
};

export const DESCRICAO_PAPEL: Record<Papel, string> = {
  admin: 'Todos os módulos, usuários, configurações da empresa e aprovação de pagamentos.',
  equipe: 'Trabalha nos módulos marcados: lança, edita e dá andamento.',
  leitura: 'Só olha e exporta os módulos marcados. Ideal para o contador.',
};

/** Módulos que a pessoa enxerga, sempre na ordem do menu. */
export function modulosDo(u: Pick<Usuario, 'papel' | 'modulos'>): Modulo[] {
  if (u.papel === 'admin') return [...MODULOS];
  const marcados = new Set(u.modulos ?? []);
  return MODULOS.filter((m) => marcados.has(m));
}

export function permissoesDo(u: Pick<Usuario, 'papel' | 'modulos'>): Set<Permissao> {
  if (u.papel === 'admin') return new Set<Permissao>([...MODULOS.flatMap((m) => PERMISSOES_DO_MODULO[m]), ...SO_ADMIN]);
  if (u.papel === 'leitura') return new Set();
  return new Set(modulosDo(u).flatMap((m) => PERMISSOES_DO_MODULO[m]));
}

// ---------- Páginas de cada módulo ----------

export interface PaginaModulo {
  rota: string;
  rotulo: string;
  icone: 'venda' | 'produto' | 'contatos' | 'relatorios' | 'nota' | 'pagar' | 'receber' | 'fluxo' | 'hoje';
}

export const PAGINAS_DO_MODULO: Record<Modulo, PaginaModulo[]> = {
  comercial: [
    { rota: '/vendas', rotulo: 'Vendas', icone: 'venda' },
    { rota: '/produtos', rotulo: 'Produtos', icone: 'produto' },
    { rota: '/contatos', rotulo: 'Clientes', icone: 'contatos' },
    { rota: '/relatorios?m=comercial', rotulo: 'Relatórios', icone: 'relatorios' },
  ],
  faturamento: [
    { rota: '/vendas?aba=pedido', rotulo: 'Pedidos a faturar', icone: 'venda' },
    { rota: '/notas', rotulo: 'Notas fiscais', icone: 'nota' },
    { rota: '/contatos', rotulo: 'Contatos', icone: 'contatos' },
    { rota: '/relatorios?m=faturamento', rotulo: 'Relatórios', icone: 'relatorios' },
  ],
  financeiro: [
    { rota: '/contas/pagar', rotulo: 'A pagar', icone: 'pagar' },
    { rota: '/contas/receber', rotulo: 'A receber', icone: 'receber' },
    { rota: '/fluxo', rotulo: 'Fluxo de caixa', icone: 'fluxo' },
    { rota: '/contatos', rotulo: 'Contatos', icone: 'contatos' },
    { rota: '/relatorios?m=financeiro', rotulo: 'Relatórios', icone: 'relatorios' },
  ],
};

// ---------- Relatórios (catálogo) ----------

export interface Relatorio {
  id: string;
  titulo: string;
  descricao: string;
  modulo: Modulo;
  /** relatório que já é uma tela própria (ex.: fluxo de caixa) */
  rota?: string;
}

export const RELATORIOS: Relatorio[] = [
  { id: 'gerencial', titulo: 'Gerencial', descricao: 'Entrou, saiu, lucro e margem mês a mês, por categoria (DRE).', modulo: 'financeiro' },
  { id: 'a-receber', titulo: 'Contas a receber', descricao: 'Quem deve, quanto está atrasado e o que entra nos próximos dias.', modulo: 'financeiro' },
  { id: 'a-pagar', titulo: 'Contas a pagar', descricao: 'O que a empresa deve, por fornecedor e por prazo.', modulo: 'financeiro' },
  { id: 'fluxo', titulo: 'Fluxo de caixa', descricao: 'Saldo previsto dia a dia e mês a mês.', modulo: 'financeiro', rota: '/fluxo' },
  { id: 'contador', titulo: 'Arquivos para o contador', descricao: 'Planilhas de lançamentos, notas fiscais e contatos.', modulo: 'financeiro' },
  { id: 'vendas', titulo: 'Vendas', descricao: 'Vendido por mês, por cliente e por produto, ticket médio e aprovação de orçamentos.', modulo: 'comercial' },
  { id: 'notas', titulo: 'Notas fiscais', descricao: 'Notas emitidas e recebidas por mês, impostos destacados e maiores clientes.', modulo: 'faturamento' },
];

export const rotaDoRelatorio = (r: Relatorio): string => r.rota ?? `/relatorios/${r.id}`;

// ---------- Quem pode abrir cada rota ----------

/** 'inicio' = painel do dono; 'livre' = qualquer pessoa logada (a tela filtra o que mostra). */
export type DonoDaRota = 'inicio' | 'livre' | Modulo[];

const PREFIXOS: [string, Modulo[]][] = [
  ['/vendas', ['comercial', 'faturamento']],
  ['/produtos', ['comercial']],
  ['/notas', ['faturamento']],
  ['/contas', ['financeiro']],
  ['/fluxo', ['financeiro']],
];

const casa = (caminho: string, prefixo: string) => caminho === prefixo || caminho.startsWith(prefixo + '/');

export function donoDaRota(caminho: string): DonoDaRota {
  const so = caminho.split(/[?#]/)[0] || '/';
  if (so === '/') return 'inicio';
  for (const [prefixo, mods] of PREFIXOS) if (casa(so, prefixo)) return mods;
  const rel = so.match(/^\/relatorios\/([^/]+)/);
  if (rel) {
    const r = RELATORIOS.find((x) => x.id === rel[1]);
    return r ? [r.modulo] : 'livre';
  }
  return 'livre';
}

/** O painel do dono (Hoje) é sobre dinheiro: aparece para o Administrador e para quem tem o Financeiro. */
export const vejoInicio = (u: Pick<Usuario, 'papel' | 'modulos'>): boolean => modulosDo(u).includes('financeiro');

export function podeAbrir(u: Pick<Usuario, 'papel' | 'modulos'>, caminho: string): boolean {
  const dono = donoDaRota(caminho);
  if (dono === 'livre') return true;
  if (dono === 'inicio') return vejoInicio(u);
  const meus = modulosDo(u);
  return dono.some((m) => meus.includes(m));
}

/** Para onde a pessoa vai ao entrar (ou quando abre uma tela de outro módulo). */
export function rotaInicial(u: Pick<Usuario, 'papel' | 'modulos'>): string {
  if (vejoInicio(u)) return '/';
  const [primeiro] = modulosDo(u);
  return primeiro ? PAGINAS_DO_MODULO[primeiro][0].rota : '/configuracoes?aba=perfil';
}

/**
 * Módulo a destacar no menu para a rota atual. Rotas que servem a mais de um módulo
 * (Contatos, Vendas, Relatórios) ficam no módulo em que a pessoa já estava.
 */
export function moduloDaRota(
  u: Pick<Usuario, 'papel' | 'modulos'>,
  caminho: string,
  busca: string,
  anterior: Modulo | null,
  /** o módulo veio do clique numa aba ou num item do menu (vale mais que o ?m= do endereço) */
  escolhido = false,
): Modulo | null {
  const meus = modulosDo(u);
  const dono = donoDaRota(caminho);
  if (dono === 'inicio') return null;
  const candidatos = dono === 'livre' ? meus : dono.filter((m) => meus.includes(m));
  if (escolhido && anterior && candidatos.includes(anterior)) return anterior;
  const pedido = new URLSearchParams(busca).get('m') as Modulo | null;
  if (pedido && meus.includes(pedido) && caminho === '/relatorios') return pedido;
  if (anterior && candidatos.includes(anterior)) return anterior;
  // "Pedidos sem nota" é a fila do Faturamento
  if (caminho === '/vendas' && new URLSearchParams(busca).get('aba') === 'pedido' && candidatos.includes('faturamento')) return 'faturamento';
  return candidatos[0] ?? null;
}
