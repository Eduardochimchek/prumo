// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { exemploNFeParaEmpresa, gerarXmlNFe } from '../nfe/exemplo';
import { ErroLeituraNFe, lerXmlNFe } from '../nfe/parser';

const empresa = { cnpj: '11222333000181', razaoSocial: 'Empresa Teste Ltda', uf: 'RS', municipio: 'Porto Alegre' };

describe('leitura do XML da NF-e', () => {
  it('lê de volta o XML de exemplo', () => {
    const original = exemploNFeParaEmpresa(empresa, '2026-11-09');
    const lido = lerXmlNFe(gerarXmlNFe(original));
    expect(lido.chave).toBe(original.chave);
    expect(lido.numero).toBe('4821');
    expect(lido.emitente.nome).toBe('Comercial Ponte de Pedra Materiais Ltda');
    expect(lido.destinatario.documento).toBe(empresa.cnpj);
    expect(lido.itens).toHaveLength(3);
    expect(lido.totais.nota).toBe(original.totais.nota);
    expect(lido.duplicatas.map((d) => d.vencimento)).toEqual(original.duplicatas.map((d) => d.vencimento));
    expect(lido.duplicatas.reduce((a, d) => a + d.valor, 0)).toBe(original.totais.nota);
    expect(lido.situacao).toBe('autorizada');
  });
  it('explica quando o arquivo não é NF-e', () => {
    expect(() => lerXmlNFe('isso não é xml')).toThrow(ErroLeituraNFe);
    expect(() => lerXmlNFe('<procEventoNFe><evento><infEvento/></evento></procEventoNFe>')).toThrow(/evento/);
  });
});
