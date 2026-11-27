-- Issue #97: device authorization, session control, support scope and audit.
create extension if not exists pgcrypto with schema extensions;

create table public.authorized_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  secret_hash bytea not null,
  label text not null check (length(label) between 1 and 80),
  user_agent text null check (user_agent is null or length(user_agent) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  revoked_at timestamptz null,
  revoked_by uuid null references auth.users(id) on delete set null,
  unique (id, user_id),
  check (status <> 'approved' or approved_at is not null),
  check (status <> 'pending' or approved_at is null),
  check ((status = 'revoked') = (revoked_at is not null))
);

create table public.device_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  status text not null check (status in ('pending', 'approved', 'revoked')),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_by uuid null references auth.users(id) on delete set null,
  foreign key (device_id, user_id)
    references public.authorized_devices(id, user_id) on delete cascade,
  check ((status = 'revoked') = (revoked_at is not null))
);

create index device_sessions_user_status_idx
  on public.device_sessions(user_id, status, last_seen_at desc);
create index authorized_devices_user_status_idx
  on public.authorized_devices(user_id, status, requested_at desc);

create table public.it_support_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid null references auth.users(id) on delete set null,
  active boolean not null default true,
  primary key (user_id, organization_id)
);

create table public.it_support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_reference text not null unique
    check (ticket_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$'),
  organization_id uuid not null references public.organizations(id),
  target_user_id uuid not null references auth.users(id),
  assigned_to uuid not null references auth.users(id),
  opened_by uuid not null references auth.users(id),
  opening_justification text not null check (length(btrim(opening_justification)) between 1 and 500),
  status text not null default 'active' check (status in ('active', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  closed_by uuid null references auth.users(id) on delete set null,
  foreign key (target_user_id, organization_id)
    references public.organization_members(user_id, organization_id),
  foreign key (assigned_to, organization_id)
    references public.it_support_members(user_id, organization_id),
  check ((status = 'closed') = (closed_at is not null))
);
create index it_support_tickets_assignee_status_idx
  on public.it_support_tickets(assigned_to, status, opened_at desc);

create table public.administrative_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid null,
  action text not null check (action ~ '^[a-z][a-z0-9_.]{1,79}$'),
  target_type text not null check (target_type in ('device', 'session', 'support_ticket', 'it_support_assignment', 'department', 'organization')),
  target_id text not null check (length(target_id) between 1 and 100),
  target_user_id uuid null,
  organization_id uuid null,
  ticket_reference text null,
  justification text null check (justification is null or length(justification) <= 500),
  outcome text not null check (outcome in ('allowed', 'denied')),
  occurred_at timestamptz not null default now()
);
create index administrative_audit_logs_time_idx
  on public.administrative_audit_logs(occurred_at desc, id desc);
create index administrative_audit_logs_target_idx
  on public.administrative_audit_logs(target_type, target_id, occurred_at desc);

alter table public.authorized_devices enable row level security;
alter table public.device_sessions enable row level security;
alter table public.it_support_members enable row level security;
alter table public.it_support_tickets enable row level security;
alter table public.administrative_audit_logs enable row level security;

revoke all on public.authorized_devices, public.device_sessions,
  public.it_support_members, public.it_support_tickets,
  public.administrative_audit_logs from anon, authenticated;
revoke all on sequence public.administrative_audit_logs_id_seq from anon, authenticated;
grant all on public.authorized_devices, public.device_sessions,
  public.it_support_members, public.it_support_tickets,
  public.administrative_audit_logs to service_role;
grant usage, select on sequence public.administrative_audit_logs_id_seq to service_role;

-- Existing Auth sessions are grandfathered during rollout. Each is represented
-- as its own device until its owner completes the explicit device enrollment flow.
insert into public.authorized_devices (
  id, user_id, secret_hash, label, user_agent, status, approved_at
)
select s.id, s.user_id, extensions.digest(('legacy-session:' || s.id::text), 'sha256'),
       'Dispositivo anterior', left(s.user_agent, 500), 'approved', now()
  from auth.sessions s
 where (s.not_after is null or s.not_after > now())
   and exists (select 1 from auth.refresh_tokens rt where rt.session_id = s.id and not rt.revoked)
on conflict (id) do nothing;

insert into public.device_sessions (session_id, user_id, device_id, status)
select s.id, s.user_id, s.id, 'approved'
  from auth.sessions s
  join public.authorized_devices d on d.id = s.id and d.user_id = s.user_id
 where (s.not_after is null or s.not_after > now())
   and exists (select 1 from auth.refresh_tokens rt where rt.session_id = s.id and not rt.revoked)
on conflict (session_id) do nothing;

create or replace function public.redact_audit_text(p_text text)
returns text language sql immutable set search_path = '' as $$
  select left(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text,''),
    '(?i)bearer[[:space:]]+[A-Za-z0-9._~+/=-]+', '[REDACTED]','g'),
    '\meyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\M', '[REDACTED]','g'),
    '(?i)(password|passwd|token|secret|credential)[[:space:]]*[:=][[:space:]]*[^[:space:],;]+', '\1=[REDACTED]','g'), 500);
