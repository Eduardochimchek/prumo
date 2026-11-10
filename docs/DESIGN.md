# Design system “Papel & Tinta”

A identidade do Prumo vem do ofício do financeiro: **papel, tinta de caneta, carimbo, livro-razão**. A execução é moderna (tipografia grande, muito respiro, linhas finas no lugar de sombras), para fugir tanto do ERP cinza das antigas quanto do “dashboard genérico de IA”.

## Princípios

1. **Cor é informação.** A marca é tinta sobre papel. Cor aparece quando significa algo.
2. **Texto antes de gráfico.** A manchete do dia diz o que importa; gráficos e tabelas detalham.
3. **Hierarquia por tipografia e linhas**, não por caixas com sombra.
4. **Status é carimbo**: rótulo em caixa alta, contorno de tinta. O “PAGO” grande tem textura de tinta e entra com animação de carimbada.
5. **Celular é primeira classe.** Navegação no polegar, diálogos que sobem de baixo.

## Tokens (src/styles/tokens.css)

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--papel` | `#f3f0e9` | `#11100d` | fundo da página |
| `--folha` | `#fbfaf6` | `#1a1915` | painéis, tabelas, gráficos |
| `--tinta` | `#17150f` | `#f1ede4` | texto principal, botão primário |
| `--tinta-2/3` | `#4a463d` / `#6c665a` | `#c9c2b3` / `#9d9688` | texto secundário / auxiliar |
| `--regua` | `#e3ded3` | `#2c2924` | linhas finas |
| `--entrada` | `#0b7550` | `#22966b` | dinheiro entrando |
| `--saida` | `#de6b2c` | `#d06a2e` | dinheiro saindo |
| `--critico` | `#b42318` | `#ff8a78` | vencido, erro, perigo |
| `--atencao` | `#8a5a00` | `#e7b651` | vence hoje, atenção |
| `--ok` | `#146c43` | `#5cc38f` | pago, autorizada |
| `--latao` | `#a87628` | `#d6a650` | marca (o peso do prumo) e “hoje” |
| `--caneta` | `#2546b5` | `#91a9ff` | links e anel de foco |

**Acessibilidade de cor:** o par entrada/saída foi validado com simulação de daltonismo (protanopia/deuteranopia, ΔE OKLab ≥ 8) e contraste ≥ 3:1 sobre a folha, nos dois temas. Saída é laranja (não vermelho) justamente para separar *sentido do dinheiro* de *problema* (vencido = vermelho). Nos gráficos, a posição (acima/abaixo da linha) também codifica o sentido.

## Tipografia

| Família | Papel |
|---|---|
| **Newsreader** (variável, com tamanho óptico) | Títulos de página, manchete do “Hoje”, prosa (ledes) |
| **Schibsted Grotesk** (variável) | Interface, botões, **todos os números** |
| **IBM Plex Mono** | Rótulos em caixa alta, chaves de acesso, CNPJ, códigos, carimbos |

Regras: números grandes isolados com algarismos proporcionais; colunas com `tabular-nums` (`.num`). Valores dentro de frases usam a sans com grifo colorido (`.grifo`); o texto continua na cor da tinta; a cor fica no traço.

## Componentes principais

- **Botões**: primário (tinta sólida), secundário (contorno), fantasma, perigo. Raio 6 px.
- **Campos**: 42 px de altura, borda fina, foco com anel azul-caneta. `EntradaMoeda` digita da direita para a esquerda (como app de banco).
- **Carimbo** (`.carimbo`): status em mono, caixa alta, contorno. Variantes: pago, vencido, hoje, aberto, cancelado, info, latão.
- **Livro** (`.livro`): lista de títulos agrupada por dia, com faixa de vencidos em vermelho, seleção em lote e barra de ações flutuante.
- **Camada** (`<dialog>` nativo): modal ou gaveta lateral; no celular, folha que sobe de baixo com alça.
- **Avisos**: tira escura no rodapé, com ação (“Desfazer”).
- **Paleta de comandos** (Ctrl+K / `/`).
- **Ícones**: conjunto próprio em `components/Icone.tsx` (grade 24, traço 1,6).

## Gráficos

- SVG feito à mão, medido em pixels reais (sem distorção de texto).
- **Um eixo só**; barras ≤ 24 px com ponta arredondada (4 px) e base reta; linhas de 2 px; grade sólida em linha fina; rótulos diretos só no que importa; legenda sempre que houver duas séries ou mais.
- Previsto = tom suave da mesma cor; saldo projetado = linha tracejada.
- Dica no hover **e** no foco do teclado; tabela equivalente disponível (Fluxo de caixa).

## Layout

- Desktop: cabeçalho em duas linhas como um jornal (marca, empresa, busca, “Lançar”, conta / seções com contadores). Conteúdo até 1320 px.
- Celular (< 1024 px): barra superior compacta + navegação inferior (Hoje, Contas, **+**, Notas, Mais).
- Páginas abrem com **rótulo + título serifado + lede** escrito a partir dos dados.

## O que evitamos (e por quê)

Inter, gradientes roxos, glassmorphism, grade de cartões ícone+título+texto, emojis, pílulas pastel, barra lateral genérica e bibliotecas de ícones genéricas: são os sinais mais citados de “interface gerada por IA” e deixam o produto com cara de modelo pronto. Também evitamos o oposto, telas densas e cinzas dos ERPs antigos.
