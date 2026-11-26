-- Fix PL/pgSQL name ambiguity between the session_id variable and column.
-- This migration changes function behavior only; it does not update device data.
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
  v_actor_id uuid := auth.uid();
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_secret_hash bytea;
  v_device_status text;
  v_current_device_id uuid;
begin
  if v_actor_id is null or v_session_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_device_id is null or p_device_secret is null or length(p_device_secret) < 32
     or p_label is null or length(btrim(p_label)) not between 1 and 80 then
    raise exception 'Valid device enrollment data is required' using errcode = '22023';
  end if;
  v_secret_hash := extensions.digest(p_device_secret, 'sha256');
  select ds.device_id into v_current_device_id
    from public.device_sessions ds
   where ds.session_id = v_session_id and ds.user_id = v_actor_id;
  if found then
    if v_current_device_id <> p_device_id then
      raise exception 'Session is already bound to another device' using errcode = '42501';
    end if;
    return (select d.status from public.authorized_devices d where d.id = p_device_id);
  end if;

  select d.status into v_device_status
    from public.authorized_devices d
   where d.id = p_device_id and d.user_id = v_actor_id
     and d.secret_hash = v_secret_hash
   for update;
  if not found then
    if exists (select 1 from public.authorized_devices d where d.id = p_device_id) then
      raise exception 'Device credential is invalid' using errcode = '42501';
    end if;
    insert into public.authorized_devices(id, user_id, secret_hash, label, user_agent)
    values (p_device_id, v_actor_id, v_secret_hash, btrim(p_label), left(p_user_agent, 500));
    v_device_status := 'pending';
  elsif v_device_status = 'revoked' then
    raise exception 'Revoked device cannot be re-enrolled' using errcode = '42501';
  else
    update public.authorized_devices
       set last_seen_at = now(), user_agent = left(p_user_agent, 500)
     where id = p_device_id and user_id = v_actor_id;
  end if;

  insert into public.device_sessions(session_id, user_id, device_id, status)
  values (v_session_id, v_actor_id, p_device_id,
          case when v_device_status = 'approved' then 'approved' else 'pending' end);
  return v_device_status;
end;
$$;

revoke all on function public.register_device_session(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.register_device_session(uuid, text, text, text)
  to authenticated;

