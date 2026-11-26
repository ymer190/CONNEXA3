-- Issue #96 conversation storage foundation.
-- Tables are intentionally closed to all API roles until separately reviewed
-- server operations, RLS predicates, encryption and Storage gates are shipped.

-- The global unique key on user_id remains in place. This redundant candidate
-- key enables declarative same-organization foreign keys for conversation data.
alter table public.organization_members
  add constraint organization_members_organization_id_user_id_key
  unique (organization_id, user_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  type text not null check (type in ('channel', 'direct', 'group')),
  title text,
  visibility text,
  department_id uuid,
  created_by uuid not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  direct_user_low uuid,
  direct_user_high uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint conversations_id_organization_id_key unique (id, organization_id),
  constraint conversations_created_by_organization_fk
    foreign key (organization_id, created_by)
    references public.organization_members (organization_id, user_id),
  constraint conversations_department_organization_fk
    foreign key (department_id, organization_id)
    references public.departments (id, organization_id),
  constraint conversations_type_fields_check check (
    (type = 'channel' and visibility in ('public', 'private')
      and direct_user_low is null and direct_user_high is null)
    or (type = 'direct' and visibility is null
      and direct_user_low is not null and direct_user_high is not null
      and direct_user_low < direct_user_high)
    or (type = 'group' and visibility is null
      and direct_user_low is null and direct_user_high is null)
  ),
  constraint conversations_archive_state_check check (
    (status = 'active' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  ),
  constraint conversations_direct_user_low_organization_fk
    foreign key (organization_id, direct_user_low)
    references public.organization_members (organization_id, user_id),
  constraint conversations_direct_user_high_organization_fk
    foreign key (organization_id, direct_user_high)
    references public.organization_members (organization_id, user_id)
);

create unique index conversations_active_direct_pair_key
  on public.conversations (organization_id, direct_user_low, direct_user_high)
  where type = 'direct' and status = 'active';
create index conversations_organization_status_idx
  on public.conversations (organization_id, status, created_at desc, id desc);

create table public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null,
  status text not null check (status in ('invited', 'active', 'left', 'removed')),
  added_by uuid,
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_members_conversation_organization_fk
    foreign key (conversation_id, organization_id)
    references public.conversations (id, organization_id),
  constraint conversation_members_user_organization_fk
    foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id),
  constraint conversation_members_added_by_organization_fk
    foreign key (organization_id, added_by)
    references public.organization_members (organization_id, user_id),
  constraint conversation_members_lifecycle_check check (
    (status = 'invited' and added_by is not null and joined_at is null and removed_at is null)
    or (status = 'active' and joined_at is not null and removed_at is null)
    or (status in ('left', 'removed') and joined_at is not null and removed_at is not null)
  ),
  constraint conversation_members_timestamp_order_check check (
    (joined_at is null or joined_at >= created_at)
    and (removed_at is null or (joined_at is not null and removed_at >= joined_at))
  )
);

create unique index conversation_members_open_episode_key
  on public.conversation_members (conversation_id, user_id)
  where status in ('invited', 'active');
create index conversation_members_user_status_conversation_idx
  on public.conversation_members (user_id, status, conversation_id);
create index conversation_members_conversation_status_idx
  on public.conversation_members (conversation_id, status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  sender_id uuid,
  encrypted_payload jsonb,
  message_type text not null check (message_type in ('text', 'image', 'video', 'audio', 'document', 'system')),
  system_event_key text,
  system_event_metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint messages_conversation_organization_fk
    foreign key (conversation_id, organization_id)
    references public.conversations (id, organization_id),
  constraint messages_id_conversation_organization_key
    unique (id, conversation_id, organization_id),
  constraint messages_sender_organization_fk
    foreign key (organization_id, sender_id)
    references public.organization_members (organization_id, user_id),
  constraint messages_deleted_by_organization_fk
    foreign key (organization_id, deleted_by)
    references public.organization_members (organization_id, user_id),
  constraint messages_type_fields_check check (
    (message_type = 'system' and sender_id is null
      and encrypted_payload is null and system_event_key is not null
      and length(btrim(system_event_key)) > 0
      and (system_event_metadata is null or jsonb_typeof(system_event_metadata) = 'object'))
    or (message_type <> 'system' and sender_id is not null
      and system_event_key is null and system_event_metadata is null
      and (encrypted_payload is null or jsonb_typeof(encrypted_payload) = 'object'))
  ),
  constraint messages_deleted_fields_check check (
    (deleted_at is null and deleted_by is null)
    or (deleted_at is not null and deleted_by is not null)
  )
);

