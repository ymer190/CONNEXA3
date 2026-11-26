-- Issue #95 Stage 1: authenticated, server-enforced platform-admin operations.
-- Direct table privileges remain revoked; clients may call only these guarded RPCs.
create or replace function public.admin_list_departments(p_organization_id uuid)
returns setof public.departments
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
      from public.platform_users as pu
     where pu.user_id = auth.uid()
       and pu.role = 'platform_admin'
  ) then
    raise exception 'Platform administrator role required'
      using errcode = '42501';
  end if;

  return query
  select d.*
    from public.departments as d
   where d.organization_id = p_organization_id
   order by lower(btrim(d.name)), d.id;
end;
$$;

create or replace function public.admin_create_department(
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
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
      from public.platform_users as pu
     where pu.user_id = auth.uid()
       and pu.role = 'platform_admin'
  ) then
    raise exception 'Platform administrator role required'
      using errcode = '42501';
  end if;

  if p_organization_id is null or p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Organization and non-empty department name are required'
      using errcode = '22023';
  end if;

  return query
  insert into public.departments (organization_id, name)
  values (p_organization_id, btrim(p_name))
  returning *;
end;
$$;

revoke all on function public.admin_list_departments(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_create_department(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_list_departments(uuid) to authenticated;
grant execute on function public.admin_create_department(uuid, text) to authenticated;

comment on function public.admin_list_departments(uuid) is
  'Issue #95: list departments in one organization; requires authenticated platform_admin.';
comment on function public.admin_create_department(uuid, text) is
  'Issue #95: create a department; requires authenticated platform_admin.';
