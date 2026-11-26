-- Keep direct Data API access denied even if table grants are changed later.
create policy authorized_devices_no_direct_access on public.authorized_devices
  for all to anon, authenticated using (false) with check (false);
create policy device_sessions_no_direct_access on public.device_sessions
  for all to anon, authenticated using (false) with check (false);
create policy it_support_members_no_direct_access on public.it_support_members
  for all to anon, authenticated using (false) with check (false);
create policy it_support_tickets_no_direct_access on public.it_support_tickets
  for all to anon, authenticated using (false) with check (false);
create policy administrative_audit_logs_no_direct_access on public.administrative_audit_logs
  for all to anon, authenticated using (false) with check (false);

create index authorized_devices_approved_by_idx on public.authorized_devices(approved_by);
create index authorized_devices_revoked_by_idx on public.authorized_devices(revoked_by);
create index device_sessions_device_user_idx on public.device_sessions(device_id, user_id);
create index device_sessions_revoked_by_idx on public.device_sessions(revoked_by);
create index it_support_members_assigned_by_idx on public.it_support_members(assigned_by);
create index it_support_members_organization_idx on public.it_support_members(organization_id);
create index it_support_tickets_assignee_organization_idx on public.it_support_tickets(assigned_to, organization_id);
create index it_support_tickets_closed_by_idx on public.it_support_tickets(closed_by);
create index it_support_tickets_opened_by_idx on public.it_support_tickets(opened_by);
create index it_support_tickets_organization_idx on public.it_support_tickets(organization_id);
create index it_support_tickets_target_user_idx on public.it_support_tickets(target_user_id);
create index it_support_tickets_target_user_organization_idx on public.it_support_tickets(target_user_id, organization_id);
