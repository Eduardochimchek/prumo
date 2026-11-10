// Integração com a SEFAZ — camada de serviço.
//
// O navegador NÃO consegue falar direto com a SEFAZ: os web services exigem TLS mútuo com o
// certificado digital A1 (e-CNPJ) da empresa e não liberam CORS. Por isso a integração real
// (V2) roda num backend, por um destes caminhos (ver docs/SEFAZ.md):
//   1. Backend próprio + certificado A1: NFeDistribuicaoDFe (Ambiente Nacional) para baixar as
//      notas emitidas contra o CNPJ e RecepcaoEvento para a manifestação do destinatário.
//   2. Provedor de API fiscal (Nuvem Fiscal, Focus NFe, PlugNotas, NFE.io...): REST pronto.
//
// Na V1 este módulo SIMULA a caixa de entrada (modo demonstração), deixando a tela e o fluxo
// prontos. Trocar o provedor = implementar a interface ProvedorSefaz.

import { addDias, hoje, mesChave } from '../lib/dates';
import { montarChave } from '../lib/nfe/chave';
import type { NFeDados } from '../lib/nfe/parser';
import { aleatorio, uid } from '../lib/util';
import type { Database, ResumoSefaz } from '../data/types';
import { atualizar } from '../data/store';
import { marcarSincronizacao } from '../data/actions';

export interface StatusSefaz {
  modo: 'demonstracao' | 'certificado' | 'provedor';
  ambiente: 'homologacao' | 'producao';
  uf: string;
  certificado?: { titular: string; validade: string };
  ultimaSincronizacao?: string;
}

export interface ProvedorSefaz {
  nome: string;
  status(db: Database): StatusSefaz;
  /** Busca novos documentos emitidos contra o CNPJ (Distribuição DF-e). Devolve quantos chegaram. */
  sincronizar(db: Database): Promise<number>;
  /** Baixa o XML completo de um resumo (exige ciência/confirmação antes). */
  obterNota(db: Database, resumo: ResumoSefaz): Promise<NFeDados>;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ITENS_DEMO = [
  { codigo: 'DEMO-01', descricao: 'Mercadoria para revenda (item simulado)', ncm: '73181500', unidade: 'UN' },
  { codigo: 'DEMO-02', descricao: 'Material de construção (item simulado)', ncm: '25232910', unidade: 'SC' },
  { codigo: 'DEMO-03', descricao: 'Acessório de acabamento (item simulado)', ncm: '32091010', unidade: 'GL' },
];

export const sefazDemonstracao: ProvedorSefaz = {
  nome: 'Demonstração (simulada)',

  status(db) {
    return {
      modo: 'demonstracao',
      ambiente: db.configSefaz.ambiente,
      uf: db.configSefaz.uf,
      certificado: db.configSefaz.certificado,
      ultimaSincronizacao: db.configSefaz.ultimaSincronizacao,
    };
  },

  async sincronizar(db) {
    await espera(1100);
    const r = aleatorio(Date.now() % 100000);
    const fornecedores = db.contatos.filter((c) => (c.tipo === 'fornecedor' || c.tipo === 'ambos') && c.documento.length === 14);
    const novos: ResumoSefaz[] = [];
    if (fornecedores.length && r.chance(0.7)) {
      const f = r.escolher(fornecedores);
      const emissao = addDias(hoje(), -r.inteiro(0, 2));
      novos.push({
        id: uid('sfz_'),
        chave: montarChave({ ufCodigo: '43', anoMes: mesChave(emissao), cnpj: f.documento, serie: 1, numero: r.inteiro(10000, 99999), codigoNumerico: r.digitos(8) }),
        emitenteDocumento: f.documento,
        emitenteNome: f.nome,
        emissao: `${emissao}T10:${String(r.inteiro(10, 59))}:00-03:00`,
        valor: r.inteiro(90_000, 1_600_000),
        situacao: 'autorizada',
        manifestacao: 'pendente',
        recebidoEm: new Date().toISOString(),
        demo: true,
      });
    }
    atualizar((d) => ({ ...d, sefaz: [...novos, ...d.sefaz] }));
    marcarSincronizacao();
    return novos.length;
  },

  async obterNota(db, resumo) {
    await espera(700);
    const r = aleatorio(Number(resumo.chave.slice(-6)) || 7);
    const n = r.inteiro(2, 3);
    const base = Math.floor(resumo.valor / n);
    const itens = ITENS_DEMO.slice(0, n).map((it, i) => {
      const total = i === n - 1 ? resumo.valor - base * (n - 1) : base;
      const quantidade = r.inteiro(4, 40);
      return { ...it, cfop: '5102', quantidade, valorUnitario: Math.round(total / quantidade), valorTotal: total };
    });
    const emissao = resumo.emissao.slice(0, 10);
    const metade = Math.floor(resumo.valor / 2);
    return {
      chave: resumo.chave,
      modelo: '55',
      serie: String(Number(resumo.chave.slice(22, 25))),
      numero: String(Number(resumo.chave.slice(25, 34))),
      naturezaOperacao: 'Venda de mercadoria',
      tipoOperacao: 'saida',
      emissao: resumo.emissao,
      emitente: { documento: resumo.emitenteDocumento, nome: resumo.emitenteNome, uf: 'RS' },
      destinatario: { documento: db.empresa.cnpj, nome: db.empresa.razaoSocial, uf: db.empresa.uf, municipio: db.empresa.municipio },
      itens,
      totais: { produtos: resumo.valor, frete: 0, seguro: 0, desconto: 0, outros: 0, ipi: 0, icms: Math.round(resumo.valor * 0.17), st: 0, pis: 0, cofins: 0, nota: resumo.valor },
      duplicatas: [
        { numero: '001', vencimento: addDias(emissao, 28), valor: metade },
        { numero: '002', vencimento: addDias(emissao, 56), valor: resumo.valor - metade },
      ],
      pagamentos: [{ forma: '15', descricao: 'Boleto bancário', valor: resumo.valor }],
      protocolo: { numero: `143${r.digitos(12)}`, data: resumo.emissao, status: '100', motivo: 'Autorizado o uso da NF-e' },
      situacao: 'autorizada',
      informacoesComplementares: 'NOTA SIMULADA PELO MODO DEMONSTRACAO DO PRUMO',
    };
  },
};

/** Provedor ativo. Na V2: escolher pelo `configSefaz` (certificado próprio ou API de terceiros). */
export const sefaz: ProvedorSefaz = sefazDemonstracao;