$$;
revoke all on function public.redact_audit_text(text) from public, anon, authenticated, service_role;

create or replace function public.device_session_is_authorized()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and (auth.jwt() ->> 'session_id') is not null
     and exists (
       select 1
         from public.device_sessions ds
         join public.authorized_devices d
           on d.id = ds.device_id and d.user_id = ds.user_id
         join auth.sessions s on s.id = ds.session_id and s.user_id = ds.user_id
        where ds.session_id = (auth.jwt() ->> 'session_id')::uuid
          and ds.user_id = auth.uid()
          and ds.status = 'approved'
          and d.status = 'approved'
          and (s.not_after is null or s.not_after > now())
     );
$$;
revoke all on function public.device_session_is_authorized() from public, anon;
grant execute on function public.device_session_is_authorized() to authenticated;

create policy profiles_authorized_device_session
  on public.profiles as restrictive for all to authenticated
  using (public.device_session_is_authorized())
  with check (public.device_session_is_authorized());
create policy organizations_authorized_device_session
  on public.organizations as restrictive for all to authenticated
  using (public.device_session_is_authorized())
  with check (public.device_session_is_authorized());
create policy organization_members_authorized_device_session
  on public.organization_members as restrictive for all to authenticated
  using (public.device_session_is_authorized())
  with check (public.device_session_is_authorized());
create policy platform_users_authorized_device_session
  on public.platform_users as restrictive for all to authenticated
  using (public.device_session_is_authorized())
  with check (public.device_session_is_authorized());

