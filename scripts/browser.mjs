// Abre o navegador já instalado na máquina (Edge ou Chrome) via playwright-core,
// sem baixar navegadores. Usado pelos scripts de ícones e de capturas de tela.
import { chromium } from 'playwright-core';

export async function abrirNavegador() {
  const canais = [process.env.PRUMO_BROWSER, 'msedge', 'chrome'].filter(Boolean);
  let ultimoErro;
  for (const channel of canais) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw new Error(`Não encontrei Edge nem Chrome instalados. Defina PRUMO_BROWSER. Detalhe: ${ultimoErro?.message}`);
}
