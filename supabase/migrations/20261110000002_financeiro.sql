-- Prumo · Fase 1 · tabelas do financeiro (as mesmas da V1 local, agora por empresa)
--
-- Convenções: dinheiro em CENTAVOS (bigint); datas de negócio em date; empresa_id em toda tabela.
-- Referências entre tabelas usam (id, empresa_id), então um lançamento nunca aponta para o
-- contato ou a conta de outra empresa, mesmo que alguém tente forçar o id.

create table contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  tipo text not null check (tipo in ('cliente', 'fornecedor', 'ambos')),
  nome text not null check (length(trim(nome)) > 0),
  fantasia text,
  documento text not null default '',
  email text,
  telefone text,
  cep text,
  endereco text,
  cidade text,
  uf char(2),
  observacoes text,
  criado_em timestamptz not null default now(),
  anonimizado_em timestamptz,
  unique (id, empresa_id)
);
create unique index contatos_documento_unico on contatos (empresa_id, documento) where documento <> '';

create table categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null check (tipo in ('receita', 'despesa')),
  unique (id, empresa_id)
);

create table contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  banco_codigo text,
  agencia text,
  numero text,
  tipo text not null check (tipo in ('corrente', 'poupanca', 'caixa', 'investimento')),
  saldo_inicial bigint not null default 0,
  saldo_inicial_em date not null default current_date,
  ativa boolean not null default true,
  unique (id, empresa_id)
);

create table notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  chave text not null check (length(chave) = 44),
  modelo text not null,
  serie text not null,
  numero text not null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  natureza_operacao text,
  emissao timestamptz not null,
  emitente jsonb not null,
  destinatario jsonb not null,
  itens jsonb not null default '[]',
  totais jsonb not null,
  duplicatas jsonb not null default '[]',
  situacao text not null check (situacao in ('autorizada', 'cancelada', 'denegada', 'sem_protocolo')),
  protocolo text,
  origem text not null check (origem in ('xml', 'sefaz', 'manual', 'emitida')),
  contato_id uuid,
  importada_em timestamptz not null default now(),
  importada_por uuid references auth.users (id) on delete set null,
  unique (id, empresa_id),
  unique (empresa_id, chave),
  foreign key (contato_id, empresa_id) references contatos (id, empresa_id)
);

create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  tipo text not null check (tipo in ('pagar', 'receber')),
  descricao text not null check (length(trim(descricao)) > 0),
  contato_id uuid,
  categoria_id uuid,
  conta_id uuid,
  valor bigint not null check (valor > 0),
  emissao date not null default current_date,
  vencimento date not null,
  competencia char(7) not null check (competencia ~ '^\d{4}-\d{2}$'),
  documento text,
  parcela_n int,
  parcela_de int,
  grupo_id uuid,
  forma text check (forma in ('boleto', 'pix', 'transferencia', 'cartao', 'dinheiro', 'debito', 'cheque')),
  linha_digitavel text,
  nota_id uuid,
  cancelado boolean not null default false,
  observacoes text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz,
  unique (id, empresa_id),
  foreign key (contato_id, empresa_id) references contatos (id, empresa_id),
  foreign key (categoria_id, empresa_id) references categorias (id, empresa_id),
  foreign key (conta_id, empresa_id) references contas_bancarias (id, empresa_id),
  foreign key (nota_id, empresa_id) references notas_fiscais (id, empresa_id)
);
create index lancamentos_vencimento on lancamentos (empresa_id, vencimento) where not cancelado;

-- A baixa vira tabela própria (antes era um campo do lançamento).
create table baixas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  lancamento_id uuid not null unique,
  data date not null,
  valor_pago bigint not null check (valor_pago > 0),
  juros bigint not null default 0 check (juros >= 0),
  desconto bigint not null default 0 check (desconto >= 0),
  conta_id uuid not null,
  usuario_id uuid references auth.users (id) on delete set null,
  registrada_em timestamptz not null default now(),
  observacao text,
  foreign key (lancamento_id, empresa_id) references lancamentos (id, empresa_id) on delete cascade,
  foreign key (conta_id, empresa_id) references contas_bancarias (id, empresa_id)
);

create table resumos_sefaz (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  chave text not null check (length(chave) = 44),
  emitente_documento text not null,
  emitente_nome text not null,
  emissao timestamptz not null,
  valor bigint not null,
  situacao text not null,
  manifestacao text not null default 'pendente' check (manifestacao in ('pendente', 'ciencia', 'confirmada', 'desconhecida', 'nao_realizada')),
  recebido_em timestamptz not null default now(),
  nota_id uuid,
  unique (empresa_id, chave),
  foreign key (nota_id, empresa_id) references notas_fiscais (id, empresa_id)
);

-- Trilha de atividades mostrada no app (a auditoria técnica fica em "auditoria").
create table atividades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  em timestamptz not null default now(),
  usuario_id uuid references auth.users (id) on delete set null,
  tipo text not null,
  texto text not null,
  ref_tipo text,
  ref_id uuid
);
create index atividades_empresa_em on atividades (empresa_id, em desc);

-- ---------- Segurança: RLS, empresa fixa e auditoria em todas as tabelas ----------
-- Quem pode GRAVAR em cada tabela (ler: qualquer membro ativo da empresa).
do $$
declare
  regra record;
begin
  for regra in
    select * from (values
      ('contatos', array['admin', 'financeiro', 'faturamento']),
      ('categorias', array['admin']),
      ('contas_bancarias', array['admin']),
      ('notas_fiscais', array['admin', 'financeiro', 'faturamento']),
      ('lancamentos', array['admin', 'financeiro']),
      ('baixas', array['admin', 'financeiro']),
      ('resumos_sefaz', array['admin', 'financeiro', 'faturamento'])
    ) as t (tabela, papeis)
  loop
    execute format('alter table %I enable row level security', regra.tabela);
    execute format('create policy %I on %I for select using (tem_acesso(empresa_id))', regra.tabela || '_ler', regra.tabela);
    execute format('create policy %I on %I for insert with check (tem_papel(empresa_id, %L::papel[]))', regra.tabela || '_incluir', regra.tabela, regra.papeis);
    execute format('create policy %I on %I for update using (tem_papel(empresa_id, %L::papel[])) with check (tem_papel(empresa_id, %L::papel[]))', regra.tabela || '_editar', regra.tabela, regra.papeis, regra.papeis);
    execute format('create policy %I on %I for delete using (tem_papel(empresa_id, %L::papel[]))', regra.tabela || '_remover', regra.tabela, regra.papeis);
    execute format('create trigger %I before update on %I for each row execute function impede_troca_de_empresa()', regra.tabela || '_empresa_fixa', regra.tabela);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function auditar()', regra.tabela || '_auditoria', regra.tabela);
    execute format('grant select, insert, update, delete on %I to authenticated', regra.tabela);
  end loop;
end;
$$;

-- Atividades: qualquer membro registra as próprias ações; ninguém edita nem apaga.
alter table atividades enable row level security;
create policy atividades_ler on atividades for select using (tem_acesso(empresa_id));
create policy atividades_incluir on atividades for insert with check (tem_acesso(empresa_id) and usuario_id = auth.uid());
grant select, insert on atividades to authenticated;

revoke all on contatos, categorias, contas_bancarias, notas_fiscais, lancamentos, baixas, resumos_sefaz, atividades from anon;
