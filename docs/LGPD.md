# LGPD no Prumo

Este documento resume como o Prumo atende à Lei Geral de Proteção de Dados (Lei 13.709/2018) e o que falta para a versão com servidor. Não substitui orientação jurídica: antes de vender, revise com um advogado especializado.

## Papéis

- **Controladora**: a empresa cliente que usa o Prumo (decide o que lançar e por quê).
- **Operador**: o Prumo, quando houver servidor (V2). Na V1 não há operador: os dados não saem do aparelho.
- **Encarregado (DPO)**: cada empresa cliente indica o seu. Quando o Prumo virar produto, indicar o encarregado do Prumo como operador e publicar o contato.

## Inventário de dados (registro das operações de tratamento, art. 37)

| Dado | Titular | Finalidade | Base legal | Retenção |
|---|---|---|---|---|
| Nome, e-mail, login, cargo, telefone, hash da senha | Usuários do sistema | Acesso e autoria das ações | Execução de contrato / legítimo interesse (art. 7º, V e IX) | Enquanto o usuário existir; apagados na exclusão |
| Registro de atividades e de segurança | Usuários | Auditoria e segurança (art. 46) | Legítimo interesse | Junto com os registros financeiros; nome removido na exclusão do usuário |
| Nome/razão social, CPF/CNPJ, e-mail, telefone, endereço | Clientes e fornecedores | Contas a pagar e a receber, notas | Execução de contrato / obrigação legal (art. 7º, II e V) | Enquanto houver relação + prazo fiscal; anonimizáveis a pedido |
| Orçamentos, pedidos e cobranças (boleto/PIX) | Clientes | Vender, emitir a nota e cobrar | Execução de contrato (art. 7º, V) | Faturados: junto com a nota (prazo fiscal). Orçamentos recusados podem ser apagados; guardam só a referência ao cliente, então a anonimização do contato vale para eles |
| Notas fiscais e títulos | Clientes e fornecedores | Obrigações fiscais e financeiras | Obrigação legal (art. 7º, II) | Em regra 5 anos (prescrição tributária, CTN arts. 173 e 174) |

Dados sensíveis (art. 11): **nenhum**. O Prumo não pede saúde, religião, biometria etc. Não há dados de crianças.

## Direitos do titular (art. 18) e onde estão no sistema

| Direito | Como exercer | Onde no código |
|---|---|---|
| Confirmação e acesso | Configurações → Privacidade → Baixar meus dados | `exportarMeusDados` |
| Correção | Configurações → Meu perfil | `editarMeuPerfil` |
| Portabilidade | Mesmo arquivo JSON de “Baixar meus dados” (formato aberto) | `exportarMeusDados` |
| Eliminação | Configurações → Privacidade → Excluir minha conta (confirma com a senha) | `excluirMinhaConta` |
| Eliminação por terceiro (admin) | Usuários → excluir | `excluirUsuario` |
| Anonimização de cliente/fornecedor | Ficha do contato → Anonimizar | `anonimizarContato` |
| Informação sobre compartilhamento | Aviso de privacidade (`/privacidade`) e aviso no 1º acesso | `pages/Privacidade.tsx` |

**Exclusão × guarda obrigatória (art. 16, I):** apagar uma pessoa não apaga os registros financeiros que a lei manda guardar. O sistema separa as duas coisas: o dado pessoal some (ou é anonimizado) e o lançamento fica, sem identificar a pessoa.

## Princípios aplicados (art. 6º)

- **Finalidade e necessidade (minimização):** só os campos necessários; CPF de pessoa física aparece parcialmente nas listas (`***.982.247-**`) e por inteiro só para quem cadastra contatos.
- **Transparência:** aviso de privacidade público e aviso no primeiro acesso, com registro de ciência (`aceitouPrivacidadeEm`).
- **Segurança e prevenção:** ver [SECURITY.md](../SECURITY.md).
- **Responsabilização:** trilha de atividades e registro de segurança/privacidade (entradas, bloqueios, trocas de senha, exportações, exclusões).
- **Não discriminação:** sem perfilamento nem decisões automatizadas.

## Compartilhamento

- BrasilAPI: recebe só o CNPJ ou o CEP digitado, para consulta pública. Nenhum outro dado é enviado.
- Nenhum serviço de analytics, anúncios ou fontes externas.

## Incidentes (art. 48)

V1: os dados estão no aparelho do cliente. Orientação: trocar senhas, revisar o registro de segurança e restaurar o backup se necessário.

V2 (plano): detectar e conter; avaliar risco aos titulares; comunicar a ANPD e os titulares em prazo razoável quando houver risco ou dano relevante (seguindo a regulamentação da ANPD, que fixa prazo em dias úteis); registrar o incidente e as medidas tomadas.

## Pendências para a V2 (com servidor)

1. Contrato de operador (DPA) com os clientes e com fornecedores de nuvem.
2. Encarregado do Prumo publicado e canal de atendimento ao titular com prazo de resposta.
3. Criptografia em repouso, backups criptografados com prazo de descarte.
4. Rotina de descarte automático após o prazo de retenção, por empresa.
5. Relatório de impacto (RIPD) se o volume ou o tipo de dado justificar.
6. Termos de uso e política de privacidade revisados por advogado.
