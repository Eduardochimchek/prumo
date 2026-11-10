import { describe, expect, it } from 'vitest';
import { dataPorFator, fatorPorData, formatarLinhaDigitavel, gerarLinhaDigitavel, lerBoleto, mod10 } from '../boleto';

describe('fator de vencimento', () => {
  it('reinicia em 1000 no dia 22/02/2025', () => {
    expect(fatorPorData('2025-02-21')).toBe(9999);
    expect(fatorPorData('2025-02-22')).toBe(1000);
    expect(dataPorFator(1000, '2026-11-09')).toBe('2025-02-22');
    expect(dataPorFator(fatorPorData('2026-12-10'), '2026-11-09')).toBe('2026-12-10');
  });
});

describe('linha digitável bancária', () => {
  it('ida e volta: gera e lê valor, vencimento e banco', () => {
    const linha = gerarLinhaDigitavel('341', '2026-12-10', 1_234_567, '1234567890123456789012345');
    expect(linha).toHaveLength(47);
    const info = lerBoleto(linha, '2026-11-09');
    expect(info?.valido).toBe(true);
    expect(info?.valor).toBe(1_234_567);
    expect(info?.vencimento).toBe('2026-12-10');
    expect(info?.banco?.nome).toBe('Itaú Unibanco');
    expect(formatarLinhaDigitavel(linha)).toMatch(/^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/);
  });
  it('acusa dígito errado', () => {
    const linha = gerarLinhaDigitavel('001', '2026-12-10', 50_000, '9'.repeat(25));
    const errada = linha.slice(0, 3) + ((Number(linha[3]) + 1) % 10) + linha.slice(4);
    expect(lerBoleto(errada, '2026-11-09')?.valido).toBe(false);
  });
  it('mod10 do exemplo FEBRABAN', () => {
    expect(mod10('001905009')).toBe(5);
  });
  it('ignora entradas que não são boleto', () => {
    expect(lerBoleto('123')).toBeNull();
  });
});
