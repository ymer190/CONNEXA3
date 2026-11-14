-- Issue #91: separate platform administration from organization roles.
-- A platform administrator is independent from organization_members.
create table if not exists public.platform_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'platform_admin',
  created_at timestamptz not null default now(),
  constraint platform_users_role_check check (role = 'platform_admin')
);

alter table public.platform_users enable row level security;

-- Authenticated users may only read their own platform role.
-- No client-side role assignment or modification is allowed.
revoke all on table public.platform_users from anon, authenticated;
grant select on table public.platform_users to authenticated;
grant all on table public.platform_users to service_role;

drop policy if exists "Platform users can read own role" on public.platform_users;
create policy "Platform users can read own role"
  on public.platform_users
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
