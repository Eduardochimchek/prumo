// Emissão de nota fiscal de venda: camada de serviço.
//
// Na demonstração a emissão é SIMULADA: a nota recebe chave de acesso válida, protocolo e o status
// "autorizada", mas nada é enviado à SEFAZ. No produto real (ver plano SaaS), esta interface é
// implementada pela API fiscal (Focus NFe) e, para NFS-e, opcionalmente pelo emissor nacional.

import { agoraISO, hoje, mesChave } from '../lib/dates';
import { ufPorSigla } from '../lib/br';
import { montarChave } from '../lib/nfe/chave';
import type { Contato, Database, NotaFiscal, Venda } from '../data/types';
import { totaisDaVenda, vencimentosDaCondicao } from '../data/vendas';

export interface ProvedorFiscal {
  nome: string;
  simulado: boolean;
  /** Monta e "autoriza" a NF-e de uma venda. Devolve a nota pronta para gravar. */
  emitirNFe(db: Database, venda: Venda, contato: Contato, usuarioId: string): NotaFiscal;
}

function proximoNumeroNota(db: Database): number {
  const minhas = db.notas.filter((n) => n.direcao === 'saida').map((n) => Number(n.numero) || 0);
  return (minhas.length ? Math.max(...minhas) : 1000) + 1;
}

export const fiscalSimulado: ProvedorFiscal = {
  nome: 'Simulação (demonstração)',
  simulado: true,
  emitirNFe(db, venda, contato, usuarioId) {
    const emissao = hoje();
    const numero = proximoNumeroNota(db);
    const t = totaisDaVenda(venda);
    const chave = montarChave({
      ufCodigo: ufPorSigla(db.empresa.uf)?.codigo ?? '43',
      anoMes: mesChave(emissao),
      cnpj: db.empresa.cnpj,
      serie: 1,
      numero,
      codigoNumerico: String(10_000_000 + ((numero * 7919) % 89_999_999)),
    });
    const parcelas = vencimentosDaCondicao(venda.condicao, emissao, t.total);
    const agora = new Date();
    const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    return {
      id: `nfe_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      chave,
      modelo: '55',
      serie: '1',
      numero: String(numero),
      direcao: 'saida',
      naturezaOperacao: 'Venda de mercadoria adquirida de terceiros',
      emissao: `${emissao}T${hora}:00-03:00`,
      emitente: { documento: db.empresa.cnpj, nome: db.empresa.razaoSocial, fantasia: db.empresa.nomeFantasia, uf: db.empresa.uf, municipio: db.empresa.municipio },
      destinatario: { documento: contato.documento, nome: contato.nome, fantasia: contato.fantasia, uf: contato.uf, municipio: contato.cidade },
      itens: venda.itens.map((i) => ({
        codigo: i.codigo,
        descricao: i.descricao,
        ncm: db.produtos.find((p) => p.id === i.produtoId)?.ncm,
        cfop: contato.uf && contato.uf !== db.empresa.uf ? '6102' : '5102',
        unidade: i.unidade,
        quantidade: i.quantidade,
        valorUnitario: i.precoUnitario,
        valorTotal: i.total,
      })),
      // Simples Nacional: ICMS, PIS e COFINS vão no DAS, não são destacados na nota
      totais: { produtos: t.subtotal, frete: venda.frete, desconto: venda.desconto, ipi: 0, icms: 0, st: 0, pis: 0, cofins: 0, outros: 0, nota: t.total },
      duplicatas: venda.condicao.forma === 'boleto' || parcelas.length > 1 ? parcelas.map((p, i) => ({ numero: String(i + 1).padStart(3, '0'), ...p })) : [],
      situacao: 'autorizada',
      protocolo: `143${String(Date.now()).slice(-12)}`,
      origem: 'emitida',
      vendaId: venda.id,
      contatoId: contato.id,
      importadaEm: agoraISO(),
      importadaPor: usuarioId,
    };
  },
};

/** Provedor ativo. No SaaS: Focus NFe (e emissor nacional para NFS-e). */
export const fiscal: ProvedorFiscal = fiscalSimulado;
