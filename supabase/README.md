# Banco de dados do Prumo (Supabase / Postgres)

Fase 1 do plano SaaS: servidor multiempresa. O isolamento entre empresas é garantido pelo próprio Postgres (row-level security), não pelo código do app.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `migrations/20261110000001_acesso.sql` | `empresas`, `perfis`, `membros` (pessoa × empresa × papel), `convites`, `auditoria`; funções `tem_acesso`, `tem_papel`, `criar_empresa`, `aceitar_convite`; proteção do último administrador |
| `migrations/20261110000002_financeiro.sql` | Tabelas do financeiro da V1 por empresa: `contatos`, `categorias`, `contas_bancarias`, `notas_fiscais`, `lancamentos`, `baixas`, `resumos_sefaz`, `atividades` |
| `tests/isolamento.test.ts` | Prova que uma empresa não lê nem grava nada de outra, papéis, convites, auditoria e uma trava que falha se alguma tabela ficar sem RLS |
| `tests/auth-local.sql` | Simula o schema `auth` do Supabase **só nos testes** |

## Regras para toda tabela nova

1. Coluna `empresa_id uuid not null references empresas (id)`.
2. `alter table … enable row level security` e políticas com `tem_acesso(empresa_id)` (ler) e `tem_papel(empresa_id, …)` (gravar).
3. Gatilhos `impede_troca_de_empresa` (antes de update) e `auditar` (depois de insert/update/delete).
4. Referência a outra tabela de negócio por chave composta `(id, empresa_id)`, nunca só pelo `id`.
5. Nada para o papel `anon`.
6. Migração nova = arquivo novo com data no nome. Nunca editar migração já aplicada em produção.

A trava em `tests/isolamento.test.ts` falha se os itens 2 e 5 forem esquecidos.

## Testar

```bash
npm test
```

Os testes de banco rodam no [PGlite](https://pglite.dev) (Postgres 18 dentro do Node): não precisa de Docker nem de conta no Supabase.

## Próximos passos da Fase 1 (precisam das contas)

- Criar o projeto no Supabase (região São Paulo) e aplicar as migrações com a CLI (`supabase link` e `supabase db push`).
- Ligar o login (e-mail e senha, confirmação, recuperação, MFA para administradores) e o cadastro de empresa no app.
- Trocar `src/data/store.ts` por um cliente Supabase com as mesmas assinaturas de `actions.ts`; o modo demonstração local continua.
- Publicar o site na Cloudflare Pages com cabeçalhos de segurança reais.
- A chave `service_role` nunca vai para o navegador: só para Edge Functions.
