// Datas de negócio (vencimento, emissão, baixa) trafegam como string ISO 'YYYY-MM-DD',
// sem fuso horário. Nunca use `new Date('2026-11-09')` direto: o JS interpreta como UTC
// e no Brasil vira o dia anterior. Use parseISO/toISO daqui.

export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function hoje(): ISODate {
  return toISO(new Date());
}

export function agoraISO(): string {
  return new Date().toISOString();
}

export function addDias(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Soma meses preservando o dia (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMeses(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimo));
  return toISO(d);
}

/** Diferença em dias (a - b). Arredonda para absorver horário de verão. */
export function diffDias(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000);
}

export const inicioMes = (s: ISODate): ISODate => s.slice(0, 8) + '01';

export function fimMes(s: ISODate): ISODate {
  const d = parseISO(s);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** 'YYYY-MM' */
export const mesChave = (s: ISODate): string => s.slice(0, 7);

export function addMesesChave(chave: string, n: number): string {
  return mesChave(addMeses(`${chave}-01`, n));
}

export const diaSemana = (s: ISODate): number => parseISO(s).getDay();
export const ehFimDeSemana = (s: ISODate): boolean => [0, 6].includes(diaSemana(s));

export function proximoDiaUtil(s: ISODate): ISODate {
  let d = s;
  while (ehFimDeSemana(d)) d = addDias(d, 1);
  return d;
}

/** N-ésimo dia útil do mês (sem feriados na V1). Ex.: salário no 5º dia útil. */
export function nDiaUtil(chaveMes: string, n: number): ISODate {
  let d = `${chaveMes}-01`;
  let conta = 0;
  for (;;) {
    if (!ehFimDeSemana(d)) conta++;
    if (conta === n) return d;
    d = addDias(d, 1);
  }
}

export function diaDoMes(chaveMes: string, dia: number): ISODate {
  const ultimo = Number(fimMes(`${chaveMes}-01`).slice(8, 10));
  return `${chaveMes}-${pad(Math.min(dia, ultimo))}`;
}

// ---------- Formatação pt-BR ----------

const fCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fDiaMes = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const fDiaMesLongo = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });
const fExtenso = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fExtensoSemAno = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const fSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const fMesLongo = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fMesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

const semPonto = (s: string) => s.replace(/\./g, '');

/** 09/11/2026 */
export const dataBR = (s?: string | null): string => (s ? fCurta.format(parseISO(s)) : '-');

/** 9 nov */
export const diaMes = (s: ISODate): string => semPonto(fDiaMes.format(parseISO(s))).replace(' de ', ' ');

/** 7 de dezembro */
export const diaMesLongo = (s: ISODate): string => fDiaMesLongo.format(parseISO(s));

/** segunda-feira, 9 de novembro de 2026 */
export const dataExtenso = (s: ISODate, comAno = true): string =>
  (comAno ? fExtenso : fExtensoSemAno).format(parseISO(s));

/** seg */
export const semanaCurta = (s: ISODate): string => semPonto(fSemana.format(parseISO(s)));

/** novembro de 2026 */
export const mesLongo = (chave: string): string => fMesLongo.format(parseISO(`${chave}-01`));

/** Novembro de 2026 (só a primeira letra maiúscula) */
export const mesLongoTitulo = (chave: string): string => mesLongo(chave).replace(/^./, (c) => c.toUpperCase());

/** nov */
export const mesCurto = (chave: string): string => semPonto(fMesCurto.format(parseISO(`${chave}-01`)));

/** nov/26 */
export const mesAbrev = (chave: string): string => `${mesCurto(chave)}/${chave.slice(2, 4)}`;

/** 'hoje', 'amanhã', 'ontem', 'em 3 dias', 'há 5 dias' */
export function relativoDias(s: ISODate, ref: ISODate = hoje()): string {
  const d = diffDias(s, ref);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'ontem';
  if (d > 1 && d < 7) return `em ${d} dias`;
  if (d < -1 && d > -60) return `há ${-d} dias`;
  return dataBR(s);
}

/** Para carimbos de data/hora (ISO completo): 'agora', 'há 5 min', 'há 2 h', 'ontem às 14:20', '03/11/2026'. */
export function tempoRelativo(iso: string, agora = new Date()): string {
  const t = new Date(iso);
  const seg = (agora.getTime() - t.getTime()) / 1000;
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  const dDias = diffDias(toISO(agora), toISO(t));
  if (dDias === 0) return `há ${Math.floor(seg / 3600)} h`;
  if (dDias === 1) return `ontem às ${fHora.format(t)}`;
  if (dDias < 7) return `há ${dDias} dias`;
  return fCurta.format(t);
}

export const horaBR = (iso: string): string => fHora.format(new Date(iso));

export function saudacao(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
