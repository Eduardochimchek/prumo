# Prumo: visão de produto

## Em uma frase

O financeiro da empresa num lugar só, que **avisa antes do problema**: o que vence, o que atrasou e como o caixa vai estar nas próximas semanas, no computador e no celular.

## O problema

Em boa parte das pequenas e médias empresas o financeiro vive entre:

- **Planilhas** que só uma pessoa entende, sem histórico de quem mudou o quê.
- **ERPs antigos**: telas cinzas, menus em árvore, dezenas de cliques para dar baixa num boleto, nada funciona no celular.
- **Notas fiscais que chegam por e-mail** (quando chegam): alguém digita à mão as duplicatas como contas a pagar; nota emitida indevidamente contra o CNPJ passa despercebida.
- **Fluxo de caixa feito no fim do mês**, quando já não dá para reagir.

## Para quem

| Perfil | O que precisa | Como o Prumo ajuda |
|---|---|---|
| **Financeiro / administrativo** (o usuário principal, perfil do Reginaldo) | Pagar em dia, cobrar, conferir notas, saber o caixa | Painel “Hoje”, baixa em um toque, boleto lido sozinho, XML vira contas |
| **Dono / diretor** | Saber se a empresa está bem, sem abrir planilha | Manchete do dia, saldo e projeção no celular, DRE gerencial |
| **Analista / assistente** | Lançar e baixar com segurança | Permissão “Financeiro”, histórico de quem fez o quê, desfazer |
| **Contador** | Receber os dados organizados | Acesso “Consulta” e planilhas prontas (lançamentos, notas, contatos) |

Segmentos com mais aderência: comércio (varejo e atacado), distribuidoras, prestadores de serviço com notas de compra, construção. Empresas de 3 a 100 funcionários, do Simples Nacional ao Lucro Presumido.

## Escopo da V1 (entregue)

Ver a lista completa no [README](../README.md#o-que-a-v1-já-faz). Em resumo: painel do dia, contas a pagar/receber com boleto e parcelamento, NF-e por XML (e caixa SEFAZ simulada), fluxo de caixa projetado, DRE, cadastros com CNPJ da Receita, usuários com permissões, PWA e tema escuro.

**Demonstração de faturamento (nov/2026):** produtos e serviços, orçamento → pedido → NF-e simulada → contas a receber parceladas → boleto/PIX simulado com baixa automática. Serve para mostrar o fluxo completo e ouvir o dono antes da V2; a emissão real entra pela interface `ProvedorFiscal` (Fase 3 do plano SaaS).

**Novidades de nov/2026 (a partir da pesquisa de mercado):** conferência do boleto antes de pagar (repetido, já pago, valor diferente da nota, banco trocado), aprovação de pagamentos acima de um valor, cobrança pelo WhatsApp com mensagem pronta, importação de planilha (copiar e colar do Excel), simulador “E se…?” no fluxo de caixa e retiradas dos sócios separadas no DRE.

**Fora do escopo de propósito:** contabilidade (partidas dobradas, SPED), folha de pagamento, estoque, apuração de impostos. O Prumo conversa com quem faz isso (contador, ERP de estoque), não compete.

## Princípios

1. **Número antes de texto.** O que importa aparece como número grande, com cor e rótulo, e leva à lista certa (pedido do Reginaldo, nov/2026: “muita informação escrita”).
2. **Uma ação comum = um toque.** Dar baixa, lançar, importar nota, buscar (Ctrl+K).
3. **Nada some.** Cancelar em vez de apagar, estorno com histórico, “Desfazer” logo após a ação, trilha de atividade.
4. **Celular de verdade**, não “versão reduzida”.
5. **Honesto com o usuário**: o que é simulação aparece como simulação.

## Roadmap

### V2: a equipe usando de verdade
- Backend + banco de dados na nuvem; login seguro; dados compartilhados entre usuários e aparelhos; **multiempresa** (escritórios que atendem várias empresas).
- **SEFAZ real** com certificado A1: notas emitidas contra o CNPJ chegam sozinhas, manifestação, situação da nota, XML guardado e DANFE em PDF.
- **Conciliação bancária** (OFX/CNAB) e transferências entre contas.
- Cobrança: régua de lembretes automática (e-mail/WhatsApp), boleto e PIX via banco, Pix Automático.
- DDA e extrato pelo Open Finance (boletos e movimentos chegam sozinhos).
- Anexos (comprovantes, boletos em PDF) nos títulos.

### V3: produto
- Assinatura e planos, onboarding guiado.
- Centros de custo, orçamento × realizado, alçadas de aprovação em mais de um nível.
- NFS-e (padrão nacional), campos de IBS/CBS da reforma tributária.
- Portal do contador; integrações com ERPs de estoque.

## Ideias de modelo de negócio (para validar)

- **Assinatura mensal por empresa**, com faixas por número de usuários e de notas/mês.
- Plano para **escritórios de BPO financeiro e contabilidades** (multiempresa), cobrado por empresa atendida.
- Diferenciais para vender: só o financeiro (sem pagar por um ERP inteiro), nota que vira conta sozinha, conferência do boleto contra golpe, previsão de caixa com simulador, cobrança pelo WhatsApp, funciona no celular, visual que não parece sistema antigo.
- O que as reclamações dos concorrentes ensinam sobre preço (Reclame Aqui, 2026): reajuste alto na renovação, plano só anual, cancelamento difícil e preço que sobe com o faturamento. O Prumo deve ter plano mensal, sem fidelidade, cancelamento em um clique e preço claro.
- Concorrentes conhecidos no Brasil para estudar posicionamento e preço: Conta Azul, Omie, Nibo, Granatum, Bling, Tiny, Asaas (cobrança). O Prumo não precisa ganhar em tudo: ganha em **simplicidade, notas fiscais e previsão de caixa**.

## Como medir se está dando certo

- Tempo para lançar uma nota de compra (meta: < 30 s com XML).
- % de títulos baixados no dia do vencimento.
- Quantas vezes por semana o dono abre o painel no celular.
- Contas vencidas esquecidas por mês (meta: zero).

## Nome

**Prumo**: “pôr a empresa no prumo”. Antes de lançar comercialmente: busca no INPI (classes 9 e 42), domínio (.com.br / .app) e redes sociais. Alternativas: Lastro, Tino, Fecho.
