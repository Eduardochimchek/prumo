import { describe, expect, it } from 'vitest';
import { calcularDvCnpj, cnpjValido, cpfValido, mascaraCnpj, mascaraDocumento, normalizarDocumento } from '../br';

describe('CNPJ', () => {
  it('valida CNPJ numérico', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('00.000.000/0000-00')).toBe(false);
  });
  it('valida CNPJ alfanumérico (exemplo oficial da Receita: 12.ABC.345/01DE-35)', () => {
    expect(calcularDvCnpj('12ABC34501DE')).toBe('35');
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true);
    expect(cnpjValido('12.abc.345/01de-35')).toBe(true);
    expect(cnpjValido('12.ABC.345/01DE-36')).toBe(false);
  });
  it('aplica máscara progressiva', () => {
    expect(mascaraCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
    expect(mascaraCnpj('1122233')).toBe('11.222.33');
  });
});

describe('CPF', () => {
  it('valida', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
  it('detecta o tipo de documento', () => {
    expect(normalizarDocumento('529.982.247-25')).toBe('52998224725');
    expect(mascaraDocumento('52998224725')).toBe('529.982.247-25');
    expect(mascaraDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });
});
