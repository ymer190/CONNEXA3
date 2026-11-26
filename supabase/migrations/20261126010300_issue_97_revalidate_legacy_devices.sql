-- Gate-only migration proposal for SQA/Tech Lead review.
-- Do not apply until 20261126010200 is reviewed, the protected break-glass
-- environment is configured, JWT tests pass, and counts/rollback are approved.
begin;

do $$
declare
  expected_pairs integer;
  updated_devices integer;
  updated_sessions integer;
  inserted_audit_events integer;
  still_approved integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('issue97_legacy_device_revalidation', 0));

  with legacy as materialized (
    select d.id, d.user_id, ds.session_id
      from public.authorized_devices d
      join public.device_sessions ds on ds.device_id = d.id and ds.user_id = d.user_id
     where d.id = ds.session_id and d.status = 'approved' and ds.status = 'approved'
  ),
  counts as (
    select count(*)::integer as expected from legacy
  ),
  devices as (
    update public.authorized_devices d
       set status = 'pending', approved_at = null, approved_by = null
      from legacy l
     where d.id = l.id and d.user_id = l.user_id
     returning d.id, d.user_id
  ),
  sessions as (
    update public.device_sessions ds
       set status = 'pending', revoked_at = null, revoked_by = null
      from devices d
     where ds.session_id = d.id and ds.device_id = d.id
       and ds.user_id = d.user_id and ds.status = 'approved'
     returning ds.session_id, ds.user_id, ds.device_id
  ),
  audit_events as (
    insert into public.administrative_audit_logs(
      actor_user_id, action, target_type, target_id, target_user_id, justification, outcome
    )
    select null, 'device.legacy_revalidation_required', 'device', s.device_id::text,
           s.user_id,
           'Controlled legacy revalidation rollout; historical device/session identifiers preserved.',
           'allowed'
      from sessions s
    returning id
  )
  select counts.expected,
         (select count(*)::integer from devices),
         (select count(*)::integer from sessions),
         (select count(*)::integer from audit_events)
    into expected_pairs, updated_devices, updated_sessions, inserted_audit_events
    from counts;

  if expected_pairs = 0
     or updated_devices <> expected_pairs
     or updated_sessions <> expected_pairs
     or inserted_audit_events <> expected_pairs then
    raise exception 'Legacy rollout count mismatch: expected %, devices %, sessions %, audit events %; rolling back',
      expected_pairs, updated_devices, updated_sessions, inserted_audit_events;
  end if;

  select count(*)::integer into still_approved
    from public.authorized_devices d
    join public.device_sessions ds on ds.device_id = d.id and ds.user_id = d.user_id
   where d.id = ds.session_id and d.status = 'approved' and ds.status = 'approved';
  if still_approved <> 0 then
    raise exception 'Legacy rollout postcondition failed: % approved pairs remain; rolling back', still_approved;
  end if;

  raise notice 'Legacy revalidation complete: % pairs selected, devices/sessions updated, and audit events inserted.', expected_pairs;
end;
$$;

commit;
