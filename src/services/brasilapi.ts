// Consultas públicas e gratuitas via BrasilAPI (https://brasilapi.com.br), CORS liberado,
// funciona direto do navegador. CNPJ (dados da Receita Federal) e CEP.

import { mascaraCep, mascaraTelefone, normalizarCnpj, soDigitos } from '../lib/br';

export interface DadosCnpj {
  razaoSocial: string;
  nomeFantasia?: string;
  situacao?: string;
  email?: string;
  telefone?: string;
  cep?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  abertura?: string;
  atividade?: string;
}

const titulo = (s?: string) =>
  (s ?? '')
    .toLowerCase()
    .replace(/(^|\s|-)(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

export async function consultarCnpj(cnpj: string, signal?: AbortSignal): Promise<DadosCnpj> {
  const c = normalizarCnpj(cnpj);
  if (/[A-Z]/.test(c)) throw new Error('A consulta pública ainda não aceita CNPJ alfanumérico. Preencha os dados manualmente.');
  let r: Response;
  try {
    r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('Sem conexão com a BrasilAPI. Verifique a internet e tente de novo.');
  }
  if (r.status === 404) throw new Error('CNPJ não encontrado na base da Receita Federal.');
  if (r.status === 429) throw new Error('Muitas consultas seguidas. Aguarde um minuto e tente de novo.');
  if (!r.ok) throw new Error('A consulta de CNPJ está indisponível agora. Tente de novo em instantes.');
  const j = await r.json();
  const logradouro = [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ');
  return {
    razaoSocial: j.razao_social,
    nomeFantasia: j.nome_fantasia || undefined,
    situacao: j.descricao_situacao_cadastral || undefined,
    email: j.email ? String(j.email).toLowerCase() : undefined,
    telefone: j.ddd_telefone_1 ? mascaraTelefone(String(j.ddd_telefone_1)) : undefined,
    cep: j.cep ? mascaraCep(String(j.cep)) : undefined,
    endereco: titulo([logradouro, j.numero, j.complemento, j.bairro].filter(Boolean).join(', ')) || undefined,
    cidade: j.municipio ? titulo(j.municipio) : undefined,
    uf: j.uf || undefined,
    abertura: j.data_inicio_atividade || undefined,
    atividade: j.cnae_fiscal_descricao || undefined,
  };
}

export interface DadosCep {
  cidade: string;
  uf: string;
  bairro?: string;
  rua?: string;
}

export async function consultarCep(cep: string, signal?: AbortSignal): Promise<DadosCep> {
  const c = soDigitos(cep);
  if (c.length !== 8) throw new Error('O CEP tem 8 dígitos.');
  const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${c}`, { signal });
  if (!r.ok) throw new Error('CEP não encontrado.');
  const j = await r.json();
  return { cidade: j.city, uf: j.state, bairro: j.neighborhood || undefined, rua: j.street || undefined };
}
