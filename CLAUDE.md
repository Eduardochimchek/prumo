# CLAUDE.md do Prumo

Guia para quem for evoluir este repositório (Claude Code ou pessoa). Leia antes de mexer. Mantenha este arquivo atualizado quando uma regra mudar.

## O que é o Prumo

Sistema **financeiro-administrativo** (não contábil) para pequenas e médias empresas brasileiras. O dono do produto é **Reginaldo Jeronimo** (sem acento), profissional do financeiro administrativo; o repositório é mantido pelo filho dele. A meta é virar um produto vendável.

O usuário típico paga boletos, confere notas de fornecedores, cobra clientes, acompanha o caixa e repassa informação ao contador. **Não é um ERP de estoque nem um sistema contábil**: não fazemos lançamentos de partidas dobradas, SPED, folha de pagamento ou apuração de impostos.

Estado atual: **V1 local-first** (dados no `localStorage` do navegador), publicada como demonstração no GitHub Pages. Próximo grande passo: V2 com backend e SEFAZ real (ver `docs/PRODUTO.md` e `docs/SEFAZ.md`).

## Comandos

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit (TypeScript 7)
npm test             # vitest (unitários)
npm run build        # typecheck + build de produção em dist/
npm run smoke        # ponta a ponta no navegador (precisa de build antes)
npm run screenshots  # capturas em docs/screenshots (precisa de build antes)
npm run verificar    # typecheck + test + build + smoke (rode antes de cada commit
```

`smoke` e `screenshots` usam Edge/Chrome instalados via `playwright-core` (`scripts/browser.mjs`). No Git Bash do Windows, argumentos que começam com `/` ou `#/` viram caminhos; use `MSYS_NO_PATHCONV=1`.

## Regras do projeto (obrigatórias)

### Idioma
- Interface, mensagens, documentação e commits em **português do Brasil**.
- Identificadores do código também em português (`lancamento`, `darBaixa`, `contaPara`), seguindo o que já existe. Termos técnicos consagrados podem ficar em inglês (`store`, `hook`, `props`).
- **Nunca use travessão (—)** em texto nenhum (interface, docs, commits, comentários): o dono acha que dá cara de texto de IA. Use vírgula, dois-pontos, ponto ou parênteses; para campo vazio, `-`.
- Texto da interface: direto, de gente para gente (“Registrar pagamento”, “Vence hoje”), sem jargão de TI e sem marketing genérico.

### Domínio
- **Dinheiro é sempre inteiro em centavos** (`R$ 1.234,56` = `123456`). Nunca `float` para valores. Formate só na borda com `moeda()` (`src/lib/format.ts`).
- **Datas de negócio são texto `YYYY-MM-DD`** (vencimento, emissão, baixa). Use `src/lib/dates.ts` (`parseISO`, `addDias`, `addMeses`…). Nunca `new Date('2026-11-09')` (vira UTC e muda o dia). Carimbos de data/hora (`criadoEm`) são ISO completo.
- **CNPJ pode ser alfanumérico** (formato emitido desde jul/2026). Use `normalizarCnpj`, `cnpjValido`, `mascaraCnpj`. Nunca assuma que CNPJ só tem dígitos nem use `\D` para limpá-lo.
- **Status de título é derivado** (`statusDe()` em `selectors.ts`): pago, vencido, hoje, aberto, cancelado. Não grave status.
- **Sentido da nota pelo CNPJ da empresa** (`direcaoDaNota`): destinatário = entrada/compra → contas a pagar; emitente = saída/venda → contas a receber.
- Notas autorizadas geram títulos pelas **duplicatas** (`<cobr><dup>`); sem duplicata, um título à vista.
- Toda escrita passa por `src/data/actions.ts` (valida regra, grava com `atualizar()`, registra `Atividade`). **Componentes não alteram o banco diretamente.**
- Leituras derivadas ficam em `src/data/selectors.ts` (puras, sem efeitos). Derive com `useMemo` a partir de `useDb()`.
- Permissões por papel em `src/auth/auth.tsx` (`pode('lancar' | 'baixar' | 'importar' | 'contatos' | 'usuarios' | 'config')`). Toda ação nova precisa de checagem na UI **e** a regra correspondente documentada.
- Base de demonstração (`seed.ts`) é **determinística e relativa a hoje**: use só o gerador `aleatorio(semente)`; nada de `Math.random`, `Date.now` em valores, nem `sort(() => random)` (o resultado muda entre navegadores, use `r.embaralhar`). Nomes, CNPJs e valores são fictícios.
- Mudou o formato do banco? Incremente `VERSAO_BANCO` em `store.ts` e trate a migração (hoje a versão incompatível recria a demonstração).

