-- Issue #95 Stage 2: guarded department administration and employee transfers.
-- Until explicit collaborator capabilities are implemented, these RPCs are platform_admin-only.
-- Conversation/group operations remain owned by Issue #96.

create or replace function public.admin_update_department(
  p_department_id uuid,
  p_organization_id uuid,
  p_name text
)
returns setof public.departments
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.platform_users pu
     where pu.user_id = auth.uid() and pu.role = 'platform_admin'
  ) then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_department_id is null or p_organization_id is null
     or p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Department, organization and non-empty name are required'
      using errcode = '22023';
  end if;

  return query
  update public.departments d
     set name = btrim(p_name)
   where d.id = p_department_id
     and d.organization_id = p_organization_id
     and d.status = 'active'
  returning d.*;

  if not found then
    raise exception 'Active department not found in organization'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_deactivate_department(
  p_department_id uuid,
  p_organization_id uuid
)
returns setof public.departments
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.platform_users pu
     where pu.user_id = auth.uid() and pu.role = 'platform_admin'
  ) then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;

  -- Lock the department first. A concurrent transfer's membership trigger
  -- takes FOR SHARE on this row, so it either commits before this transaction
  -- (and is then closed below) or observes the inactive status after we commit.
  perform 1
    from public.departments d
   where d.id = p_department_id
     and d.organization_id = p_organization_id
     and d.status = 'active'
   for update;

  if not found then
    raise exception 'Active department not found in organization'
      using errcode = 'P0002';
  end if;

  -- Preserve association history and close all current links atomically.
  update public.department_members dm
     set ended_at = now(), ended_by = auth.uid()
   where dm.department_id = p_department_id
     and dm.organization_id = p_organization_id
     and dm.ended_at is null;

  return query
  update public.departments d
     set status = 'inactive'
   where d.id = p_department_id
     and d.organization_id = p_organization_id
     and d.status = 'active'
  returning d.*;
end;
$$;

create or replace function public.admin_list_department_members(
  p_department_id uuid,
  p_organization_id uuid
)
returns setof public.department_members
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.platform_users pu
     where pu.user_id = auth.uid() and pu.role = 'platform_admin'
  ) then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;

  return query
  select dm.*
    from public.department_members dm
   where dm.department_id = p_department_id
     and dm.organization_id = p_organization_id
   order by dm.ended_at nulls first, dm.created_at, dm.id;
end;
$$;

create or replace function public.admin_transfer_department_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_new_department_id uuid
)
returns setof public.department_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.platform_users pu
     where pu.user_id = actor_id and pu.role = 'platform_admin'
  ) then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_organization_id is null or p_user_id is null or p_new_department_id is null then
    raise exception 'Organization, employee and destination department are required'
      using errcode = '22023';
  end if;

  -- Serialize transfers for this employee to avoid racing two destination assignments.
  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_user_id::text, 0)
  );

  if not exists (
    select 1 from public.departments d
     where d.id = p_new_department_id
       and d.organization_id = p_organization_id
       and d.status = 'active'
  ) then
    raise exception 'Active destination department not found in organization'
      using errcode = '23514';
  end if;

  update public.department_members dm
     set ended_at = now(), ended_by = actor_id
   where dm.organization_id = p_organization_id
     and dm.user_id = p_user_id
     and dm.ended_at is null;

  return query
  insert into public.department_members (
    organization_id, department_id, user_id, created_by
  )
  values (p_organization_id, p_new_department_id, p_user_id, actor_id)
  returning *;
end;
$$;

revoke all on function public.admin_update_department(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_deactivate_department(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_department_members(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_transfer_department_member(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_update_department(uuid,uuid,text) to authenticated;
grant execute on function public.admin_deactivate_department(uuid,uuid) to authenticated;
grant execute on function public.admin_list_department_members(uuid,uuid) to authenticated;
grant execute on function public.admin_transfer_department_member(uuid,uuid,uuid) to authenticated;

comment on function public.admin_update_department(uuid,uuid,text) is
  'Issue #95: update active department metadata; platform_admin only until scoped collaborator capabilities are implemented.';
comment on function public.admin_deactivate_department(uuid,uuid) is
  'Issue #95: deactivate department and close current memberships while preserving history; platform_admin only.';
comment on function public.admin_list_department_members(uuid,uuid) is
  'Issue #95: list current and historical department memberships; platform_admin only.';
comment on function public.admin_transfer_department_member(uuid,uuid,uuid) is
  'Issue #95: atomically transfer employee department and preserve prior membership history; platform_admin only.';
