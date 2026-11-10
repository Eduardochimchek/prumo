import { describe, expect, it } from 'vitest';
import { analisarChave, formatarChave, montarChave } from '../nfe/chave';

describe('chave de acesso', () => {
  const chave = montarChave({ ufCodigo: '43', anoMes: '2026-11', cnpj: '11222333000181', serie: 1, numero: 4821, codigoNumerico: '12345678' });

  it('monta e valida', () => {
    expect(chave).toHaveLength(44);
    const info = analisarChave(chave);
    expect(info.valida).toBe(true);
    expect(info.uf?.sigla).toBe('RS');
    expect(info.anoMes).toBe('2026-11');
    expect(info.numero).toBe(4821);
    expect(info.modelo?.nome).toBe('NF-e');
    expect(info.emitente?.formatado).toBe('11.222.333/0001-81');
  });
  it('aceita CNPJ alfanumérico do emitente', () => {
    const c = montarChave({ ufCodigo: '35', anoMes: '2026-09', cnpj: '12ABC34501DE35', serie: 2, numero: 77, codigoNumerico: '87654321' });
    expect(analisarChave(c).valida).toBe(true);
  });
  it('acusa DV errado e tamanho errado', () => {
    const errada = chave.slice(0, 43) + ((Number(chave[43]) + 1) % 10);
    expect(analisarChave(errada).valida).toBe(false);
    expect(analisarChave('123').completa).toBe(false);
  });
  it('formata em blocos de 4', () => {
    expect(formatarChave(chave).split(' ')).toHaveLength(11);
  });
});
