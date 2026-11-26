import { describe, expect, it } from 'vitest';
import { lerData, lerTabela, lerTipo, lerValor, montarLinhas, pareceCabecalho, sugerirMapeamento } from '../planilha';

describe('valores', () => {
  it('entende o jeito brasileiro e o americano', () => {
    expect(lerValor('R$ 1.234,56')).toBe(123456);
    expect(lerValor('1234,56')).toBe(123456);
    expect(lerValor('1234.56')).toBe(123456);
    expect(lerValor('1,234.56')).toBe(123456);
    expect(lerValor('1.500')).toBe(150000);
    expect(lerValor('12.345.678')).toBe(1234567800);
    expect(lerValor('1500')).toBe(150000);
    expect(lerValor('0,5')).toBe(50);
    expect(lerValor('R$ 980,00')).toBe(98000);
  });
  it('negativos e arredondamento', () => {
    expect(lerValor('-80,00')).toBe(-8000);
    expect(lerValor('(80,00)')).toBe(-8000);
    expect(lerValor('80,00-')).toBe(-8000);
    expect(lerValor('-R$ 50,00')).toBe(-5000);
    expect(lerValor('10,005')).toBe(1001);
    expect(lerValor('10,004')).toBe(1000);
  });
  it('recusa o que não é valor', () => {
    expect(lerValor('')).toBeNull();
    expect(lerValor('abc')).toBeNull();
    expect(lerValor('12/05/2026')).toBeNull();
    expect(lerValor('1.2.3,4.5')).toBe(123450); // milhar estranho ainda vira número; a pessoa confere na prévia
  });
});

describe('datas', () => {
  it('formatos comuns', () => {
    expect(lerData('05/12/2026')).toBe('2026-12-05');
    expect(lerData('5/1/26')).toBe('2026-01-05');
    expect(lerData('2026-12-05')).toBe('2026-12-05');
    expect(lerData('05-12-2026')).toBe('2026-12-05');
    expect(lerData('05.12.2026')).toBe('2026-12-05');
    expect(lerData('05/12/2026 10:30')).toBe('2026-12-05');
    expect(lerData('45992')).toBe('2025-12-01'); // número de série do Excel
  });
  it('recusa datas que não existem', () => {
    expect(lerData('31/02/2026')).toBeNull();
    expect(lerData('29/02/2027')).toBeNull();
    expect(lerData('29/02/2028')).toBe('2028-02-29');
    expect(lerData('13/13/2026')).toBeNull();
    expect(lerData('ontem')).toBeNull();
    expect(lerData('')).toBeNull();
  });
});

describe('tabela', () => {
  it('lê o que vem colado do Excel (tabulação)', () => {
    const t = lerTabela('Descrição\tValor\tVencimento\nAluguel\t6.800,00\t10/12/2026\n\nLuz\t1.180,00\t15/12/2026\n');
    expect(t).toEqual([
      ['Descrição', 'Valor', 'Vencimento'],
      ['Aluguel', '6.800,00', '10/12/2026'],
      ['Luz', '1.180,00', '15/12/2026'],
    ]);
  });
  it('lê CSV do Excel brasileiro com aspas e BOM', () => {
    const t = lerTabela('﻿Descrição;Valor\r\n"Silva; Souza ""ME""";"1.234,56"\r\n');
    expect(t).toEqual([
      ['Descrição', 'Valor'],
      ['Silva; Souza "ME"', '1.234,56'],
    ]);
  });
  it('lê CSV com vírgula', () => {
    expect(lerTabela('a,b\n1,"2,5"')).toEqual([
      ['a', 'b'],
      ['1', '2,5'],
    ]);
  });
});

describe('mapeamento e linhas', () => {
  it('sugere as colunas pelos títulos', () => {
    const m = sugerirMapeamento(['Data de vencimento', 'Histórico', 'Fornecedor', 'Valor (R$)', 'Categoria', 'Pago em', 'Nº']);
    expect(m.vencimento).toBe(0);
    expect(m.descricao).toBe(1);
    expect(m.contato).toBe(2);
    expect(m.valor).toBe(3);
    expect(m.categoria).toBe(4);
    expect(m.pagoEm).toBe(5);
    expect(m.documento).toBe(6);
    expect(m.tipo).toBe(-1);
  });
  it('reconhece a linha de títulos', () => {
    expect(pareceCabecalho(['Descrição', 'Valor', 'Vencimento'])).toBe(true);
    expect(pareceCabecalho(['Aluguel', '6.800,00', '10/12/2026'])).toBe(false);
  });
  it('tipo pela coluna', () => {
    expect(lerTipo('Despesa')).toBe('pagar');
    expect(lerTipo('a receber')).toBe('receber');
    expect(lerTipo('Saída')).toBe('pagar');
    expect(lerTipo('talvez')).toBeNull();
  });
  it('monta as linhas com erros claros', () => {
    const tabela = [
      ['Descrição', 'Valor', 'Vencimento', 'Pago?'],
      ['Aluguel', '6.800,00', '10/11/2026', 'sim'],
      ['', '100', '01/12/2026', ''],
      ['Luz', 'abc', '31/02/2026', ''],
      ['Internet', '-489,90', '12/12/2026', 'talvez'],
      ['Conserto', '350', '20/11/2026', '25/11/2026'],
    ];
    const m = sugerirMapeamento(tabela[0]);
    const linhas = montarLinhas(tabela, m, { temCabecalho: true, modoTipo: 'pagar', hoje: '2026-11-15' });
    expect(linhas[0]).toMatchObject({ n: 2, descricao: 'Aluguel', valor: 680000, vencimento: '2026-11-10', tipo: 'pagar', pagoEm: '2026-11-10', erros: [] });
    expect(linhas[1].erros).toContain('sem descrição');
    expect(linhas[2].erros).toEqual(['valor “abc” não é um número', 'data “31/02/2026” inválida']);
    expect(linhas[3].valor).toBe(48990);
    expect(linhas[3].erros[0]).toContain('não entendi “talvez”');
    expect(linhas[4].erros).toContain('data de pagamento no futuro');
  });
  it('tipo pelo sinal do valor', () => {
    const linhas = montarLinhas(
      [
        ['Aluguel', '-6800', '10/12/2026'],
        ['Venda', '1200', '11/12/2026'],
      ],
      { descricao: 0, valor: 1, vencimento: 2, tipo: -1, contato: -1, categoria: -1, documento: -1, pagoEm: -1, observacoes: -1 },
      { temCabecalho: false, modoTipo: 'sinal', hoje: '2026-11-15' },
    );
    expect(linhas.map((l) => [l.tipo, l.valor])).toEqual([
      ['pagar', 680000],
      ['receber', 120000],
    ]);
  });
});

describe('arquivo', () => {
  it('lê CSV em UTF-8 e em Windows-1252 (Excel brasileiro)', async () => {
    const { decodificarTexto, pareceExcelBinario } = await import('../planilha');
    expect(decodificarTexto(new TextEncoder().encode('Descrição;Água'))).toBe('Descrição;Água');
    // "Água" em Windows-1252: Á = 0xC1
    expect(decodificarTexto(new Uint8Array([0xc1, 0x67, 0x75, 0x61]))).toBe('Água');
    expect(pareceExcelBinario(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(true);
    expect(pareceExcelBinario(new TextEncoder().encode('a;b'))).toBe(false);
  });
});
