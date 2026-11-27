-- Disposable PostgreSQL fixture for parsing/creating the Issue #92 draft.
-- This runs only inside an ephemeral GitHub Actions PostgreSQL service.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;

create schema extensions;
create function extensions.digest(text, text) returns bytea
language sql immutable as $$ select decode(md5($1), 'hex') $$;

create table public.platform_users (user_id uuid, role text);
create function public.device_session_is_authorized() returns boolean
language sql stable as $$ select false $$;
create table public.organizations (id uuid primary key);
create table public.profiles (id uuid primary key, full_name text);
create table public.organization_members (
  organization_id uuid, user_id uuid, role text, status text
);
create table public.administrative_audit_logs (
  actor_user_id uuid,
  action text,
  target_type text,
  target_id text,
  target_user_id uuid,
  organization_id uuid,
  justification text,
  outcome text
);
