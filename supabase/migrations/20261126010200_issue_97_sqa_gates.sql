-- SQA/Tech Lead follow-up for Issue #97.
-- Intentionally does not transition the 272 legacy devices. That rollout is
-- gated on the separately reviewed reauthorization and administrator recovery flow.

create or replace function public.device_session_is_authorized()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and nullif(auth.jwt() ->> 'session_id', '') is not null
     and exists (
       select 1
         from public.device_sessions ds
         join public.authorized_devices d
           on d.id = ds.device_id and d.user_id = ds.user_id
         join auth.sessions s on s.id = ds.session_id and s.user_id = ds.user_id
         join auth.users u on u.id = ds.user_id
        where ds.session_id = (auth.jwt() ->> 'session_id')::uuid
          and ds.user_id = auth.uid()
          and ds.status = 'approved'
          and d.status = 'approved'
          and (s.not_after is null or s.not_after > now())
          and (u.banned_until is null or u.banned_until <= now())
          and not exists (
            select 1 from public.organization_members suspended
             where suspended.user_id = ds.user_id
               and suspended.status <> 'active'
          )
     );
$$;

-- Drop the old two-argument signature so PostgREST cannot keep calling the
-- path that did not require a ticket reference.
drop function public.admin_approve_device(uuid, text);
create function public.admin_approve_device(
  p_device_id uuid,
  p_justification text,
  p_ticket_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_user uuid;
  target_org uuid;
  ticket public.it_support_tickets%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_device_id is null or nullif(btrim(p_justification), '') is null
     or nullif(btrim(p_ticket_reference), '') is null then
    raise exception 'Device, justification and active ticket reference are required' using errcode = '22023';
  end if;

  select d.user_id, om.organization_id into target_user, target_org
    from public.authorized_devices d
    left join public.organization_members om on om.user_id = d.user_id and om.status = 'active'
   where d.id = p_device_id and d.status = 'pending'
   order by om.organization_id nulls last limit 1
   for update of d;
  if not found then raise exception 'Pending device not found' using errcode = 'P0002'; end if;
  if target_user = actor_id then raise exception 'Self-approval is forbidden' using errcode = '42501'; end if;
  if target_org is null then raise exception 'Active organization membership is required for device approval' using errcode = '23514'; end if;

  select * into ticket from public.it_support_tickets t
   where t.ticket_reference = btrim(p_ticket_reference)
     and t.organization_id = target_org
     and t.target_user_id = target_user
     and t.status = 'active'
   for update;
  if not found then raise exception 'Active ticket for the device owner and organization is required' using errcode = 'P0002'; end if;

  update public.authorized_devices
     set status = 'approved', approved_at = now(), approved_by = actor_id,
         revoked_at = null, revoked_by = null
   where id = p_device_id and status = 'pending';
  update public.device_sessions set status = 'approved'
   where device_id = p_device_id and status = 'pending';
  insert into public.administrative_audit_logs(
    actor_user_id, action, target_type, target_id, target_user_id,
    organization_id, ticket_reference, justification, outcome
  ) values (
    actor_id, 'device.approve', 'device', p_device_id::text, target_user,
    target_org, ticket.ticket_reference,
    left(public.redact_audit_text(p_justification), 500), 'allowed'
  );
end;
$$;

revoke all on function public.admin_approve_device(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_approve_device(uuid, text, text) to authenticated;

-- Recovery bootstrap for the first platform administrator after the legacy
-- revalidation transition. This is deliberately unavailable to browser roles:
-- a trusted server-side operator must call it with service_role credentials.
create function public.bootstrap_approve_admin_device(
  p_device_id uuid,
  p_actor_user_id uuid,
  p_ticket_reference text,
  p_justification text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user uuid;
  target_org uuid;
  ticket public.it_support_tickets%rowtype;
begin
  if p_device_id is null or p_actor_user_id is null
     or nullif(btrim(p_ticket_reference), '') is null
     or nullif(btrim(p_justification), '') is null then
    raise exception 'Device, distinct administrator, active ticket and justification are required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('issue97_admin_device_bootstrap', 0));
  if not exists (select 1 from public.platform_users pu where pu.user_id = p_actor_user_id and pu.role = 'platform_admin') then
    raise exception 'Audit actor must be a platform administrator' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.device_sessions ds
    join public.platform_users pu on pu.user_id = ds.user_id and pu.role = 'platform_admin'
    where ds.status = 'approved'
  ) then
    raise exception 'Bootstrap is only available when no platform administrator has an approved session' using errcode = '42501';
  end if;
  select d.user_id, om.organization_id into target_user, target_org
    from public.authorized_devices d
    join public.organization_members om on om.user_id = d.user_id and om.status = 'active'
   where d.id = p_device_id and d.status = 'pending'
   order by om.organization_id limit 1
   for update of d;
  if not found then raise exception 'Pending device with active organization membership not found' using errcode = 'P0002'; end if;
  if target_user = p_actor_user_id then raise exception 'Bootstrap self-approval is forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = target_user and pu.role = 'platform_admin') then
    raise exception 'Bootstrap target must be a platform administrator' using errcode = '42501';
  end if;
  select * into ticket from public.it_support_tickets t
   where t.ticket_reference = btrim(p_ticket_reference)
     and t.organization_id = target_org and t.target_user_id = target_user and t.status = 'active'
   for update;
  if not found then raise exception 'Active ticket for the target administrator and organization is required' using errcode = 'P0002'; end if;

  update public.authorized_devices set status = 'approved', approved_at = now(), approved_by = p_actor_user_id
   where id = p_device_id and status = 'pending';
  update public.device_sessions set status = 'approved'
   where device_id = p_device_id and status = 'pending';
  insert into public.administrative_audit_logs(
    actor_user_id, action, target_type, target_id, target_user_id,
    organization_id, ticket_reference, justification, outcome
  ) values (
    p_actor_user_id, 'device.bootstrap_approve', 'device', p_device_id::text, target_user,
    target_org, ticket.ticket_reference,
    left(public.redact_audit_text(p_justification), 500), 'allowed'
  );
end;
$$;
revoke all on function public.bootstrap_approve_admin_device(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_approve_admin_device(uuid, uuid, text, text)
  to service_role;

drop function public.admin_list_device_sessions(uuid, text);
create function public.admin_list_device_sessions(
  p_user_id uuid,
  p_justification text
)
returns table (
  user_id uuid, device_id uuid, session_id uuid, device_label text,
  user_agent text, device_status text, session_status text,
  requested_at timestamptz, last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = auth.uid() and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if nullif(btrim(p_justification), '') is null then raise exception 'Justification is required' using errcode = '22023'; end if;
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, justification, outcome)
  values (auth.uid(), 'device_sessions.list', 'device', coalesce(p_user_id::text, 'all'),
          left(public.redact_audit_text(p_justification), 500), 'allowed');
  return query
  select ds.user_id, d.id, ds.session_id, d.label, d.user_agent, d.status,
         ds.status, d.requested_at, greatest(d.last_seen_at, ds.last_seen_at)
    from public.device_sessions ds
    join public.authorized_devices d on d.id = ds.device_id and d.user_id = ds.user_id
   where p_user_id is null or ds.user_id = p_user_id
   order by greatest(d.last_seen_at, ds.last_seen_at) desc;
end;
$$;
revoke all on function public.admin_list_device_sessions(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_device_sessions(uuid, text) to authenticated;

drop function public.admin_list_administrative_audit(timestamptz, integer);
create function public.admin_list_administrative_audit(
  p_before timestamptz default null,
  p_limit integer default 50,
  p_justification text default null
)
returns setof public.administrative_audit_logs
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = auth.uid() and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Limit must be between 1 and 100' using errcode = '22023'; end if;
  if nullif(btrim(p_justification), '') is null then raise exception 'Justification is required' using errcode = '22023'; end if;

  -- One direct append; this does not call the reader and cannot recurse.
  insert into public.administrative_audit_logs(
    actor_user_id, action, target_type, target_id, justification, outcome
  ) values (
    auth.uid(), 'administrative_audit.read', 'organization', 'all',
    left(public.redact_audit_text(p_justification), 500), 'allowed'
  );
  return query select * from public.administrative_audit_logs a
    where p_before is null or a.occurred_at < p_before
    order by a.occurred_at desc, a.id desc limit p_limit;
end;
$$;
revoke all on function public.admin_list_administrative_audit(timestamptz, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_list_administrative_audit(timestamptz, integer, text)
  to authenticated;