create or replace function public.register_device_session(
  p_device_id uuid,
  p_device_secret text,
  p_label text,
  p_user_agent text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  secret_hash bytea;
  device_status text;
  current_device_id uuid;
begin
  if actor_id is null or session_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_device_id is null or p_device_secret is null or length(p_device_secret) < 32
     or p_label is null or length(btrim(p_label)) not between 1 and 80 then
    raise exception 'Valid device enrollment data is required' using errcode = '22023';
  end if;
  secret_hash := extensions.digest(p_device_secret, 'sha256');
  select ds.device_id into current_device_id
    from public.device_sessions ds where ds.session_id = session_id and ds.user_id = actor_id;
  if found then
    if current_device_id <> p_device_id then
      raise exception 'Session is already bound to another device' using errcode = '42501';
    end if;
    return (select d.status from public.authorized_devices d where d.id = p_device_id);
  end if;

  select d.status into device_status
    from public.authorized_devices d
   where d.id = p_device_id and d.user_id = actor_id
     and d.secret_hash = secret_hash
   for update;
  if not found then
    if exists (select 1 from public.authorized_devices d where d.id = p_device_id) then
      raise exception 'Device credential is invalid' using errcode = '42501';
    end if;
    insert into public.authorized_devices(id, user_id, secret_hash, label, user_agent)
    values (p_device_id, actor_id, secret_hash, btrim(p_label), left(p_user_agent, 500));
    device_status := 'pending';
  elsif device_status = 'revoked' then
    raise exception 'Revoked device cannot be re-enrolled' using errcode = '42501';
  else
    update public.authorized_devices
       set last_seen_at = now(), user_agent = left(p_user_agent, 500)
     where id = p_device_id and user_id = actor_id;
  end if;

  insert into public.device_sessions(session_id, user_id, device_id, status)
  values (session_id, actor_id, p_device_id,
          case when device_status = 'approved' then 'approved' else 'pending' end);
  return device_status;
end;
$$;
revoke all on function public.register_device_session(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.register_device_session(uuid, text, text, text)
  to authenticated;

create or replace function public.admin_list_device_sessions(p_user_id uuid default null, p_justification text default null)
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
  if not public.device_session_is_authorized() then
    raise exception 'Authorized device required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = auth.uid() and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, justification, outcome)
  values (auth.uid(), 'device_sessions.list', 'device', coalesce(p_user_id::text, 'all'),
          case when nullif(btrim(p_justification), '') is null then null else left(public.redact_audit_text(p_justification), 500) end, 'allowed');
  return query
  select ds.user_id, d.id, ds.session_id, d.label, d.user_agent, d.status,
         ds.status, d.requested_at, greatest(d.last_seen_at, ds.last_seen_at)
    from public.device_sessions ds
    join public.authorized_devices d on d.id = ds.device_id and d.user_id = ds.user_id
   where p_user_id is null or ds.user_id = p_user_id
   order by greatest(d.last_seen_at, ds.last_seen_at) desc;
end;
$$;

create or replace function public.admin_approve_device(p_device_id uuid, p_justification text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_device_id is null or nullif(btrim(p_justification), '') is null then
    raise exception 'Device and justification are required' using errcode = '22023';
  end if;
  update public.authorized_devices d
     set status = 'approved', approved_at = now(), approved_by = actor_id,
         revoked_at = null, revoked_by = null
   where d.id = p_device_id and d.status = 'pending';
  if not found then raise exception 'Pending device not found' using errcode = 'P0002'; end if;
  update public.device_sessions ds set status = 'approved'
   where ds.device_id = p_device_id and ds.status = 'pending';
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, justification, outcome)
  values (actor_id, 'device.approve', 'device', p_device_id::text, left(public.redact_audit_text(p_justification), 500), 'allowed');
end;
$$;

create or replace function public.admin_revoke_device(p_device_id uuid, p_justification text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if nullif(btrim(p_justification), '') is null then raise exception 'Justification is required' using errcode = '22023'; end if;
  update public.authorized_devices d
     set status = 'revoked', revoked_at = now(), revoked_by = actor_id
   where d.id = p_device_id and d.status <> 'revoked';
  if not found then raise exception 'Device not found' using errcode = 'P0002'; end if;
  update public.device_sessions ds set status = 'revoked', revoked_at = now(), revoked_by = actor_id
   where ds.device_id = p_device_id and ds.status <> 'revoked';
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, justification, outcome)
  values (actor_id, 'device.revoke', 'device', p_device_id::text, left(public.redact_audit_text(p_justification), 500), 'allowed');
end;
$$;

create or replace function public.admin_revoke_session(p_session_id uuid, p_justification text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_session_id is null or nullif(btrim(p_justification), '') is null then
    raise exception 'Session and justification are required' using errcode = '22023';
  end if;
  update public.device_sessions ds set status = 'revoked', revoked_at = now(), revoked_by = actor_id
   where ds.session_id = p_session_id and ds.status <> 'revoked';
  if not found then raise exception 'Active session not found' using errcode = 'P0002'; end if;
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, justification, outcome)
  values (actor_id, 'session.revoke', 'session', p_session_id::text, left(public.redact_audit_text(p_justification), 500), 'allowed');
end;
$$;

create or replace function public.admin_assign_it_support(p_user_id uuid, p_organization_id uuid, p_justification text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_organization_id is null or nullif(btrim(p_justification), '') is null then
    raise exception 'User, organization and justification are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organization_members om where om.user_id = p_user_id
                  and om.organization_id = p_organization_id and om.status = 'active') then
    raise exception 'Active organization membership is required' using errcode = '23514';
  end if;
  insert into public.it_support_members(user_id, organization_id, assigned_by)
  values (p_user_id, p_organization_id, actor_id)
  on conflict (user_id, organization_id) do update set active = true, assigned_by = excluded.assigned_by, assigned_at = now();
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, organization_id, justification, outcome)
  values (actor_id, 'it_support.assign', 'it_support_assignment', p_user_id::text, p_organization_id,
          left(public.redact_audit_text(p_justification), 500), 'allowed');
end;
$$;

create or replace function public.admin_open_it_support_ticket(
  p_ticket_reference text, p_target_user_id uuid, p_assigned_to uuid, p_justification text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid(); org_id uuid; ticket_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if nullif(btrim(p_ticket_reference), '') is null or p_target_user_id is null or p_assigned_to is null
     or nullif(btrim(p_justification), '') is null then
    raise exception 'Ticket, target, assignee and justification are required' using errcode = '22023';
  end if;
  select om.organization_id into org_id from public.organization_members om
   where om.user_id = p_target_user_id and om.status = 'active';
  if org_id is null then raise exception 'Active target membership not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.it_support_members ism where ism.user_id = p_assigned_to and ism.organization_id = org_id and ism.active) then
    raise exception 'Assignee is not IT support for the target organization' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organization_members om where om.user_id=p_assigned_to and om.organization_id=org_id and om.status='active') then
    raise exception 'Assignee is not an active organization member' using errcode = '42501';
  end if;
  insert into public.it_support_tickets(ticket_reference, organization_id, target_user_id, assigned_to, opened_by, opening_justification)
  values (btrim(p_ticket_reference), org_id, p_target_user_id, p_assigned_to, actor_id,
          left(public.redact_audit_text(p_justification), 500)) returning id into ticket_id;
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, target_user_id, organization_id, ticket_reference, justification, outcome)
  values (actor_id, 'support_ticket.open', 'support_ticket', ticket_id::text, p_target_user_id, org_id, p_ticket_reference,
          left(public.redact_audit_text(p_justification), 500), 'allowed');
  return ticket_id;
