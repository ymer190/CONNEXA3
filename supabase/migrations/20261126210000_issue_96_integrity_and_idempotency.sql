-- Issue #96 follow-up: close nullable CHECK gaps and add message idempotency key.
-- Additive migration: do not rewrite migrations already applied in DEV.

alter table public.conversations
  drop constraint conversations_type_fields_check;

alter table public.conversations
  add constraint conversations_type_fields_check check (
    (type = 'channel'
      and visibility is not null
      and visibility in ('public', 'private')
      and direct_user_low is null
      and direct_user_high is null)
    or (type = 'direct'
      and visibility is null
      and direct_user_low is not null
      and direct_user_high is not null
      and direct_user_low < direct_user_high)
    or (type = 'group'
      and visibility is null
      and direct_user_low is null
      and direct_user_high is null)
  );

alter table public.messages
  drop constraint messages_type_fields_check;

alter table public.messages
  add constraint messages_type_fields_check check (
    (message_type = 'system'
      and sender_id is null
      and encrypted_payload is null
      and system_event_key is not null
      and length(btrim(system_event_key)) > 0
      and (system_event_metadata is null or jsonb_typeof(system_event_metadata) = 'object'))
    or (message_type <> 'system'
      and sender_id is not null
      and encrypted_payload is not null
      and jsonb_typeof(encrypted_payload) = 'object'
      and system_event_key is null
      and system_event_metadata is null)
  );

-- Client-generated UUID used by trusted send-message operations to make retries
-- idempotent. The partial unique index permits legacy/system rows without a key;
-- all new client message writes must provide it in the RPC contract.
alter table public.messages
  add column client_message_id uuid;

create unique index messages_conversation_sender_client_message_key
  on public.messages (conversation_id, sender_id, client_message_id)
  where client_message_id is not null;

comment on column public.messages.client_message_id is
  'Client-generated idempotency UUID. Trusted message-write operations must require it and return the existing message on retry.';
