-- Issue #95 — Stage 1: organizational departments and explicit membership.
-- This migration creates only the department domain. Conversation/group tables remain owned by Issue #96.
-- Direct client access is intentionally denied until server-side capability checks are implemented.

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations (id) on delete restrict,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_name_not_blank check (length(btrim(name)) > 0),
  constraint departments_id_organization_unique unique (id, organization_id)
);

-- Department names are unique within an organization while active.
create unique index departments_active_name_per_organization_uidx
  on public.departments (organization_id, lower(btrim(name)))
  where status = 'active';

create index departments_organization_status_idx
  on public.departments (organization_id, status);

-- organization_members.user_id is already globally unique; this composite index
-- provides an explicit tenant-safe FK target without changing its legacy role/status rules.
create unique index organization_members_user_organization_uidx
  on public.organization_members (user_id, organization_id);

create table public.department_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  department_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references auth.users (id) on delete set null,
  constraint department_members_department_same_organization_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete restrict,
  constraint department_members_user_same_organization_fk
    foreign key (user_id, organization_id)
    references public.organization_members (user_id, organization_id) on delete restrict,
  -- A historical association may outlive the user who performed the transfer;
  -- ON DELETE SET NULL must not make deletion of that actor fail.
  constraint department_members_end_metadata_consistent
    check (ended_at is not null or ended_by is null)
);

-- A collaborator may have only one active department in their organization.
-- A department transfer ends the previous association before creating the new one.
create unique index department_members_one_active_department_per_user_uidx
  on public.department_members (user_id)
  where ended_at is null;

create index department_members_organization_department_idx
  on public.department_members (organization_id, department_id);

create index department_members_organization_user_idx
  on public.department_members (organization_id, user_id);

-- A new/current association is valid only while both department and employee are active.
-- Historical associations (ended_at set) remain queryable and are not deleted.
create or replace function public.validate_department_member_active_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  department_status text;
  member_status text;
begin
  if new.ended_at is not null then
    return new;
  end if;

  select d.status
    into department_status
    from public.departments as d
   where d.id = new.department_id
     and d.organization_id = new.organization_id
   for share;

  if department_status is distinct from 'active' then
    raise exception 'Department must be active to create an active association'
      using errcode = '23514';
  end if;

  select om.status
    into member_status
    from public.organization_members as om
   where om.user_id = new.user_id
     and om.organization_id = new.organization_id
   for share;

  if member_status is distinct from 'active' then
    raise exception 'Employee must be an active organization member'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger department_members_validate_active_scope
before insert or update of organization_id, department_id, user_id, ended_at
on public.department_members
for each row
execute function public.validate_department_member_active_scope();

create trigger departments_set_updated_at
before update on public.departments
for each row
execute function public.set_updated_at();

alter table public.departments enable row level security;
alter table public.department_members enable row level security;

-- Fail closed: authenticated/anon clients receive no direct table privileges or policies.
-- Trusted server operations may use service_role only after validating the caller's
-- session, platform_users/capabilities, organization and department scope server-side.
revoke all privileges on table public.departments, public.department_members
  from anon, authenticated, service_role;

grant all privileges on table public.departments, public.department_members
  to service_role;

comment on table public.departments is
  'Issue #95: organizational departments; distinct from communication conversations/groups.';
comment on table public.department_members is
  'Issue #95: one active department per employee; explicit associations with preserved transfer history.';
comment on column public.department_members.ended_at is
  'Null means current association; non-null preserves the end of the association.';
comment on column public.department_members.created_by is
  'Trusted server-recorded actor that created the association; never accepted as authorization input.';
comment on column public.department_members.ended_by is
  'Trusted server-recorded actor that ended the association; may become null if that actor is deleted.';
