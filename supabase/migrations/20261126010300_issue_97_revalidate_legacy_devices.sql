-- Gate-only migration proposal for SQA/Tech Lead review.
-- Do not apply until 20261126010200 is reviewed and the administrator recovery
-- procedure, JWT test matrix, counts, and rollback plan are approved.
begin;

select pg_advisory_xact_lock(hashtextextended('issue97_legacy_device_revalidation', 0));

do $$
declare
  legacy_count integer;
begin
  select count(*) into legacy_count
    from public.authorized_devices d
    join public.device_sessions ds on ds.device_id = d.id and ds.user_id = d.user_id
   where d.id = ds.session_id and d.status = 'approved' and ds.status = 'approved';
  if legacy_count = 0 then
    raise exception 'No approved legacy device/session pairs found; refusing an empty revalidation rollout';
  end if;
  raise notice 'Legacy device/session pairs selected for revalidation: %', legacy_count;
end;
$$;

with legacy as (
  select d.id, d.user_id
    from public.authorized_devices d
    join public.device_sessions ds on ds.device_id = d.id and ds.user_id = d.user_id
   where d.id = ds.session_id and d.status = 'approved' and ds.status = 'approved'
), devices as (
  update public.authorized_devices d
     set status = 'pending', approved_at = null, approved_by = null
    from legacy l
   where d.id = l.id and d.user_id = l.user_id
   returning d.id, d.user_id
), sessions as (
  update public.device_sessions ds
     set status = 'pending', revoked_at = null, revoked_by = null
    from devices d
   where ds.device_id = d.id and ds.user_id = d.user_id and ds.status = 'approved'
   returning ds.session_id, ds.user_id, ds.device_id
)
insert into public.administrative_audit_logs(
  actor_user_id, action, target_type, target_id, target_user_id, justification, outcome
)
select null, 'device.legacy_revalidation_required', 'device', s.device_id::text,
       s.user_id,
       'Controlled legacy revalidation rollout; historical device/session identifiers preserved.',
       'allowed'
  from sessions s;

do $$
declare
  still_approved integer;
  audit_events integer;
begin
  select count(*) into still_approved
    from public.authorized_devices d
    join public.device_sessions ds on ds.device_id = d.id and ds.user_id = d.user_id
   where d.id = ds.session_id and d.status = 'approved' and ds.status = 'approved';
  select count(*) into audit_events from public.administrative_audit_logs
   where action = 'device.legacy_revalidation_required'
     and occurred_at >= transaction_timestamp();
  if still_approved <> 0 or audit_events = 0 then
    raise exception 'Legacy revalidation postcondition failed; rolling back';
  end if;
  raise notice 'Legacy revalidation audit events written: %', audit_events;
end;
$$;

commit;
