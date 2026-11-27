-- Scrub credentials and opaque tokens from free-text audit and device metadata.
create or replace function public.redact_audit_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text,''),
    '(?i)bearer[[:space:]]+[A-Za-z0-9._~+/=-]+', '[REDACTED]','g'),
    '\meyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\M', '[REDACTED]','g'),
    '(?i)(password|passwd|token|secret|credential|access_token|refresh_token)[[:space:]]*[:=][[:space:]]*[^[:space:],;]+', '\1=[REDACTED]','g'),
    '\m[A-Za-z0-9_-]{32,}\M', '[REDACTED]','g'), 500);
$$;
revoke all on function public.redact_audit_text(text) from public, anon, authenticated, service_role;

create or replace function public.sanitize_device_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_agent := public.redact_audit_text(new.user_agent);
  new.label := left(public.redact_audit_text(new.label), 80);
  return new;
end;
$$;
revoke all on function public.sanitize_device_metadata() from public, anon, authenticated, service_role;
create trigger authorized_devices_sanitize_metadata
  before insert or update of label, user_agent on public.authorized_devices
  for each row execute function public.sanitize_device_metadata();

update public.authorized_devices
   set user_agent = public.redact_audit_text(user_agent),
       label = left(public.redact_audit_text(label), 80)
 where user_agent is not null or label is not null;
