-- Issue #94: global collaborator account lifecycle, enforced alongside #97 sessions.
create table public.collaborator_account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'blocked', 'deactivated')),
  changed_at timestamptz not null default now(),
  changed_by uuid null references auth.users(id) on delete set null,
  justification text not null check (length(btrim(justification)) between 1 and 500)
);

alter table public.collaborator_account_status enable row level security;
revoke all on public.collaborator_account_status from anon, authenticated;
grant all on public.collaborator_account_status to service_role;

alter table public.administrative_audit_logs
  drop constraint administrative_audit_logs_target_type_check;
alter table public.administrative_audit_logs
  add constraint administrative_audit_logs_target_type_check
  check (target_type in (
    'device', 'session', 'support_ticket', 'it_support_assignment',
    'department', 'organization', 'collaborator_account'
  ));

create or replace function public.account_status_is_active(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and not exists (
    select 1 from public.collaborator_account_status s
     where s.user_id = p_user_id and s.status <> 'active'
  );
$$;
revoke all on function public.account_status_is_active(uuid) from public, anon, authenticated, service_role;
grant execute on function public.account_status_is_active(uuid) to authenticated;

-- A live, unexpired JWT stops authorizing immediately after an account status
-- change because this policy checks the authoritative database state per call.
create or replace function public.device_session_is_authorized()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and nullif(auth.jwt() ->> 'session_id', '') is not null
     and public.account_status_is_active(auth.uid())
     and exists (
       select 1
         from public.device_sessions ds
         join public.authorized_devices d on d.id = ds.device_id and d.user_id = ds.user_id
         join auth.sessions s on s.id = ds.session_id and s.user_id = ds.user_id
         join auth.users u on u.id = ds.user_id
        where ds.session_id = (auth.jwt() ->> 'session_id')::uuid
          and ds.user_id = auth.uid()
          and ds.status = 'approved'
          and d.status = 'approved'
          and (s.not_after is null or s.not_after > now())
          and u.deleted_at is null
          and (u.banned_until is null or u.banned_until <= now())
          and (
            exists (select 1 from public.organization_members m where m.user_id = ds.user_id and m.status = 'active')
            or (exists (select 1 from public.platform_users p where p.user_id = ds.user_id and p.role = 'platform_admin')
                and not exists (select 1 from public.organization_members m where m.user_id = ds.user_id))
          )
     );
$$;

-- Guard new session bindings as well as protected resource queries. This
-- prevents a login during suspension from being accepted after reactivation.
create or replace function public.guard_inactive_account_device_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'revoked' and not public.account_status_is_active(new.user_id) then
    raise exception 'Collaborator account is not active' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger device_sessions_active_account_guard
  before insert or update of user_id, status on public.device_sessions
  for each row execute function public.guard_inactive_account_device_session();
revoke all on function public.guard_inactive_account_device_session() from public, anon, authenticated, service_role;

create function public.admin_set_collaborator_account_status(
  p_user_id uuid,
  p_status text,
  p_justification text
)
returns public.collaborator_account_status
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  current_status text;
  changed public.collaborator_account_status%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.device_session_is_authorized() then raise exception 'Authorized device required' using errcode = '42501'; end if;
  if not exists (select 1 from public.platform_users p where p.user_id = actor_id and p.role = 'platform_admin') then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;
  if p_user_id is null or p_status is null or p_status not in ('active', 'blocked', 'deactivated')
     or nullif(btrim(p_justification), '') is null then
    raise exception 'Account, valid status and justification are required' using errcode = '22023';
  end if;
  if p_user_id = actor_id then raise exception 'Self-service account lifecycle changes are forbidden' using errcode = '42501'; end if;

  -- Serialize status changes per account, including initial active state.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 94));
  if not exists (select 1 from auth.users u where u.id = p_user_id and u.deleted_at is null) then
    raise exception 'Active collaborator account not found' using errcode = 'P0002';
  end if;
  insert into public.collaborator_account_status(user_id, status, changed_by, justification)
  values (p_user_id, 'active', actor_id, 'Initial active state') on conflict (user_id) do nothing;
  select s.status into current_status from public.collaborator_account_status s where s.user_id = p_user_id for update;
  if current_status = p_status then raise exception 'Account is already in the requested status' using errcode = '23514'; end if;
  if current_status = 'deactivated' and p_status <> 'active' then
    raise exception 'Deactivated account must be reactivated before another transition' using errcode = '23514';
  end if;

  update public.collaborator_account_status
     set status = p_status, changed_at = now(), changed_by = actor_id,
         justification = left(public.redact_audit_text(p_justification), 500)
   where user_id = p_user_id returning * into changed;

  -- Session bindings and refresh credentials are neutralized in this same
  -- transaction. Approved device trust is deliberately preserved as-is.
  if p_status in ('blocked', 'deactivated') then
    update public.device_sessions ds
       set status = 'revoked', revoked_at = now(), revoked_by = actor_id
     where ds.user_id = p_user_id and ds.status <> 'revoked';
    update auth.refresh_tokens rt set revoked = true
     where rt.user_id = p_user_id and not rt.revoked;
  end if;

  insert into public.administrative_audit_logs(
    actor_user_id, action, target_type, target_id, target_user_id,
    justification, outcome
  ) values (
    actor_id, 'collaborator_account.status_' || p_status, 'collaborator_account',
    p_user_id::text, p_user_id, left(public.redact_audit_text(p_justification), 500), 'allowed'
  );
  return changed;
end;
$$;
revoke all on function public.admin_set_collaborator_account_status(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_collaborator_account_status(uuid, text, text)
  to authenticated;

comment on table public.collaborator_account_status is
  'Issue #94: authoritative global collaborator account state. Changes and session invalidation use admin_set_collaborator_account_status and the central Issue #97 audit log.';

