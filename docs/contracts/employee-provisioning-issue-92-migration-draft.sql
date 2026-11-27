-- DRAFT ONLY — Issue #92 employee provisioning persistence.
-- This file is a review artifact, NOT an executable migration.
-- Do not apply to connexa-dev or Production until Tech Lead review and an
-- ordered Supabase migration has been generated through the approved workflow.
--
-- Dependency: Issue #97 foundation migration 20261126005001 and its audit
-- access hardening migration 20261126005334 must be present first.
-- SQA-only migrations 20261126010200 and 20261126010300 are NOT dependencies.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table private.employee_provisioning_operations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key_hash bytea not null,
  payload_hash text not null
    check (payload_hash ~ '^sha256:[a-f0-9]{64}$'),
  email_envelope text not null
    check (length(email_envelope) between 1 and 4096 and email_envelope like 'v1.%'),
  invite_link_envelope text null
    check (invite_link_envelope is null or (length(invite_link_envelope) between 1 and 4096 and invite_link_envelope like 'v1.%')),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'compensation_pending', 'compensated', 'manual_reconciliation_required')),
  phase text not null default 'claimed'
    check (phase in (
      'claimed',
      'auth_creation_started',
      'auth_created',
      'domain_committed',
      'completed',
      'compensation_pending',
      'compensated',
      'manual_reconciliation_required'
    )),
  -- Keep the immutable Auth ID as reconciliation evidence after safe compensation deletes the user.
  auth_user_id uuid null,
  claim_id uuid not null default gen_random_uuid(),
  attempts integer not null default 1 check (attempts > 0),
  failure_code text null check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  auth_created_at timestamptz null,
  domain_committed_at timestamptz null,
  completed_at timestamptz null,
  unique (actor_user_id, idempotency_key_hash),
  unique (auth_user_id)
);

create index employee_provisioning_operations_status_idx
  on private.employee_provisioning_operations(status, updated_at desc);

alter table private.employee_provisioning_operations enable row level security;
revoke all on table private.employee_provisioning_operations
  from public, anon, authenticated, service_role;

-- The #97 append-only audit table is reused. No parallel audit object is created.
-- DEV currently has no metadata column; add a nullable JSON object for the
-- non-sensitive semantic context required by the #92 audit contract.
alter table public.administrative_audit_logs
  add column if not exists metadata jsonb null;

alter table public.administrative_audit_logs
  drop constraint if exists administrative_audit_logs_metadata_object_check;
alter table public.administrative_audit_logs
  add constraint administrative_audit_logs_metadata_object_check
  check (metadata is null or jsonb_typeof(metadata) = 'object');

alter table public.administrative_audit_logs
  drop constraint if exists administrative_audit_logs_target_type_check;
alter table public.administrative_audit_logs
  add constraint administrative_audit_logs_target_type_check
  check (target_type in (
    'device',
    'session',
    'support_ticket',
    'it_support_assignment',
    'department',
    'organization',
    'profile'
  ));

create or replace function private.assert_employee_provisioning_admin()
returns uuid
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

  if public.device_session_is_authorized() is not true then
    raise exception 'Authorized device required' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.platform_users pu
     where pu.user_id = actor_id
       and pu.role = 'platform_admin'
  ) then
    raise exception 'Platform administrator role required' using errcode = '42501';
  end if;

  return actor_id;
end;
$$;
revoke all on function private.assert_employee_provisioning_admin()
  from public, anon, authenticated, service_role;