end;
$$;

create or replace function public.support_list_device_sessions(p_ticket_reference text, p_justification text)
returns table (
  user_id uuid, device_id uuid, session_id uuid, device_label text,
  user_agent text, device_status text, session_status text,
  requested_at timestamptz, last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid(); t public.it_support_tickets%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if nullif(btrim(p_justification), '') is null then raise exception 'Justification is required' using errcode = '22023'; end if;
  select * into t from public.it_support_tickets where ticket_reference = p_ticket_reference
    and assigned_to = actor_id and status = 'active';
  if not found then raise exception 'Active assigned support ticket not found' using errcode = '42501'; end if;
  if not exists (select 1 from public.it_support_members ism where ism.user_id = actor_id and ism.organization_id = t.organization_id and ism.active)
     or not exists (select 1 from public.organization_members support_member where support_member.user_id = actor_id and support_member.organization_id = t.organization_id and support_member.status = 'active')
     or not exists (select 1 from public.organization_members om where om.user_id = t.target_user_id
                    and om.organization_id = t.organization_id and om.status = 'active') then
    raise exception 'Ticket scope is no longer valid' using errcode = '42501';
  end if;
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, target_user_id, organization_id, ticket_reference, justification, outcome)
  values (actor_id, 'device_sessions.list', 'support_ticket', t.id::text, t.target_user_id, t.organization_id, t.ticket_reference,
          left(public.redact_audit_text(p_justification), 500), 'allowed');
  return query
  select ds.user_id, d.id, ds.session_id, d.label, d.user_agent, d.status, ds.status,
         d.requested_at, greatest(d.last_seen_at, ds.last_seen_at)
    from public.device_sessions ds join public.authorized_devices d on d.id = ds.device_id and d.user_id = ds.user_id
   where ds.user_id = t.target_user_id order by greatest(d.last_seen_at, ds.last_seen_at) desc;
end;
$$;

create or replace function public.support_revoke_device(
  p_ticket_reference text, p_device_id uuid, p_justification text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid(); t public.it_support_tickets%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if nullif(btrim(p_justification), '') is null then raise exception 'Justification is required' using errcode = '22023'; end if;
  select * into t from public.it_support_tickets where ticket_reference = p_ticket_reference
    and assigned_to = actor_id and status = 'active';
  if not found then raise exception 'Active assigned support ticket not found' using errcode = '42501'; end if;
  if not exists (select 1 from public.it_support_members ism where ism.user_id = actor_id and ism.organization_id = t.organization_id and ism.active)
     or not exists (select 1 from public.organization_members support_member where support_member.user_id = actor_id and support_member.organization_id = t.organization_id and support_member.status = 'active')
     or not exists (select 1 from public.organization_members om where om.user_id = t.target_user_id
                    and om.organization_id = t.organization_id and om.status = 'active') then
    raise exception 'Ticket scope is no longer valid' using errcode = '42501';
  end if;
  update public.authorized_devices d set status = 'revoked', revoked_at = now(), revoked_by = actor_id
   where d.id = p_device_id and d.user_id = t.target_user_id and d.status <> 'revoked';
  if not found then raise exception 'Target device not found' using errcode = 'P0002'; end if;
  update public.device_sessions ds set status = 'revoked', revoked_at = now(), revoked_by = actor_id
   where ds.device_id = p_device_id and ds.user_id = t.target_user_id and ds.status <> 'revoked';
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, organization_id, ticket_reference, justification, outcome)
  values (actor_id, 'device.revoke', 'device', p_device_id::text, t.organization_id, t.ticket_reference,
          left(public.redact_audit_text(p_justification), 500), 'allowed');
