-- Prumo · Fase 1 · empresas, pessoas e acesso (multiempresa)
--
-- Regra de ouro: o isolamento entre empresas é garantido pelo BANCO (row-level security),
-- não pelo app. Toda tabela de negócio tem empresa_id e só devolve linhas de empresas em que
-- o usuário logado (auth.uid()) é membro ativo. O schema "auth" é o do Supabase.

create type papel as enum ('admin', 'financeiro', 'faturamento', 'leitura');

create table empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null check (length(trim(razao_social)) > 0),
  nome_fantasia text,
  -- normalizado, sem máscara; pode ser alfanumérico (CNPJ novo, desde jul/2026)
  cnpj text not null check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  inscricao_estadual text,
  uf char(2),
  municipio text,
  regime text not null default 'simples' check (regime in ('simples', 'presumido', 'real', 'mei')),
  plano text not null default 'teste',
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null
);
create unique index empresas_cnpj_unico on empresas (cnpj);

create table perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  telefone text,
  cargo text,
  aceitou_privacidade_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Uma pessoa pode ser membro de várias empresas (contador, BPO), com um papel em cada uma.
create table membros (
  empresa_id uuid not null references empresas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  papel papel not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  primary key (empresa_id, usuario_id)
);
create index membros_usuario on membros (usuario_id) where ativo;

-- Convite por e-mail: só o hash do token é guardado.
create table convites (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas (id) on delete cascade,
  email text not null check (email ~ '^\S+@\S+\.\S+$'),
  papel papel not null,
  token_hash text not null unique,
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  aceito_por uuid references auth.users (id) on delete set null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);

-- Auditoria (quem alterou o quê), preenchida por gatilho. Ninguém grava nem apaga direto.
create table auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid,
  tabela text not null,
  registro_id text,
  operacao text not null,
  antes jsonb,
  depois jsonb,
  usuario_id uuid,
  em timestamptz not null default now()
);
create index auditoria_empresa_em on auditoria (empresa_id, em desc);

-- ---------- Funções de acesso (security definer: leem membros sem recursão de RLS) ----------

create function tem_acesso(alvo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membros m
    where m.empresa_id = alvo and m.usuario_id = auth.uid() and m.ativo
  )
$$;

