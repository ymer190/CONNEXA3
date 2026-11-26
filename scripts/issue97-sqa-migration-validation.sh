#!/usr/bin/env bash
set -euo pipefail

: "${AUTH_TEST_SUPABASE_URL:?AUTH_TEST_SUPABASE_URL is required}"
: "${AUTH_TEST_SUPABASE_DB_URL:?AUTH_TEST_SUPABASE_DB_URL is required}"
node scripts/assert-isolated-supabase.cjs

db_query() {
  psql "$AUTH_TEST_SUPABASE_DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "$1"
}

has_revalidation=$(db_query "select count(*) from supabase_migrations.schema_migrations where version = '20261126010300'")
has_sqa_gates=$(db_query "select count(*) from supabase_migrations.schema_migrations where version = '20261126010200'")
has_possession_fix=$(db_query "select count(*) from supabase_migrations.schema_migrations where version = '20261126034944'")
if [[ "$has_revalidation" != "1" || "$has_sqa_gates" != "1" || "$has_possession_fix" != "1" ]]; then
    if [[ "$has_revalidation" == "0" ]]; then
  preflight=$(db_query "select
    count(*) filter (where d.id = ds.session_id and d.status = 'approved' and ds.status = 'approved'),
    count(*) filter (where d.id = ds.session_id and d.status = 'approved' and ds.status = 'approved' and d.approved_at is not null and d.approved_at = d.requested_at and d.approved_by is null),
    (select count(*) from public.administrative_audit_logs)
    from public.authorized_devices d
    join public.device_sessions ds on ds.device_id = d.id and ds.user_id = d.user_id")
  IFS='|' read -r legacy_pairs legacy_provenance audit_rows <<< "$preflight"
  echo "Isolated SQA migration preflight: legacy_pairs=$legacy_pairs provenance_matches=$legacy_provenance audit_rows=$audit_rows"
  if [[ "$legacy_pairs" != "272" || "$legacy_provenance" != "272" || "$audit_rows" != "0" ]]; then
    echo "Refusing to run the gated revalidation migration: the isolated project does not match the reviewed 272-row snapshot."
    exit 1
    fi
  fi
  npx supabase db push --db-url "$AUTH_TEST_SUPABASE_DB_URL" --yes
fi

postflight=$(db_query "select
  (select count(*) from public.administrative_audit_logs where action = 'device.legacy_revalidation_required'),
  (select count(*) from public.authorized_devices d join public.device_sessions ds on ds.device_id = d.id and ds.user_id = d.user_id where d.id = ds.session_id and d.status = 'pending' and ds.status = 'pending' and d.approved_at is null),
  (select count(*) from public.administrative_audit_logs where action = 'device.legacy_revalidation_required' and justification like '%prior_approved_at=%' and justification like '%original_requested_at=%'),
  (select count(*) from public.authorized_devices d join public.device_sessions ds on ds.device_id = d.id and ds.user_id = d.user_id where d.id = ds.session_id and d.status = 'approved' and ds.status = 'approved'),
  (select count(*) from supabase_migrations.schema_migrations where version in ('20261126010200', '20261126010300', '20261126034944'))")
IFS='|' read -r audit_events pending_pairs preserved_provenance approved_pairs applied_gates <<< "$postflight"
echo "Isolated SQA migration postflight: audit_events=$audit_events pending_pairs=$pending_pairs preserved_provenance=$preserved_provenance approved_pairs=$approved_pairs applied_gates=$applied_gates"
if [[ "$audit_events" != "272" || "$pending_pairs" != "272" || "$preserved_provenance" != "272" || "$approved_pairs" != "0" || "$applied_gates" != "3" ]]; then
  echo "Isolated SQA migration postconditions did not match the reviewed snapshot."
  exit 1
fi

echo "PASS: gated migrations 10200/10300 and proof-of-possession migration applied and verified only on the isolated SQA project."
