// Teste de fumaça ponta a ponta: usa o Prumo como uma pessoa usaria.
// Uso: npm run build && npm run smoke
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirNavegador } from './browser.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 4340;
const BASE = `http://localhost:${PORTA}/`;
const servidor = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORTA), '--strictPort'], {
  cwd: raiz,
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

const resultados = [];
async function passo(nome, fn) {
  try {
    await fn();
    resultados.push(['ok', nome]);
    console.log('  ✓', nome);
  } catch (e) {
    resultados.push(['falhou', nome, e.message]);
    console.log('  ✗', nome, '→', e.message.split('\n')[0]);
  }
}

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const navegador = await abrirNavegador();
  const contexto = await navegador.newContext({ viewport: { width: 1366, height: 900 }, locale: 'pt-BR', acceptDownloads: true });
  const p = await contexto.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('dialog', (d) => d.accept());

  const entrar = async (login, senha) => {
    await p.goto(BASE);
    await p.waitForSelector('#l-usuario');
    await p.fill('#l-usuario', login);
    await p.fill('#l-senha', senha);
    await p.click('button[type=submit]');
    await p.waitForSelector('.conteudo', { timeout: 5000 });
  };
  const sair = async () => {
    await p.click('.cabecalho .barra__usuario');
    await p.getByRole('menuitem', { name: 'Sair' }).click();
    await p.waitForSelector('#l-usuario');
  };
  const aviso = (texto) => p.locator('.aviso', { hasText: texto }).first().waitFor({ timeout: 4000 });

  console.log('Prumo — teste de fumaça');

  await passo('senha errada é recusada', async () => {
    await p.goto(BASE);
    await p.fill('#l-usuario', 'admin');
    await p.fill('#l-senha', 'errada');
    await p.click('button[type=submit]');
    await p.getByText('Usuário ou senha incorretos.').waitFor({ timeout: 3000 });
  });

  await passo('login do administrador', () => entrar('admin', 'admin123'));

  await passo('lançar conta a pagar parcelada em 3x', async () => {
    await p.getByRole('button', { name: 'Lançar' }).click();
    await p.getByRole('menuitem', { name: 'Conta a pagar' }).click();
    await p.fill('#f-desc', 'Teste de fumaça · compressor');
    await p.click('#f-valor');
    await p.keyboard.type('300000'); // R$ 3.000,00
    await p.selectOption('#f-rep', 'parcelado');
    await p.fill('#f-vezes', '3');
    await p.getByRole('button', { name: 'Lançar 3 parcelas' }).click();
    await aviso('3 lançamentos criados');
  });

  await passo('parcelas aparecem na lista com o valor dividido', async () => {
    await p.goto(BASE + '#/contas/pagar?periodo=abertos');
    await p.fill('input[aria-label="Buscar"]', 'fumaça');
    await p.waitForTimeout(200);
    const linhas = await p.locator('.livro__linha').count();
    if (linhas !== 3) throw new Error(`esperava 3 parcelas, achei ${linhas}`);
    const texto = await p.locator('.livro__rodape').innerText();
    if (!texto.includes('3.000,00')) throw new Error(`total errado: ${texto}`);
  });

  await passo('dar baixa e desfazer', async () => {
    await p.locator('.livro__linha').first().click();
    await p.getByRole('button', { name: 'Registrar pagamento' }).click();
    await p.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await aviso('Pagamento registrado');
    await p.locator('.carimbo-grande--pago').waitFor({ timeout: 3000 });
    await p.locator('.aviso button', { hasText: 'Desfazer' }).click();
    await p.getByRole('button', { name: 'Registrar pagamento' }).waitFor({ timeout: 3000 });
    await p.keyboard.press('Escape');
  });

  await passo('baixa em lote das 3 parcelas', async () => {
    await p.locator('.livro__cabeca input[type=checkbox]').check();
    await p.locator('.barra-lote').getByRole('button', { name: /Pagar/ }).click();
    await p.getByRole('button', { name: 'Confirmar pagamento' }).click();
    await aviso('títulos baixados');
  });

  await passo('importar XML de NF-e de exemplo (gera contas a pagar)', async () => {
    await p.goto(BASE + '#/notas');
    await p.getByRole('button', { name: 'Importar XML' }).click();
    const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Baixar XML de exemplo' }).click()]);
    const pasta = await mkdtemp(path.join(tmpdir(), 'prumo-'));
    const arquivo = path.join(pasta, download.suggestedFilename());
    await download.saveAs(arquivo);
    await p.locator('.bandeja input[type=file]').setInputFiles(arquivo);
    await p.getByText('Entrada · você é o destinatário').waitFor({ timeout: 4000 });
    await p.getByRole('button', { name: 'Importar 1 nota' }).click();
    await aviso('1 nota importada');
    await p.getByText('Contas a pagar desta nota').waitFor({ timeout: 4000 });
    const parcelas = await p.locator('.danfe .titulo-linha').count();
    if (parcelas !== 3) throw new Error(`esperava 3 contas geradas, achei ${parcelas}`);
  });

  await passo('importar a mesma nota de novo é bloqueado', async () => {
    await p.goto(BASE + '#/notas');
    await p.getByRole('button', { name: 'Importar XML' }).click();
    const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Baixar XML de exemplo' }).click()]);
    const pasta = await mkdtemp(path.join(tmpdir(), 'prumo-'));
    const arquivo = path.join(pasta, download.suggestedFilename());
    await download.saveAs(arquivo);
    await p.locator('.bandeja input[type=file]').setInputFiles(arquivo);
    await p.getByText('Já importada').waitFor({ timeout: 4000 });
    await p.keyboard.press('Escape');
  });

  await passo('caixa SEFAZ (simulada): dar ciência e importar', async () => {
    await p.goto(BASE + '#/notas?aba=sefaz');
    await p.getByRole('button', { name: 'Dar ciência e importar' }).first().click();
    await aviso('importada com');
  });

  await passo('busca rápida (Ctrl+K) encontra contato', async () => {
    await p.goto(BASE + '#/');
    await p.keyboard.press('Control+k');
    await p.keyboard.type('laje forte');
    await p.locator('.paleta__item', { hasText: 'Laje Forte' }).first().waitFor({ timeout: 3000 });
    await p.keyboard.press('Escape');
  });

  await passo('cadastrar usuário de consulta', async () => {
    await p.goto(BASE + '#/usuarios');
    await p.getByRole('button', { name: 'Novo usuário' }).click();
    await p.fill('#u-nome', 'Teste Fumaça');
    await p.fill('#u-email', 'teste.fumaca@exemplo.com');
    await p.locator('.papel', { hasText: 'Consulta' }).click();
    await p.fill('#u-senha', 'fumaca123');
    await p.getByRole('button', { name: 'Cadastrar usuário' }).click();
    await aviso('cadastrado');
    await p.getByText('teste.fumaca', { exact: true }).waitFor({ timeout: 3000 });
  });

  await passo('usuário de consulta entra e não pode lançar', async () => {
    await sair();
    await entrar('teste.fumaca', 'fumaca123');
    if (await p.getByRole('button', { name: 'Lançar' }).count()) throw new Error('botão Lançar visível para Consulta');
    await p.goto(BASE + '#/usuarios');
    await p.waitForTimeout(300);
    if (!p.url().endsWith('#/')) throw new Error('Consulta conseguiu abrir Usuários');
    await sair();
  });

  await passo('dados persistem após recarregar', async () => {
    await entrar('admin', 'admin123');
    await p.reload();
    await p.waitForSelector('.conteudo');
    await p.goto(BASE + '#/contas/pagar?periodo=quitados');
    await p.fill('input[aria-label="Buscar"]', 'fumaça');
    await p.waitForTimeout(200);
    const n = await p.locator('.livro__linha').count();
    if (n !== 3) throw new Error(`esperava 3 parcelas pagas após recarregar, achei ${n}`);
  });

  if (erros.length) resultados.push(['falhou', 'erros de JavaScript na página', [...new Set(erros)].join(' | ')]);
  await navegador.close();
} finally {
  servidor.kill();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(servidor.pid), '/T', '/F'], { stdio: 'ignore' });
}

const falhas = resultados.filter((r) => r[0] === 'falhou');
console.log(`\n${resultados.length - falhas.length}/${resultados.length} passos ok`);
for (const f of falhas) console.log('FALHA:', f[1], '—', f[2]);
process.exit(falhas.length ? 1 : 0);