end;
$$;

create or replace function public.support_revoke_session(
  p_ticket_reference text, p_session_id uuid, p_justification text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid(); t public.it_support_tickets%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if nullif(btrim(p_justification), '') is null then raise exception 'Justification is required' using errcode = '22023'; end if;
  select * into t from public.it_support_tickets where ticket_reference = p_ticket_reference
    and assigned_to = actor_id and status = 'active';
  if not found then raise exception 'Active assigned support ticket not found' using errcode = '42501'; end if;
  if not exists (select 1 from public.it_support_members ism where ism.user_id = actor_id and ism.organization_id = t.organization_id and ism.active)
     or not exists (select 1 from public.organization_members support_member where support_member.user_id = actor_id and support_member.organization_id = t.organization_id and support_member.status = 'active')
     or not exists (select 1 from public.organization_members om where om.user_id = t.target_user_id
                    and om.organization_id = t.organization_id and om.status = 'active') then
    raise exception 'Ticket scope is no longer valid' using errcode = '42501';
  end if;
  update public.device_sessions ds set status = 'revoked', revoked_at = now(), revoked_by = actor_id
   where ds.session_id = p_session_id and ds.user_id = t.target_user_id and ds.status <> 'revoked';
  if not found then raise exception 'Target session not found' using errcode = 'P0002'; end if;
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, organization_id, ticket_reference, justification, outcome)
  values (actor_id, 'session.revoke', 'session', p_session_id::text, t.organization_id, t.ticket_reference,
          left(public.redact_audit_text(p_justification), 500), 'allowed');
end;
$$;

create or replace function public.admin_revoke_it_support(
  p_user_id uuid, p_organization_id uuid, p_justification text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if nullif(btrim(p_justification), '') is null then raise exception 'Justification is required' using errcode = '22023'; end if;
  update public.it_support_members set active = false where user_id = p_user_id and organization_id = p_organization_id and active;
  if not found then raise exception 'IT support assignment not found' using errcode = 'P0002'; end if;
  update public.it_support_tickets set status = 'closed', closed_at = now(), closed_by = actor_id
   where assigned_to = p_user_id and organization_id = p_organization_id and status = 'active';
  update public.it_support_tickets set status = 'closed', closed_at = now(), closed_by = actor_id
   where assigned_to = p_user_id and organization_id = p_organization_id and status = 'active';
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, organization_id, justification, outcome)
  values (actor_id, 'it_support.revoke', 'it_support_assignment', p_user_id::text, p_organization_id,
          left(public.redact_audit_text(p_justification), 500), 'allowed');
end;
$$;

create or replace function public.admin_close_it_support_ticket(p_ticket_reference text, p_justification text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid(); ticket_row public.it_support_tickets%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if nullif(btrim(p_justification), '') is null then raise exception 'Justification is required' using errcode = '22023'; end if;
  select * into ticket_row from public.it_support_tickets where ticket_reference = p_ticket_reference and status = 'active' for update;
  if not found then raise exception 'Active support ticket not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin')
     and ticket_row.assigned_to <> actor_id then
    raise exception 'Assigned support agent or platform administrator required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = actor_id and pu.role = 'platform_admin')
     and not exists (select 1 from public.it_support_members ism where ism.user_id = actor_id and ism.organization_id = ticket_row.organization_id and ism.active) then
    raise exception 'Support assignment is no longer active' using errcode = '42501';
  end if;
  update public.it_support_tickets set status = 'closed', closed_at = now(), closed_by = actor_id where id = ticket_row.id;
  insert into public.administrative_audit_logs(actor_user_id, action, target_type, target_id, organization_id, ticket_reference, justification, outcome)
  values (actor_id, 'support_ticket.close', 'support_ticket', ticket_row.id::text, ticket_row.organization_id,
          ticket_row.ticket_reference, left(public.redact_audit_text(p_justification), 500), 'allowed');