### Segurança e LGPD (ver `SECURITY.md` e `docs/LGPD.md`)
- Senha: só via `avaliarSenha` + `hashSenha(senha, sal, ITERACOES_SENHA)`; guarde `senhaIteracoes`. Nunca logue, exporte ou mostre hash/sal.
- Login passa por `entrar()` (bloqueio por tentativas, mensagem genérica). Não crie atalhos que pulem `conferirSenha`.
- Dado pessoal novo? Registre no inventário de `docs/LGPD.md` (finalidade, base legal, retenção) e inclua em `exportarMeusDados`/anonimização.
- Excluir pessoa = apagar/anonimizar dado pessoal **sem** apagar registro financeiro de guarda obrigatória.
- Eventos de segurança/privacidade usam os tipos de atividade `seguranca`/`privacidade` (não aparecem no feed do “Hoje”).
- Nada de `innerHTML`, `dangerouslySetInnerHTML`, `eval`, script inline ou CDN externo (a CSP do build bloqueia). Domínio externo novo? Adicione no `connect-src` do `vite.config.ts` e no aviso de privacidade.
- Exportações passam por `gerarCsv` (neutraliza fórmulas). Uploads respeitam os limites de `lib/util.ts`.
- Mostre CPF de pessoa física com `documentoProtegido` nas listas.

### Design (“Papel & Tinta”; ver `docs/DESIGN.md`)
- Use os **tokens** de `src/styles/tokens.css` (`--tinta`, `--folha`, `--entrada`, `--saida`, `--critico`…). Não escreva cores soltas nos componentes.
- **Cor é informação**: verde = entrada, laranja = saída, vermelho = vencido/erro, âmbar = atenção/vence hoje, latão = marca/hoje. Status sempre com rótulo (carimbo), nunca só cor.
- Tipografia: **Newsreader** (títulos, manchetes, prosa), **Schibsted Grotesk** (interface e números), **IBM Plex Mono** (códigos, chaves, rótulos em caixa alta). Números grandes isolados: algarismos proporcionais; colunas de tabela: `tabular-nums` (classe `.num`).
- Proibido (cara de “tela gerada por IA”/ERP antigo): fonte Inter, gradiente roxo/azul, glassmorphism, grade de cartões ícone+título+texto, emojis na interface, barra lateral genérica, pílulas pastel para status, bibliotecas de ícones genéricas (temos `components/Icone.tsx`), Tailwind/shadcn.
- Gráficos: SVG próprio, **um eixo só**, barras ≤ 24 px com ponta arredondada de 4 px, linhas de 2 px, grade em linha fina sólida, legenda + rótulo direto seletivo, dica no hover/foco e tabela equivalente. Paleta nova de dados? Valide para daltonismo antes.
- **Mobile é obrigatório**: confira toda tela em 390 px (sem rolagem horizontal da página, grids de uma coluna com `minmax(0, 1fr)`; flex em coluna sem `wrap`). Diálogos viram folha que sobe de baixo.
- Diálogos usam `<dialog>` nativo via `components/Camada.tsx`. Avisos (toasts) são renderizados dentro do diálogo aberto (senão ficam inertes); use `useAvisos()`.
- Tema escuro precisa continuar funcionando (tokens redefinidos em `tokens.css`).

