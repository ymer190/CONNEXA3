-- Cover the composite foreign keys introduced by the Issue #96 schema.
create index conversations_created_by_organization_idx
  on public.conversations (organization_id, created_by);
create index conversations_department_organization_idx
  on public.conversations (department_id, organization_id);
create index conversations_direct_high_organization_idx
  on public.conversations (organization_id, direct_user_high);

create index conversation_members_conversation_organization_idx
  on public.conversation_members (conversation_id, organization_id);
create index conversation_members_user_organization_idx
  on public.conversation_members (organization_id, user_id);
create index conversation_members_added_by_organization_idx
  on public.conversation_members (organization_id, added_by);

create index messages_conversation_organization_idx
  on public.messages (conversation_id, organization_id);
create index messages_sender_organization_idx
  on public.messages (organization_id, sender_id);
create index messages_deleted_by_organization_idx
  on public.messages (organization_id, deleted_by);

create index message_attachments_message_scope_idx
  on public.message_attachments (message_id, conversation_id, organization_id);
create index message_attachments_uploader_organization_idx
  on public.message_attachments (organization_id, uploaded_by);

create index conversation_audit_logs_conversation_scope_idx
  on public.conversation_audit_logs (conversation_id, organization_id);
create index conversation_audit_logs_actor_organization_idx
  on public.conversation_audit_logs (organization_id, actor_id);
create index conversation_audit_logs_target_organization_idx
  on public.conversation_audit_logs (organization_id, target_user_id);
