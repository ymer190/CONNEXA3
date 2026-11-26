-- Issue #106/#97: keyset pagination must include the unique tie-breaker.
-- The timestamp-only signature could skip rows sharing the previous page's
-- final occurred_at value.
drop function if exists public.admin_list_administrative_audit(timestamptz, integer);

create function public.admin_list_administrative_audit(
  p_before timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 50
)
returns setof public.administrative_audit_logs
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.device_session_is_authorized() then
    raise exception 'Authorized device required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.platform_users pu
    where pu.user_id = auth.uid() and pu.role = 'platform_admin'
  ) then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Limit must be between 1 and 100' using errcode = '22023';
  end if;
  if (p_before is null) <> (p_before_id is null) then
    raise exception 'Both cursor fields must be supplied together' using errcode = '22023';
  end if;

  return query
  select a.*
  from public.administrative_audit_logs a
  where p_before is null
     or (a.occurred_at, a.id) < (p_before, p_before_id)
  order by a.occurred_at desc, a.id desc
  limit p_limit;
end;
$$;

revoke all on function public.admin_list_administrative_audit(timestamptz, bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_administrative_audit(timestamptz, bigint, integer)
  to authenticated;

comment on function public.admin_list_administrative_audit(timestamptz, bigint, integer) is
  'Issue #97: list administrative audit events for platform_admin using stable (occurred_at,id) keyset pagination; limit 1..100.';
