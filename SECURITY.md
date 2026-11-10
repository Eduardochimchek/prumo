# Segurança

## Como avisar sobre uma falha

Encontrou uma vulnerabilidade? **Não abra uma issue pública.** Use o botão “Report a vulnerability” na aba *Security* deste repositório (relato privado do GitHub). Respondemos em até 5 dias úteis.

## Versões

| Versão | Suporte |
|---|---|
| 0.1 (V1, demonstração local) | sim |

## O que já está protegido (V1)

| Risco comum em apps feitos às pressas | Como o Prumo trata |
|---|---|
| Chaves e senhas no código ou no repositório | Não existem segredos no projeto (V1 não tem servidor). Varredura de segredos e proteção de push ligadas no GitHub. |
| Senha guardada fraca | Hash SHA-256 com sal aleatório e 20.000 iterações; hashes antigos são refeitos no login. Comparação em tempo constante. |
| Força bruta no login | Bloqueio após 5 erros (1, 2, 4… até 15 min). Mesma mensagem para usuário inexistente e senha errada. |
| Senha fraca | Mínimo de 8 caracteres com letras e números, sem nome/login, sem senhas comuns; medidor de força. |
| Senha provisória esquecida | Senha criada por administrador obriga troca no primeiro acesso. |
| Sessão aberta em computador alheio | Encerra após 30 min sem uso (ou 30 dias com “manter conectado”). |
| Falta de controle de acesso | Três papéis (Administrador, Financeiro, Consulta) checados na interface e nas ações; testes ponta a ponta cobrem o papel Consulta. |
| XSS / injeção de script | React escapa todo texto; nenhum `innerHTML`/`eval`; CSP só permite script do próprio site. |
| Clickjacking | Script impede abrir o Prumo dentro de outro site. |
| Planilha maliciosa (CSV injection) | Células que começam com `=`, `+`, `-`, `@` são neutralizadas na exportação. |
| Upload perigoso | XML até 5 MB e 50 arquivos por vez, lido como dados (sem executar nada); backup até 25 MB com validação de estrutura. |
| Erro expondo detalhes técnicos | Tela amigável de erro; nada de pilha de chamadas para o usuário. |
| Dependência vulnerável ou pacote inventado pela IA | Só dependências conhecidas e fixadas no `package-lock.json`; `npm audit` no CI e Dependabot semanal. |
| Rastreamento por terceiros | Fontes e código servidos pelo próprio site; só CNPJ/CEP vão para a BrasilAPI. |

## Limites conhecidos da V1

- Os dados ficam no navegador: quem tem acesso ao computador e às ferramentas do desenvolvedor consegue ler o `localStorage`. Por isso a V1 é para demonstração; a V2 leva os dados para um servidor.
- GitHub Pages não permite cabeçalhos HTTP próprios: a CSP vai como `<meta>` e não há `frame-ancestors` nem HSTS configuráveis.

## Para a V2 (servidor) — obrigatório antes de dados reais em produção

- Autenticação no servidor com Argon2id, sessão em cookie `httpOnly`/`Secure`/`SameSite`, proteção CSRF, MFA para administradores.
- Isolamento por empresa em **toda** consulta (multi-tenant) e checagem de dono em cada recurso (evitar IDOR); política “negar por padrão”.
- Rate limiting por IP e por conta, cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, X-Content-Type-Options), CORS restrito ao domínio do Prumo.
- Segredos em cofre (variáveis de ambiente/KMS), certificado A1 criptografado, rotação de chaves.
- Criptografia em trânsito (TLS) e em repouso; backups criptografados e testados.
- Logs sem dados pessoais; monitoramento e alerta de incidentes; pentest antes do lançamento comercial.
