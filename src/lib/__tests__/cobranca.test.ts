import { describe, expect, it } from 'vitest';
import { linkWhatsApp, mensagemCobranca, momentoCobranca, nomeParaSaudacao, telefoneWhatsApp } from '../cobranca';

describe('telefone para o WhatsApp', () => {
  it('aceita os jeitos comuns de escrever', () => {
    expect(telefoneWhatsApp('(51) 99876-5432')).toBe('5551998765432');
    expect(telefoneWhatsApp('+55 51 99876-5432')).toBe('5551998765432');
    expect(telefoneWhatsApp('51998765432')).toBe('5551998765432');
    expect(telefoneWhatsApp('0 51 99876-5432')).toBe('5551998765432');
    expect(telefoneWhatsApp('(51) 3333-4444')).toBe('555133334444'); // fixo com WhatsApp Business
  });
  it('recusa o que não é telefone', () => {
    expect(telefoneWhatsApp('')).toBeNull();
    expect(telefoneWhatsApp(undefined)).toBeNull();
    expect(telefoneWhatsApp('12345')).toBeNull();
    expect(telefoneWhatsApp('(00) 99876-5432')).toBeNull();
  });
  it('monta o link com o texto codificado, com ou sem número', () => {
    expect(linkWhatsApp('Olá & tchau', '(51) 99876-5432')).toBe('https://wa.me/5551998765432?text=Ol%C3%A1%20%26%20tchau');
    expect(linkWhatsApp('Oi', null)).toBe('https://wa.me/?text=Oi');
  });
});

describe('mensagem de cobrança', () => {
  const base = { empresa: 'Horizonte Materiais', cliente: 'Laje Forte', valor: 123456, referente: 'NF 3205 · 1/2' };
  it('muda o tom conforme o vencimento', () => {
    expect(momentoCobranca('2026-11-12', '2026-11-09')).toBe('antes');
    expect(momentoCobranca('2026-11-09', '2026-11-09')).toBe('hoje');
    expect(momentoCobranca('2026-11-01', '2026-11-09')).toBe('atrasado');
    const antes = mensagemCobranca({ ...base, vencimento: '2026-11-10', ref: '2026-11-09' });
    expect(antes).toContain('vence amanhã (10/11/2026)');
    expect(antes).toContain('R$ 1.234,56');
    const hoje = mensagemCobranca({ ...base, vencimento: '2026-11-09', ref: '2026-11-09' });
    expect(hoje).toContain('vence hoje');
    const atrasado = mensagemCobranca({ ...base, vencimento: '2026-11-01', ref: '2026-11-09' });
    expect(atrasado).toContain('venceu em 01/11/2026');
    expect(atrasado).toContain('Se já pagou, pode desconsiderar');
  });
  it('leva o PIX (ou o boleto) junto e não usa travessão', () => {
    const m = mensagemCobranca({ ...base, vencimento: '2026-11-15', ref: '2026-11-09', pix: '000201PIX', linhaDigitavel: '1234' });
    expect(m).toContain('PIX copia e cola:\n000201PIX');
    expect(m).not.toContain('1234');
    expect(m).not.toContain('—');
    expect(mensagemCobranca({ ...base, vencimento: '2026-11-15', ref: '2026-11-09', linhaDigitavel: '0019' })).toContain('Linha digitável do boleto:\n0019');
  });
  it('chama pessoa física pelo primeiro nome e empresa pelo nome fantasia', () => {
    expect(nomeParaSaudacao('Marina Duarte Souza', undefined, '68437757991')).toBe('Marina');
    expect(nomeParaSaudacao('Construtora Laje Forte Ltda', 'Laje Forte', '12345678000195')).toBe('Laje Forte');
    // CNPJ alfanumérico pode ter 11 dígitos: não é CPF
    expect(nomeParaSaudacao('NuvemSoft Sistemas Ltda', 'NuvemSoft', 'AB12CD345678901')).toBe('NuvemSoft');
  });
});
