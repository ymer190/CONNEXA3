-- Preserve append-only audit history for application service credentials too.
create trigger administrative_audit_logs_no_truncate
  before truncate on public.administrative_audit_logs
  for each statement execute function public.prevent_audit_log_mutation();
revoke update, delete, truncate on public.administrative_audit_logs from service_role;
