// Capturas de tela do Prumo (desktop e celular) em docs/screenshots.
// Uso: npm run build && npm run screenshots
// Sobe o `vite preview`, entra como admin e fotografa as telas principais.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { abrirNavegador } from './browser.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const saida = path.join(raiz, 'docs', 'screenshots');
const PORTA = Number(process.env.PORTA ?? 4321);
const URL_BASE = `http://localhost:${PORTA}/`;
const so = process.argv.slice(2); // filtra por nome: node scripts/screenshots.mjs hoje contas

await mkdir(saida, { recursive: true });

const servidor = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'preview', '--port', String(PORTA), '--strictPort'], {
  cwd: raiz,
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(URL_BASE);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite preview não respondeu');
}

const telas = [
  { nome: 'hoje', rota: '#/' },
  { nome: 'vendas', rota: '#/vendas' },
  { nome: 'produtos', rota: '#/produtos' },
  { nome: 'contas-pagar', rota: '#/contas/pagar' },
  { nome: 'contas-receber', rota: '#/contas/receber?periodo=vencidos' },
  { nome: 'notas', rota: '#/notas' },
  { nome: 'notas-sefaz', rota: '#/notas?aba=sefaz' },
  { nome: 'fluxo', rota: '#/fluxo' },
  { nome: 'contatos', rota: '#/contatos' },
  { nome: 'relatorios', rota: '#/relatorios' },
  { nome: 'usuarios', rota: '#/usuarios' },
  { nome: 'configuracoes', rota: '#/configuracoes' },
];

async function entrar(pagina) {
  await pagina.goto(URL_BASE);
  await pagina.waitForSelector('#l-usuario');
  await pagina.fill('#l-usuario', 'reginaldo');
  await pagina.fill('#l-senha', 'reginaldo123');
  await pagina.click('button[type=submit]');
  await pagina.waitForSelector('.conteudo, .tela-cheia');
  if (await pagina.getByRole('button', { name: 'Entendi, vamos lá' }).count()) {
    await pagina.getByRole('button', { name: 'Entendi, vamos lá' }).click();
    await pagina.waitForSelector('.conteudo');
  }
  // o cartão de primeiros passos ganha uma captura própria e some das demais
  const cartao = pagina.locator('.boas-vindas');
  if (await cartao.count()) await cartao.screenshot({ path: path.join(saida, `primeiros-passos-${pagina.viewportSize().width > 600 ? 'desktop' : 'celular'}.png`) });
  // esconde o cartão de primeiros passos nas capturas
  await pagina.evaluate(() => Object.keys(localStorage).length >= 0 && document.querySelectorAll('.boas-vindas .btn').forEach((b) => b.click()));
}

const quer = (n) => so.length === 0 || so.some((s) => n.includes(s));