end;
$$;

create or replace function public.admin_list_administrative_audit(p_before timestamptz default null, p_limit integer default 50)
returns setof public.administrative_audit_logs
language plpgsql
stable
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
  return query select * from public.administrative_audit_logs a
    where p_before is null or a.occurred_at < p_before
    order by a.occurred_at desc, a.id desc limit p_limit;
end;
$$;

-- Add the same device gate to the existing privileged department RPCs.
create or replace function public.admin_list_departments(p_organization_id uuid)
returns setof public.departments language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = auth.uid() and pu.role = 'platform_admin') then raise exception 'Platform administrator role required' using errcode = '42501'; end if;
  insert into public.administrative_audit_logs(actor_user_id,action,target_type,target_id,outcome)
  values(auth.uid(),'department.list','organization',p_organization_id::text,'allowed');
  return query select d.* from public.departments d where d.organization_id = p_organization_id order by lower(btrim(d.name)), d.id;
end; $$;

create or replace function public.admin_create_department(p_organization_id uuid, p_name text)
returns setof public.departments language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = auth.uid() and pu.role = 'platform_admin') then raise exception 'Platform administrator role required' using errcode = '42501'; end if;
  if p_organization_id is null or p_name is null or length(btrim(p_name)) = 0 then raise exception 'Organization and non-empty department name are required' using errcode = '22023'; end if;
  insert into public.administrative_audit_logs(actor_user_id,action,target_type,target_id,outcome)
  values(auth.uid(),'department.create','organization',p_organization_id::text,'allowed');
  return query insert into public.departments(organization_id,name) values (p_organization_id,btrim(p_name)) returning *;
end; $$;

create or replace function public.admin_update_department(p_department_id uuid, p_organization_id uuid, p_name text)
returns setof public.departments language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id = auth.uid() and pu.role = 'platform_admin') then raise exception 'Platform administrator role required' using errcode = '42501'; end if;
  if p_department_id is null or p_organization_id is null or p_name is null or length(btrim(p_name))=0 then raise exception 'Department, organization and non-empty name are required' using errcode = '22023'; end if;
  insert into public.administrative_audit_logs(actor_user_id,action,target_type,target_id,outcome)
  values(auth.uid(),'department.update','department',p_department_id::text,'allowed');
  return query update public.departments d set name=btrim(p_name) where d.id=p_department_id and d.organization_id=p_organization_id and d.status='active' returning d.*;
  if not found then raise exception 'Active department not found in organization' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.admin_deactivate_department(p_department_id uuid, p_organization_id uuid)
returns setof public.departments language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id=auth.uid() and pu.role='platform_admin') then raise exception 'Platform administrator role required' using errcode='42501'; end if;
  perform 1 from public.departments d where d.id=p_department_id and d.organization_id=p_organization_id and d.status='active' for update;
  if not found then raise exception 'Active department not found in organization' using errcode='P0002'; end if;
  insert into public.administrative_audit_logs(actor_user_id,action,target_type,target_id,outcome)
  values(auth.uid(),'department.deactivate','department',p_department_id::text,'allowed');
  update public.department_members dm set ended_at=now(), ended_by=auth.uid() where dm.department_id=p_department_id and dm.organization_id=p_organization_id and dm.ended_at is null;
  return query update public.departments d set status='inactive' where d.id=p_department_id and d.organization_id=p_organization_id and d.status='active' returning d.*;
end; $$;

create or replace function public.admin_list_department_members(p_department_id uuid, p_organization_id uuid)
returns setof public.department_members language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode='42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id=auth.uid() and pu.role='platform_admin') then raise exception 'Platform administrator role required' using errcode='42501'; end if;
  insert into public.administrative_audit_logs(actor_user_id,action,target_type,target_id,outcome)
  values(auth.uid(),'department.members.list','department',p_department_id::text,'allowed');
  return query select dm.* from public.department_members dm where dm.department_id=p_department_id and dm.organization_id=p_organization_id order by dm.ended_at nulls first,dm.created_at,dm.id;
