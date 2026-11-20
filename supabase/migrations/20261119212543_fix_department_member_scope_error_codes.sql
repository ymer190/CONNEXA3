-- Issue #95 follow-up: report tenant-scope violations distinctly from inactive records.
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

  if not found then
    raise exception 'Department does not belong to the organization'
      using errcode = '23503';
  end if;

  if department_status <> 'active' then
    raise exception 'Department must be active to create an active association'
      using errcode = '23514';
  end if;

  select om.status
    into member_status
    from public.organization_members as om
   where om.user_id = new.user_id
     and om.organization_id = new.organization_id
   for share;

  if not found then
    raise exception 'Employee does not belong to the organization'
      using errcode = '23503';
  end if;

  if member_status <> 'active' then
    raise exception 'Employee must be an active organization member'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