### Qualidade
- Antes de commitar: `npm run verificar` verde. Mudança visual: rode `npm run screenshots` e olhe as imagens (desktop e celular).
- Lógica nova em `src/lib` ou `src/data` ganha teste em Vitest. Fluxo novo importante ganha passo no `scripts/smoke.mjs`.
- TypeScript estrito; sem `any` desnecessário; sem dependência nova sem motivo forte (o bundle é enxuto de propósito).
- Não quebre a demonstração online: o push na `main` publica no GitHub Pages automaticamente.

### Git
- Commits pequenos, mensagem em português no imperativo (“Adiciona conciliação OFX”, “Corrige vencimento em ano bissexto”).
- `main` = produção da demonstração. Trabalho grande em branch + PR.

## Mapa do código

| Onde | O quê |
|---|---|
| `src/data/types.ts` | Modelo de domínio (vai virar o contrato da API na V2) |
| `src/data/store.ts` | Persistência local + `useDb()`; backup/restauração |
| `src/data/actions.ts` | Casos de uso (escritas) + trilha de atividade |
| `src/data/selectors.ts` | Status, saldos, agenda, fluxo, projeção, DRE, busca |
| `src/data/seed.ts` | Demonstração: loja fictícia em Porto Alegre/RS |
| `src/lib/boleto.ts` | Linha digitável (47/48 dígitos) e código de barras |
| `src/lib/nfe/` | Chave de acesso, leitor de XML (`lerXmlNFe`), XML de exemplo |
| `src/lib/br.ts` | CNPJ (alfanumérico), CPF, máscaras, UFs (código IBGE), bancos |
| `src/lib/seguranca.ts` | Política de senha, bloqueio por tentativas, expiração de sessão |
| `src/pages/Privacidade.tsx` | Aviso de privacidade e termos (público) |
| `src/components/TelasObrigatorias.tsx` | Troca de senha provisória e aviso de privacidade no 1º acesso |
| `src/services/brasilapi.ts` | CNPJ e CEP públicos (CORS liberado) |
| `src/services/sefaz.ts` | Interface `ProvedorSefaz` + implementação simulada |
| `src/components/Acoes.tsx` | Central de diálogos globais (novo lançamento, baixa, detalhe, contato, importar, paleta) |
| `src/layout/AppShell.tsx` | Cabeçalho desktop + navegação do celular |
| `src/pages/*` | Telas (uma por rota) |
| `src/styles/*` | tokens → base → components → shell → pages |

## Glossário do financeiro

- **Título / lançamento**: uma conta a pagar ou a receber. **Baixa**: registrar que foi paga/recebida (data, conta, juros, desconto). **Estorno**: desfazer a baixa.
- **Duplicata**: parcela de cobrança de uma nota (`<dup>`), vira um título. **Competência**: mês a que a despesa/receita se refere (para o DRE).
- **NF-e** (modelo 55), **NFC-e** (65), **CT-e** (57), **NFS-e** (serviço, municipal/nacional). **DANFE**: a representação impressa da NF-e.
- **Chave de acesso**: 44 posições: UF, AAMM, CNPJ, modelo, série, número, tipo de emissão, código, DV.
- **Manifestação do destinatário**: ciência, confirmação, desconhecimento ou operação não realizada: eventos que a empresa registra sobre notas emitidas contra o seu CNPJ. **Distribuição DF-e**: serviço da SEFAZ que entrega essas notas.
- **DAS**: guia do Simples Nacional. **DRE gerencial**: receitas − despesas por categoria, por caixa ou competência.
- **Linha digitável**: o código numérico do boleto (47 dígitos bancário, 48 arrecadação). **Fator de vencimento**: dias desde 07/10/1997, reiniciado em 1000 no dia 22/02/2025.

## Próximos passos sugeridos

1. Backend (V2): API Node + PostgreSQL implementando `types.ts`; trocar `store.ts` por cliente HTTP; autenticação com Argon2id e sessão httpOnly; multiempresa.
2. SEFAZ real (ver `docs/SEFAZ.md`): certificado A1 no servidor, Distribuição DF-e por NSU, manifestação, guardar XML.
3. Conciliação bancária (OFX/CNAB) e transferências entre contas.
4. Cobrança (lembretes, boleto/PIX via banco), centros de custo, aprovação em alçadas.
