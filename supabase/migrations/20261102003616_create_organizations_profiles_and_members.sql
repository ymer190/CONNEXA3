create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_members_organization_id_idx
  on public.organization_members (organization_id);

create unique index organization_members_one_active_owner_per_organization_idx
  on public.organization_members (organization_id)
  where role = 'owner' and status = 'active';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

grant select on public.organizations to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.organization_members to authenticated;

create policy "Members can read their organization"
  on public.organizations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members as membership
      where membership.organization_id = organizations.id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );

create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users can read their own organization membership"
  on public.organization_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));
