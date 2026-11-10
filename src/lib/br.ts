// Documentos e dados brasileiros: CNPJ (inclusive alfanumérico), CPF, CEP, telefone, UFs e bancos.

export const soDigitos = (s: string): string => s.replace(/\D/g, '');

// ---------- CNPJ ----------
// Desde julho/2026 a Receita emite CNPJ ALFANUMÉRICO (IN RFB nº 2.229/2024):
// 12 posições [0-9A-Z] + 2 dígitos verificadores numéricos. O cálculo do DV usa
// (código ASCII − 48) de cada caractere, o que mantém compatibilidade com o CNPJ numérico.
// Regra do projeto: NUNCA assumir que CNPJ é só número.

export const normalizarCnpj = (s: string): string => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

const valorCaractere = (c: string) => c.charCodeAt(0) - 48;

function dvModulo11(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += valorCaractere(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function calcularDvCnpj(base12: string): string {
  const d1 = dvModulo11(base12);
  const d2 = dvModulo11(base12 + d1);
  return `${d1}${d2}`;
}

export function cnpjValido(entrada: string): boolean {
  const c = normalizarCnpj(entrada);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  return c.slice(12) === calcularDvCnpj(c.slice(0, 12));
}

export const cnpjAlfanumerico = (entrada: string): boolean => /[A-Z]/.test(normalizarCnpj(entrada));

/** Máscara progressiva (funciona enquanto o usuário digita): 12.ABC.345/01DE-35 */
export function mascaraCnpj(entrada: string): string {
  const c = normalizarCnpj(entrada).slice(0, 14);
  let r = c.slice(0, 2);
  if (c.length > 2) r += '.' + c.slice(2, 5);
  if (c.length > 5) r += '.' + c.slice(5, 8);
  if (c.length > 8) r += '/' + c.slice(8, 12);
  if (c.length > 12) r += '-' + c.slice(12, 14);
  return r;
}

// ---------- CPF ----------

export function cpfValido(entrada: string): boolean {
  const c = soDigitos(entrada);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(c[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

export function mascaraCpf(entrada: string): string {
  const c = soDigitos(entrada).slice(0, 11);
  let r = c.slice(0, 3);
  if (c.length > 3) r += '.' + c.slice(3, 6);
  if (c.length > 6) r += '.' + c.slice(6, 9);
  if (c.length > 9) r += '-' + c.slice(9, 11);
  return r;
}

/** Decide entre CPF e CNPJ pelo conteúdo: letras ou mais de 11 posições => CNPJ. */
export function normalizarDocumento(entrada: string): string {
  const n = normalizarCnpj(entrada);
  return /[A-Z]/.test(n) || n.length > 11 ? n : soDigitos(entrada);
}

export function mascaraDocumento(entrada: string): string {
  const n = normalizarDocumento(entrada);
  return /[A-Z]/.test(n) || n.length > 11 ? mascaraCnpj(n) : mascaraCpf(n);
}

export function documentoValido(entrada: string): boolean {
  const n = normalizarDocumento(entrada);
  return n.length === 11 ? cpfValido(n) : cnpjValido(n);
}

export const tipoDocumento = (entrada: string): 'CPF' | 'CNPJ' =>
  normalizarDocumento(entrada).length === 11 ? 'CPF' : 'CNPJ';

// ---------- CEP e telefone ----------

export function mascaraCep(entrada: string): string {
  const c = soDigitos(entrada).slice(0, 8);
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

export function mascaraTelefone(entrada: string): string {
  const c = soDigitos(entrada).slice(0, 11);
  if (c.length <= 2) return c.length ? `(${c}` : '';
  const ddd = c.slice(0, 2);
  const resto = c.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  if (c.length === 11) return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
  return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
}

// ---------- UFs (código IBGE usado na chave de acesso da NF-e) ----------

export const UFS: { codigo: string; sigla: string; nome: string }[] = [
  { codigo: '11', sigla: 'RO', nome: 'Rondônia' },
  { codigo: '12', sigla: 'AC', nome: 'Acre' },
  { codigo: '13', sigla: 'AM', nome: 'Amazonas' },
  { codigo: '14', sigla: 'RR', nome: 'Roraima' },
  { codigo: '15', sigla: 'PA', nome: 'Pará' },
  { codigo: '16', sigla: 'AP', nome: 'Amapá' },
  { codigo: '17', sigla: 'TO', nome: 'Tocantins' },
  { codigo: '21', sigla: 'MA', nome: 'Maranhão' },
  { codigo: '22', sigla: 'PI', nome: 'Piauí' },
  { codigo: '23', sigla: 'CE', nome: 'Ceará' },
  { codigo: '24', sigla: 'RN', nome: 'Rio Grande do Norte' },
  { codigo: '25', sigla: 'PB', nome: 'Paraíba' },
  { codigo: '26', sigla: 'PE', nome: 'Pernambuco' },
  { codigo: '27', sigla: 'AL', nome: 'Alagoas' },
  { codigo: '28', sigla: 'SE', nome: 'Sergipe' },
  { codigo: '29', sigla: 'BA', nome: 'Bahia' },
  { codigo: '31', sigla: 'MG', nome: 'Minas Gerais' },
  { codigo: '32', sigla: 'ES', nome: 'Espírito Santo' },
  { codigo: '33', sigla: 'RJ', nome: 'Rio de Janeiro' },
  { codigo: '35', sigla: 'SP', nome: 'São Paulo' },
  { codigo: '41', sigla: 'PR', nome: 'Paraná' },
  { codigo: '42', sigla: 'SC', nome: 'Santa Catarina' },
  { codigo: '43', sigla: 'RS', nome: 'Rio Grande do Sul' },
  { codigo: '50', sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { codigo: '51', sigla: 'MT', nome: 'Mato Grosso' },
  { codigo: '52', sigla: 'GO', nome: 'Goiás' },
  { codigo: '53', sigla: 'DF', nome: 'Distrito Federal' },
];

export const ufPorCodigo = (codigo: string) => UFS.find((u) => u.codigo === codigo);
export const ufPorSigla = (sigla: string) => UFS.find((u) => u.sigla === sigla.toUpperCase());

// ---------- Bancos (código COMPE) ----------

export const BANCOS: { codigo: string; nome: string }[] = [
  { codigo: '001', nome: 'Banco do Brasil' },
  { codigo: '033', nome: 'Santander' },
  { codigo: '041', nome: 'Banrisul' },
  { codigo: '077', nome: 'Banco Inter' },
  { codigo: '085', nome: 'Ailos' },
  { codigo: '104', nome: 'Caixa Econômica Federal' },
  { codigo: '136', nome: 'Unicred' },
  { codigo: '208', nome: 'BTG Pactual' },
  { codigo: '237', nome: 'Bradesco' },
  { codigo: '260', nome: 'Nubank' },
  { codigo: '290', nome: 'PagBank' },
  { codigo: '323', nome: 'Mercado Pago' },
  { codigo: '336', nome: 'C6 Bank' },
  { codigo: '341', nome: 'Itaú Unibanco' },
  { codigo: '403', nome: 'Cora' },
  { codigo: '422', nome: 'Safra' },
  { codigo: '748', nome: 'Sicredi' },
  { codigo: '756', nome: 'Sicoob' },
];

export const bancoPorCodigo = (codigo?: string) => BANCOS.find((b) => b.codigo === codigo);