end; $$;

create or replace function public.admin_transfer_department_member(p_organization_id uuid, p_user_id uuid, p_new_department_id uuid)
returns setof public.department_members language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode='42501'; end if;
  if not exists (select 1 from public.platform_users pu where pu.user_id=actor_id and pu.role='platform_admin') then raise exception 'Platform administrator role required' using errcode='42501'; end if;
  if p_organization_id is null or p_user_id is null or p_new_department_id is null then raise exception 'Organization, employee and destination department are required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_user_id::text, 0));
  if not exists (select 1 from public.departments d where d.id=p_new_department_id and d.organization_id=p_organization_id and d.status='active') then raise exception 'Active destination department not found in organization' using errcode='23514'; end if;
  insert into public.administrative_audit_logs(actor_user_id,action,target_type,target_id,outcome)
  values(actor_id,'department.member.transfer','department',p_new_department_id::text,'allowed');
  update public.department_members dm set ended_at=now(),ended_by=actor_id where dm.organization_id=p_organization_id and dm.user_id=p_user_id and dm.ended_at is null;
  return query insert into public.department_members(organization_id,department_id,user_id,created_by) values(p_organization_id,p_new_department_id,p_user_id,actor_id) returning *;
end; $$;

create or replace function public.redact_audit_text(p_text text)
returns text language sql immutable set search_path = '' as $$
  select left(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text,''),
    '(?i)bearer[[:space:]]+[A-Za-z0-9._~+/=-]+', '[REDACTED]','g'),
    '\meyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\M', '[REDACTED]','g'),
    '(?i)(password|passwd|token|secret|credential)[[:space:]]*[:=][[:space:]]*[^[:space:],;]+', '\1=[REDACTED]','g'), 500);
$$;
revoke all on function public.redact_audit_text(text) from public, anon, authenticated, service_role;

create or replace function public.prevent_audit_log_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Administrative audit records are append-only' using errcode = '42501';
end; $$;
create trigger administrative_audit_logs_append_only
  before update or delete on public.administrative_audit_logs
  for each row execute function public.prevent_audit_log_mutation();
revoke all on function public.prevent_audit_log_mutation() from public, anon, authenticated, service_role;

-- Grant only the RPC surface required by each actor. it_support never receives
-- administrative_audit_logs read access and cannot approve devices or open tickets.
revoke all on function public.admin_list_device_sessions(uuid,text),
  public.admin_approve_device(uuid,text), public.admin_revoke_device(uuid,text),
  public.admin_revoke_session(uuid,text), public.admin_assign_it_support(uuid,uuid,text),
  public.admin_open_it_support_ticket(text,uuid,uuid,text),
  public.admin_revoke_it_support(uuid,uuid,text),
  public.admin_close_it_support_ticket(text,text),
  public.admin_list_administrative_audit(timestamptz,integer),
  public.support_list_device_sessions(text,text), public.support_revoke_device(text,uuid,text),
  public.support_revoke_session(text,uuid,text)
from public, anon, authenticated, service_role;
grant execute on function public.admin_list_device_sessions(uuid,text),
  public.admin_approve_device(uuid,text), public.admin_revoke_device(uuid,text),
  public.admin_revoke_session(uuid,text), public.admin_assign_it_support(uuid,uuid,text),
  public.admin_open_it_support_ticket(text,uuid,uuid,text),
  public.admin_revoke_it_support(uuid,uuid,text),
  public.admin_close_it_support_ticket(text,text),
  public.admin_list_administrative_audit(timestamptz,integer)
to authenticated;
grant execute on function public.support_list_device_sessions(text,text),
  public.support_revoke_device(text,uuid,text), public.support_revoke_session(text,uuid,text)
to authenticated;

comment on table public.authorized_devices is 'Issue #97: random client-generated device IDs and hashed device credentials; no browser fingerprint is used as a device identity.';
comment on table public.device_sessions is 'Issue #97: binds a Supabase Auth session to an approved device; revocation is enforced by RLS and guarded RPCs.';
comment on table public.administrative_audit_logs is 'Issue #97: append-only administrative/security audit. Ordinary clients have no direct table access; credentials and tokens are redacted before persistence.';