try {
  await esperarServidor();
  const navegador = await abrirNavegador();

  for (const modo of ['desktop', 'celular']) {
    const contexto = await navegador.newContext(
      modo === 'desktop'
        ? { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, locale: 'pt-BR', colorScheme: 'light' }
        : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', colorScheme: 'light' },
    );
    // relógio fixo às 9h40 de hoje: a manchete diz "Bom dia" e as capturas ficam estáveis
    const manha = new Date();
    manha.setHours(9, 40, 0, 0);
    await contexto.clock.setFixedTime(manha);
    const pagina = await contexto.newPage();
    const erros = [];
    pagina.on('pageerror', (e) => erros.push(e.message));
    pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()));

    if (quer(`login-${modo}`)) {
      await pagina.goto(URL_BASE);
      await pagina.waitForSelector('#l-usuario');
      await pagina.waitForTimeout(3800); // deixa o prumo assentar
      await pagina.screenshot({ path: path.join(saida, `login-${modo}.png`), fullPage: modo === 'celular' });
    }
    await entrar(pagina);
    for (const t of telas) {
      if (!quer(`${t.nome}-${modo}`)) continue;
      await pagina.goto(URL_BASE + t.rota);
      await pagina.waitForTimeout(650);
      await pagina.screenshot({ path: path.join(saida, `${t.nome}-${modo}-tela.png`) });
      await pagina.screenshot({ path: path.join(saida, `${t.nome}-${modo}.png`), fullPage: true });
      console.log('ok', `${t.nome}-${modo}`);
    }

    if (quer(`dialogos-${modo}`)) {
      // detalhe de título pago + formulário de nova conta
      await pagina.goto(URL_BASE + '#/contas/pagar?periodo=quitados');
      await pagina.waitForTimeout(400);
      await pagina.click('.livro__linha');
      await pagina.waitForTimeout(500);
      await pagina.screenshot({ path: path.join(saida, `detalhe-pago-${modo}.png`) });
      await pagina.keyboard.press('Escape');
      await pagina.waitForTimeout(300);
      await pagina.goto(URL_BASE + '#/notas');
      await pagina.waitForTimeout(300);
      await pagina.click('.razao tbody tr');
      await pagina.waitForTimeout(500);
      await pagina.screenshot({ path: path.join(saida, `nota-detalhe-${modo}-tela.png`) });
      await pagina.screenshot({ path: path.join(saida, `nota-detalhe-${modo}.png`), fullPage: true });
      await pagina.goto(URL_BASE + '#/');
      await pagina.waitForTimeout(300);
      await pagina.keyboard.press('Control+k');
      await pagina.waitForTimeout(200);
      await pagina.keyboard.type('alug');
      await pagina.waitForTimeout(300);
      await pagina.screenshot({ path: path.join(saida, `paleta-${modo}.png`) });
      await pagina.keyboard.press('Escape');
      console.log('ok', `dialogos-${modo}`);
    }

    if (quer(`faturamento-${modo}`)) {
      // pedido aprovado, formulário de orçamento e boleto/PIX de uma venda faturada
      await pagina.goto(URL_BASE + '#/vendas?aba=pedido');
      await pagina.waitForTimeout(300);
      await pagina.click('.razao tbody tr');
      await pagina.waitForTimeout(400);
      await pagina.screenshot({ path: path.join(saida, `venda-pedido-${modo}.png`), fullPage: true });
      await pagina.goto(URL_BASE + '#/vendas');
      await pagina.waitForTimeout(300);
      await pagina.locator('.pagina-cabeca').getByRole('button', { name: 'Novo orçamento' }).click();
      await pagina.selectOption('#o-cliente', { label: 'Laje Forte' });
      for (const i of [1, 4, 21]) await pagina.locator('select[aria-label="Adicionar item"]').selectOption({ index: i });
      await pagina.waitForTimeout(400);
      await pagina.screenshot({ path: path.join(saida, `orcamento-form-${modo}.png`) });
      await pagina.keyboard.press('Escape');
      await pagina.goto(URL_BASE + '#/vendas?aba=faturada');
      await pagina.waitForTimeout(300);
      await pagina.click('.razao tbody tr');
      await pagina.waitForTimeout(400);
      await pagina.screenshot({ path: path.join(saida, `venda-faturada-${modo}.png`), fullPage: true });
      const aberta = pagina.locator('.danfe .titulo-linha', { hasNotText: 'Recebido' }).first();
      if (await aberta.count()) {
        await aberta.locator('.titulo-linha__principal').click();
        await pagina.waitForTimeout(300);
        await pagina.getByRole('button', { name: /boleto\/PIX/ }).click();
        await pagina.waitForTimeout(500);
        await pagina.screenshot({ path: path.join(saida, `cobranca-${modo}.png`) });
      }
      console.log('ok', `faturamento-${modo}`);
    }

    if (quer(`escuro-${modo}`)) {
      await pagina.evaluate(() => localStorage.setItem('prumo:tema', 'escuro'));
      await pagina.goto(URL_BASE + '#/');
      await pagina.reload();
      await pagina.waitForTimeout(700);
      await pagina.screenshot({ path: path.join(saida, `hoje-escuro-${modo}-tela.png`) });
      await pagina.screenshot({ path: path.join(saida, `hoje-escuro-${modo}.png`), fullPage: true });
      await pagina.evaluate(() => localStorage.removeItem('prumo:tema'));
      console.log('ok', `escuro-${modo}`);
    }

    if (erros.length) console.log(`ERROS no console (${modo}):\n  ` + [...new Set(erros)].join('\n  '));
    await contexto.close();
  }
  await navegador.close();
} finally {
  servidor.kill();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(servidor.pid), '/T', '/F'], { stdio: 'ignore' });
}
