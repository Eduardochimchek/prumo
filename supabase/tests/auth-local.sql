-- Simula, SÓ NOS TESTES, o que o Supabase já traz pronto: schema auth, tabela de usuários,
-- auth.uid() e os papéis anon/authenticated. Nunca vai para produção.
create schema auth;
create table auth.users (id uuid primary key, email text not null);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