create index messages_conversation_timeline_idx
  on public.messages (conversation_id, created_at, id);
create index messages_sender_created_idx
  on public.messages (sender_id, created_at);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  message_id uuid not null,
  uploaded_by uuid not null,
  bucket_id text not null,
  object_path text not null,
  original_filename text not null,
  detected_mime_type text not null,
  file_category text not null check (file_category in ('image', 'video', 'audio', 'document')),
  size_bytes bigint not null check (size_bytes > 0),
  scan_status text not null default 'quarantined'
    check (scan_status in ('quarantined', 'clean', 'rejected', 'pending_deletion', 'deleted')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint message_attachments_message_conversation_organization_fk
    foreign key (message_id, conversation_id, organization_id)
    references public.messages (id, conversation_id, organization_id),
  constraint message_attachments_uploader_organization_fk
    foreign key (organization_id, uploaded_by)
    references public.organization_members (organization_id, user_id),
  constraint message_attachments_bucket_object_key unique (bucket_id, object_path),
  constraint message_attachments_size_by_category_check check (
    (file_category = 'image' and size_bytes <= 15728640)
    or (file_category = 'audio' and size_bytes <= 26214400)
    or (file_category = 'video' and size_bytes <= 104857600)
    or (file_category = 'document' and size_bytes <= 52428800)
  )
);

create index message_attachments_message_idx on public.message_attachments (message_id);
create index message_attachments_scan_status_idx on public.message_attachments (scan_status, created_at);

create table public.conversation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  conversation_id uuid,
  actor_id uuid,
  target_user_id uuid,
  event_type text not null check (length(btrim(event_type)) > 0),
  outcome text not null check (outcome in ('allowed', 'denied')),
  justification text,
  correlation_id uuid not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint conversation_audit_logs_conversation_organization_fk
    foreign key (conversation_id, organization_id)
    references public.conversations (id, organization_id),
  constraint conversation_audit_logs_actor_organization_fk
    foreign key (organization_id, actor_id)
    references public.organization_members (organization_id, user_id),
  constraint conversation_audit_logs_target_organization_fk
    foreign key (organization_id, target_user_id)
    references public.organization_members (organization_id, user_id)
);

create index conversation_audit_logs_organization_created_idx
  on public.conversation_audit_logs (organization_id, created_at desc, id desc);
create index conversation_audit_logs_conversation_created_idx
  on public.conversation_audit_logs (conversation_id, created_at desc, id desc);
create index conversation_audit_logs_actor_created_idx
  on public.conversation_audit_logs (actor_id, created_at desc, id desc);

create function public.prevent_conversation_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Conversation audit records are append-only' using errcode = '42501';
end;
$$;
revoke all on function public.prevent_conversation_audit_log_mutation()
  from public, anon, authenticated, service_role;
create trigger conversation_audit_logs_append_only
  before update or delete on public.conversation_audit_logs
  for each row execute function public.prevent_conversation_audit_log_mutation();

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();
create trigger conversation_members_set_updated_at
  before update on public.conversation_members
  for each row execute function public.set_updated_at();
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_members force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.message_attachments enable row level security;
alter table public.message_attachments force row level security;
alter table public.conversation_audit_logs enable row level security;
alter table public.conversation_audit_logs force row level security;

revoke all on public.conversations, public.conversation_members, public.messages,
  public.message_attachments, public.conversation_audit_logs
  from public, anon, authenticated, service_role;

comment on table public.conversations is
  'Issue #96 foundation only. No API-role grants or RLS policies until trusted operations and reviewed predicates are implemented.';
comment on table public.conversation_members is
  'Issue #96 membership history. Direct API access is denied; membership lifecycle must use trusted operations.';
comment on table public.messages is
  'Issue #96 encrypted message envelope placeholder only; plaintext is not permitted. No API access until crypto and authorization operations are implemented.';
comment on table public.message_attachments is
  'Issue #96 metadata only. Private buckets, malware scanning, retention rules and authorized delivery remain separate implementation gates.';
comment on table public.conversation_audit_logs is
  'Issue #96 append-only conversation-domain event model; no client writes or reads until trusted audit operations and scoped policies are implemented.';