create or replace function public.admin_claim_employee_provisioning(
  p_idempotency_key text,
  p_payload_hash text,
  p_email_envelope text
)
returns table (
  result text,
  operation_id uuid,
  claim_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.assert_employee_provisioning_admin();
  key_hash bytea;
  operation_row private.employee_provisioning_operations%rowtype;
  inserted boolean := false;
  inserted_count integer := 0;
begin
  if p_idempotency_key is null
     or length(p_idempotency_key) not between 1 and 128
     or p_idempotency_key !~ '^[!-~]+$'
     or p_payload_hash is null
     or p_payload_hash !~ '^sha256:[a-f0-9]{64}$'
     or p_email_envelope is null
     or length(p_email_envelope) not between 1 and 4096
     or p_email_envelope not like 'v1.%' then
    raise exception 'Valid provisioning idempotency data is required'
      using errcode = '22023';
  end if;

  key_hash := extensions.digest(p_idempotency_key, 'sha256');

  insert into private.employee_provisioning_operations (
    actor_user_id, idempotency_key_hash, payload_hash, email_envelope
  )
  values (actor_id, key_hash, p_payload_hash, p_email_envelope)
  on conflict (actor_user_id, idempotency_key_hash) do nothing;

  get diagnostics inserted_count = row_count;
  inserted := inserted_count = 1;

  select op.*
    into operation_row
    from private.employee_provisioning_operations op
   where op.actor_user_id = actor_id
     and op.idempotency_key_hash = key_hash
   for update;

  if not found then
    raise exception 'Provisioning operation could not be claimed'
      using errcode = '40001';
  end if;

  if operation_row.payload_hash <> p_payload_hash then
    return query select 'conflict', operation_row.id, operation_row.claim_id,
                        operation_row.status;
    return;
  end if;

  if operation_row.status in ('completed', 'compensated') then
    return query select 'replay', operation_row.id, operation_row.claim_id,
                        operation_row.status;
    return;
  end if;

  if operation_row.status = 'manual_reconciliation_required' then
    return query select 'manual_reconciliation_required', operation_row.id,
                        operation_row.claim_id, operation_row.status;
    return;
  end if;

  if not inserted then
    -- No automatic takeover: an interrupted Auth call has an ambiguous outcome.
    return query select 'in_progress', operation_row.id, operation_row.claim_id,
                        operation_row.status;
    return;
  end if;

  return query select 'claimed', operation_row.id, operation_row.claim_id,
                      operation_row.status;
end;
$$;

create or replace function public.admin_mark_employee_auth_creation_started(
  p_operation_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.assert_employee_provisioning_admin();
begin
  update private.employee_provisioning_operations op
     set phase = 'auth_creation_started',
         updated_at = now()
   where op.id = p_operation_id
     and op.actor_user_id = actor_id
     and op.claim_id = p_claim_id
     and op.status = 'pending'
     and op.phase = 'claimed';

  return found;
end;
$$;

create or replace function public.admin_persist_employee_auth_user_id(
  p_operation_id uuid,
  p_claim_id uuid,
  p_auth_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.assert_employee_provisioning_admin();
begin
  if p_auth_user_id is null then
    raise exception 'Auth user id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from auth.users au
     where au.id = p_auth_user_id
       and au.email_confirmed_at is null
       and au.raw_app_meta_data ->> 'first_access_pending' = 'true'
       and au.raw_app_meta_data ->> 'employee_provisioning_operation_id' = p_operation_id::text
  ) then
    raise exception 'Auth identity is not owned by this provisioning operation'
      using errcode = '42501';
  end if;

  update private.employee_provisioning_operations op
     set auth_user_id = p_auth_user_id,
         phase = 'auth_created',
         auth_created_at = now(),
         updated_at = now()
   where op.id = p_operation_id
     and op.actor_user_id = actor_id
     and op.claim_id = p_claim_id
     and op.status = 'pending'
     and op.phase = 'auth_creation_started';

  return found;
end;
$$;

create or replace function public.admin_get_employee_provisioning_operation(
  p_operation_id uuid
)
returns table (
  operation_id uuid,
  status text,
  phase text,
  has_invite_link boolean,
  failure_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.assert_employee_provisioning_admin();
begin
  -- Status-only contract: never expose Auth IDs, encrypted PII or invite tokens
  -- through the authenticated PostgREST surface.
  return query
  select
    op.id,
    op.status,
    op.phase,
    (op.invite_link_envelope is not null),
    op.failure_code
  from private.employee_provisioning_operations op
  where op.id = p_operation_id
    and op.actor_user_id = actor_id;
end;
$$;

create or replace function public.admin_commit_employee_provisioning(
  p_operation_id uuid,
  p_claim_id uuid,
  p_auth_user_id uuid,
  p_full_name text,
  p_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.assert_employee_provisioning_admin();
  operation_row private.employee_provisioning_operations%rowtype;
  profile_id uuid;
begin
  if p_auth_user_id is null
     or p_organization_id is null
     or p_full_name is null
     or length(btrim(p_full_name)) not between 1 and 120 then
    raise exception 'Valid employee and organization data are required'
      using errcode = '22023';
  end if;

  select op.*
    into operation_row
    from private.employee_provisioning_operations op
   where op.id = p_operation_id
     and op.actor_user_id = actor_id
     and op.claim_id = p_claim_id
   for update;

  if not found
     or operation_row.status <> 'pending'
     or operation_row.phase <> 'auth_created'
     or operation_row.auth_user_id <> p_auth_user_id then
    raise exception 'Provisioning operation is not ready for domain commit'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
      from auth.users au
     where au.id = p_auth_user_id
       and au.email_confirmed_at is null
       and au.raw_app_meta_data ->> 'first_access_pending' = 'true'
       and au.raw_app_meta_data ->> 'employee_provisioning_operation_id' = p_operation_id::text
  ) then
    raise exception 'Auth identity is not pending first access for this operation'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations org where org.id = p_organization_id
  ) then
    raise exception 'Organization not found' using errcode = '23503';
  end if;

  insert into public.profiles(id, full_name)
  values (p_auth_user_id, btrim(p_full_name))
  returning id into profile_id;

  insert into public.organization_members(organization_id, user_id, role, status)
  values (p_organization_id, profile_id, 'member', 'active');

  insert into public.administrative_audit_logs (
    actor_user_id,
    action,
    target_type,
    target_id,
    target_user_id,
    organization_id,
    justification,
    metadata,
    outcome
  )
  values (
    actor_id,
    'employee.created',
    'profile',
    profile_id::text,
    p_auth_user_id,
    p_organization_id,
    'Provisionamento administrativo de colaborador',
    jsonb_build_object(
      'provisioning_operation_id', p_operation_id,
      'initial_role', 'member'
    ),
    'allowed'
  );

  update private.employee_provisioning_operations
     set phase = 'domain_committed',
         domain_committed_at = now(),
         updated_at = now()
   where id = p_operation_id
     and actor_user_id = actor_id
     and claim_id = p_claim_id;

  return true;
end;
$$;

create or replace function public.admin_persist_employee_invite_link(
  p_operation_id uuid,
  p_claim_id uuid,
  p_invite_link_envelope text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.assert_employee_provisioning_admin();
begin
  if p_invite_link_envelope is null
     or length(p_invite_link_envelope) not between 1 and 4096
     or p_invite_link_envelope not like 'v1.%' then
    raise exception 'Encrypted invite link is required' using errcode = '22023';
  end if;

  update private.employee_provisioning_operations op
     set invite_link_envelope = p_invite_link_envelope,
         updated_at = now()
   where op.id = p_operation_id
     and op.actor_user_id = actor_id
     and op.claim_id = p_claim_id
     and op.auth_user_id is not null
     and op.invite_link_envelope is null
     and op.status = 'pending'
     and op.phase = 'domain_committed';

  return found;
end;
$$;

-- Privileged recovery for a lost HTTP response. Only the original actor may
-- retrieve the encrypted envelope, and only the server-side service role may
-- call this RPC. The application decrypts the envelope after this check.
create or replace function public.admin_get_employee_provisioning_invite_link(
  p_operation_id uuid,
  p_actor_user_id uuid
)
returns table (invite_link_envelope text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_actor_user_id is null then
    return;
  end if;

  return query
  select op.invite_link_envelope
    from private.employee_provisioning_operations op
   where op.id = p_operation_id
     and op.actor_user_id = p_actor_user_id
     and op.status = 'completed'
     and op.phase = 'completed'
     and op.invite_link_envelope is not null;
end;
$$;

create or replace function public.admin_mark_employee_compensation_pending(
  p_operation_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.assert_employee_provisioning_admin();
begin
  update private.employee_provisioning_operations op
     set phase = 'compensation_pending',
         status = 'compensation_pending',
         updated_at = now()
   where op.id = p_operation_id
     and op.actor_user_id = actor_id
     and op.claim_id = p_claim_id
     and op.status = 'pending'
     and op.phase = 'auth_created';

  return found;
end;
$$;

create or replace function public.admin_mark_employee_compensated(
  p_operation_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.assert_employee_provisioning_admin();
begin
  update private.employee_provisioning_operations op
     set phase = 'compensated',
         status = 'compensated',
         updated_at = now()
   where op.id = p_operation_id
     and op.actor_user_id = actor_id
     and op.claim_id = p_claim_id
     and op.status = 'compensation_pending'
     and op.phase = 'compensation_pending';

  return found;
end;
$$;

create or replace function public.admin_complete_employee_provisioning(
  p_operation_id uuid,
  p_claim_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.assert_employee_provisioning_admin();
begin
  update private.employee_provisioning_operations op
     set phase = 'completed',
         status = 'completed',
         completed_at = now(),
         updated_at = now()
   where op.id = p_operation_id
     and op.actor_user_id = actor_id
     and op.claim_id = p_claim_id
     and op.status = 'pending'
     and op.phase = 'domain_committed'
      and op.invite_link_envelope is not null;

  return found;
end;
$$;

create or replace function public.admin_mark_employee_provisioning_manual_reconciliation(
  p_operation_id uuid,
  p_claim_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.assert_employee_provisioning_admin();
begin
  if p_failure_code is null or p_failure_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'Valid reconciliation reason is required'
      using errcode = '22023';
  end if;

  update private.employee_provisioning_operations op
     set phase = 'manual_reconciliation_required',
         status = 'manual_reconciliation_required',
         failure_code = p_failure_code,
         updated_at = now()
   where op.id = p_operation_id
     and op.actor_user_id = actor_id
     and op.claim_id = p_claim_id
     and op.status in ('pending', 'compensation_pending');

  return found;
end;
$$;

-- SECURITY DEFINER RPCs are explicitly closed to PUBLIC/anon and granted only
-- to authenticated callers. Every function rechecks platform admin + device.
revoke all on function public.admin_claim_employee_provisioning(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_mark_employee_auth_creation_started(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_persist_employee_auth_user_id(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_get_employee_provisioning_operation(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_commit_employee_provisioning(uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_persist_employee_invite_link(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_get_employee_provisioning_invite_link(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_mark_employee_compensation_pending(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_mark_employee_compensated(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_complete_employee_provisioning(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_mark_employee_provisioning_manual_reconciliation(uuid,uuid,text)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_claim_employee_provisioning(text,text,text) to authenticated;
grant execute on function public.admin_mark_employee_auth_creation_started(uuid,uuid) to authenticated;
grant execute on function public.admin_persist_employee_auth_user_id(uuid,uuid,uuid) to authenticated;
grant execute on function public.admin_get_employee_provisioning_operation(uuid) to authenticated;
grant execute on function public.admin_commit_employee_provisioning(uuid,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.admin_persist_employee_invite_link(uuid,uuid,text) to authenticated;
grant execute on function public.admin_get_employee_provisioning_invite_link(uuid,uuid) to service_role;
grant execute on function public.admin_mark_employee_compensation_pending(uuid,uuid) to authenticated;
grant execute on function public.admin_mark_employee_compensated(uuid,uuid) to authenticated;
grant execute on function public.admin_complete_employee_provisioning(uuid,uuid) to authenticated;
grant execute on function public.admin_mark_employee_provisioning_manual_reconciliation(uuid,uuid,text) to authenticated;

comment on column public.administrative_audit_logs.metadata is
  'Non-sensitive structured context for administrative audit events; never store credentials, tokens, email addresses or other PII here.';

comment on table private.employee_provisioning_operations is
  'Issue #92 operational idempotency/reconciliation state only; not an audit log. Email is AES-256-GCM encrypted by the server.';
comment on function public.admin_commit_employee_provisioning(uuid,uuid,uuid,text,uuid) is
  'Issue #92: atomically create profile, single organization membership and employee.created central audit event.';