create function tem_papel(alvo uuid, papeis papel[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from membros m
    where m.empresa_id = alvo and m.usuario_id = auth.uid() and m.ativo and m.papel = any (papeis)
  )
$$;

-- Cria a empresa e torna quem criou o primeiro administrador, numa operação só.
create function criar_empresa(p_razao_social text, p_cnpj text, p_nome_fantasia text default null, p_uf text default null, p_municipio text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nova uuid;
begin
  if auth.uid() is null then
    raise exception 'login necessário';
  end if;
  insert into empresas (razao_social, cnpj, nome_fantasia, uf, municipio, criado_por)
  values (p_razao_social, upper(regexp_replace(p_cnpj, '[^0-9A-Za-z]', '', 'g')), p_nome_fantasia, p_uf, p_municipio, auth.uid())
  returning id into nova;
  insert into membros (empresa_id, usuario_id, papel, criado_por) values (nova, auth.uid(), 'admin', auth.uid());
  return nova;
end;
$$;

-- Aceita um convite: o token bate com o hash, não expirou e o e-mail é o de quem está logado.
create function aceitar_convite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c convites%rowtype;
  meu_email text;
begin
  if auth.uid() is null then
    raise exception 'login necessário';
  end if;
  select email into meu_email from auth.users where id = auth.uid();
  select * into c from convites
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;
  if not found or c.aceito_em is not null or c.expira_em < now() then
    raise exception 'convite inválido ou expirado';
  end if;
  if lower(c.email) <> lower(coalesce(meu_email, '')) then
    raise exception 'este convite é para outro e-mail';
  end if;
  insert into membros (empresa_id, usuario_id, papel, criado_por)
  values (c.empresa_id, auth.uid(), c.papel, c.criado_por)
  on conflict (empresa_id, usuario_id) do update set papel = excluded.papel, ativo = true;
  update convites set aceito_em = now(), aceito_por = auth.uid() where id = c.id;
  return c.empresa_id;
end;
$$;

-- Nunca deixar uma empresa sem administrador ativo.
create function protege_ultimo_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.papel = 'admin' and old.ativo
     and (tg_op = 'DELETE' or new.papel <> 'admin' or not new.ativo)
     and exists (select 1 from empresas where id = old.empresa_id)
     and not exists (
       select 1 from membros
       where empresa_id = old.empresa_id and usuario_id <> old.usuario_id and papel = 'admin' and ativo
     ) then
    raise exception 'a empresa precisa de pelo menos um administrador ativo';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger membros_ultimo_admin before update or delete on membros
for each row execute function protege_ultimo_admin();

-- Gatilho genérico de auditoria.
create function auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  linha jsonb := to_jsonb(coalesce(new, old));
begin
  insert into auditoria (empresa_id, tabela, registro_id, operacao, antes, depois, usuario_id)
  values (
    coalesce((to_jsonb(new) ->> 'empresa_id')::uuid, (to_jsonb(old) ->> 'empresa_id')::uuid, (linha ->> 'id')::uuid),
    tg_table_name,
    coalesce(linha ->> 'id', linha ->> 'usuario_id'),
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

-- Uma linha nunca muda de empresa (evita que quem é membro de duas "mova" dados entre elas).
create function impede_troca_de_empresa() returns trigger
language plpgsql as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'não é permitido mudar a empresa de um registro';
  end if;
  return new;
end;
$$;

create trigger empresas_auditoria after insert or update or delete on empresas for each row execute function auditar();
create trigger membros_auditoria after insert or update or delete on membros for each row execute function auditar();
create trigger membros_empresa_fixa before update on membros for each row execute function impede_troca_de_empresa();

-- ---------- Row-level security ----------

alter table empresas enable row level security;
alter table perfis enable row level security;
alter table membros enable row level security;
alter table convites enable row level security;
alter table auditoria enable row level security;

create policy empresas_ler on empresas for select using (tem_acesso(id));
create policy empresas_editar on empresas for update using (tem_papel(id, array['admin']::papel[])) with check (tem_papel(id, array['admin']::papel[]));
-- criação só por criar_empresa(); exclusão só pelo suporte (sem política = negado)

create policy perfis_ler on perfis for select using (
  id = auth.uid()
  or exists (
    select 1 from membros eu join membros outro on outro.empresa_id = eu.empresa_id
    where eu.usuario_id = auth.uid() and eu.ativo and outro.usuario_id = perfis.id
  )
);
create policy perfis_criar on perfis for insert with check (id = auth.uid());
create policy perfis_editar on perfis for update using (id = auth.uid()) with check (id = auth.uid());

create policy membros_ler on membros for select using (tem_acesso(empresa_id));
create policy membros_incluir on membros for insert with check (tem_papel(empresa_id, array['admin']::papel[]));
create policy membros_editar on membros for update using (tem_papel(empresa_id, array['admin']::papel[])) with check (tem_papel(empresa_id, array['admin']::papel[]));
create policy membros_remover on membros for delete using (tem_papel(empresa_id, array['admin']::papel[]) or usuario_id = auth.uid());

create policy convites_ler on convites for select using (tem_papel(empresa_id, array['admin']::papel[]));
create policy convites_criar on convites for insert with check (tem_papel(empresa_id, array['admin']::papel[]) and criado_por = auth.uid());
create policy convites_remover on convites for delete using (tem_papel(empresa_id, array['admin']::papel[]));

create policy auditoria_ler on auditoria for select using (empresa_id is not null and tem_papel(empresa_id, array['admin']::papel[]));

-- ---------- Permissões dos papéis do Supabase ----------
-- anon (sem login) não toca em nada; authenticated passa pelas políticas acima.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on empresas, perfis, membros, convites to authenticated;
grant select on auditoria to authenticated;
grant execute on function tem_acesso(uuid), tem_papel(uuid, papel[]), criar_empresa(text, text, text, text, text), aceitar_convite(text) to authenticated;
