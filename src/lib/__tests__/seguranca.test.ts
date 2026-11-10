// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { avaliarSenha, limparFalhas, MAX_TENTATIVAS, registrarFalha, sessaoExpirada, tempoBloqueio } from '../seguranca';
import { gerarCsv, gerarSenha } from '../util';
import { documentoProtegido } from '../br';

describe('política de senha', () => {
  it('recusa senhas fracas e aceita boas', () => {
    expect(avaliarSenha('123').ok).toBe(false);
    expect(avaliarSenha('abcdefgh').ok).toBe(false); // sem número
    expect(avaliarSenha('admin123').ok).toBe(false); // comum
    expect(avaliarSenha('reginaldo2026', { nome: 'Reginaldo Jeronimo' }).ok).toBe(false); // contém o nome
    expect(avaliarSenha('Caixa-forte 42').ok).toBe(true);
    expect(avaliarSenha('Caixa-forte 42').forca).toBeGreaterThanOrEqual(3);
  });
  it('senha gerada sempre passa na política', () => {
    for (let i = 0; i < 50; i++) expect(avaliarSenha(gerarSenha()).ok).toBe(true);
  });
});

describe('bloqueio por tentativas', () => {
  beforeEach(() => localStorage.clear());
  it('bloqueia após 5 erros e libera depois', () => {
    const t0 = 1_000_000;
    for (let i = 1; i < MAX_TENTATIVAS; i++) expect(registrarFalha('ana', t0).bloqueioMs).toBe(0);
    const r = registrarFalha('ana', t0);
    expect(r.bloqueioMs).toBe(60_000);
    expect(tempoBloqueio('ANA', t0 + 1000)).toBeGreaterThan(0);
    expect(tempoBloqueio('ana', t0 + 61_000)).toBe(0);
    limparFalhas('ana');
    expect(tempoBloqueio('ana', t0)).toBe(0);
  });
  it('bloqueios seguidos dobram de tamanho', () => {
    for (let i = 0; i < MAX_TENTATIVAS; i++) registrarFalha('x', 0);
    let r = { bloqueioMs: 0, restantes: 0 };
    for (let i = 0; i < MAX_TENTATIVAS; i++) r = registrarFalha('x', 0);
    expect(r.bloqueioMs).toBe(120_000);
  });
});

describe('sessão', () => {
  it('expira após 30 min parada sem "manter conectado"', () => {
    const desde = new Date(0).toISOString();
    expect(sessaoExpirada({ desde, ultimaAtividade: desde }, 29 * 60_000)).toBe(false);
    expect(sessaoExpirada({ desde, ultimaAtividade: desde }, 31 * 60_000)).toBe(true);
    expect(sessaoExpirada({ desde, lembrar: true }, 31 * 60_000)).toBe(false);
  });
});

describe('planilhas (CSV)', () => {
  it('neutraliza fórmulas maliciosas e preserva números negativos', () => {
    const csv = gerarCsv([['=HYPERLINK("http://mal")', '+1+1', '@SOMA(A1)', '-66,30', 'Normal']]);
    expect(csv).toContain(`"'=HYPERLINK(""http://mal"")"`);
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'@SOMA(A1)");
    expect(csv).toContain(';-66,30;');
  });
});

describe('minimização de dados', () => {
  it('esconde parte do CPF e mostra o CNPJ inteiro', () => {
    expect(documentoProtegido('52998224725')).toBe('***.982.247-**');
    expect(documentoProtegido('11222333000181')).toBe('11.222.333/0001-81');
  });
});
