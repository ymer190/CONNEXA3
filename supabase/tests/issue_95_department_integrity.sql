-- Issue #95: department integrity regression tests.
-- Intended for the Supabase database test runner after migrations are applied.
-- All fixtures are wrapped in a transaction and rolled back.
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);
create temporary table issue95_test_output (result text);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('95000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'issue95-user1@example.invalid', '', now(), now(), now()),
  ('95000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'issue95-user2@example.invalid', '', now(), now(), now());

insert into public.profiles (id, full_name)
values
  ('95000000-0000-4000-8000-000000000001', 'Issue 95 Test User 1'),
  ('95000000-0000-4000-8000-000000000002', 'Issue 95 Test User 2');

insert into public.organizations (id, name)
values
  ('95000000-0000-4000-8000-000000000101', 'Issue 95 Test Org A'),
  ('95000000-0000-4000-8000-000000000102', 'Issue 95 Test Org B');

insert into public.organization_members (organization_id, user_id, role, status)
values
  ('95000000-0000-4000-8000-000000000101', '95000000-0000-4000-8000-000000000001', 'member', 'active'),
  ('95000000-0000-4000-8000-000000000101', '95000000-0000-4000-8000-000000000002', 'member', 'suspended');

insert into public.departments (id, organization_id, name, status)
values
  ('95000000-0000-4000-8000-000000000201', '95000000-0000-4000-8000-000000000101', 'Engineering', 'active'),
  ('95000000-0000-4000-8000-000000000202', '95000000-0000-4000-8000-000000000101', 'Operations', 'active'),
  ('95000000-0000-4000-8000-000000000203', '95000000-0000-4000-8000-000000000101', 'Archived', 'inactive'),
  ('95000000-0000-4000-8000-000000000204', '95000000-0000-4000-8000-000000000102', 'Other Org', 'active');

insert into issue95_test_output select lives_ok(
  $$insert into public.department_members (organization_id, department_id, user_id)
    values ('95000000-0000-4000-8000-000000000101',
            '95000000-0000-4000-8000-000000000201',
            '95000000-0000-4000-8000-000000000001')$$,
  'active employee can be assigned to an active department'
);

insert into issue95_test_output select throws_ok(
  $$insert into public.departments (organization_id, name)
    values ('95000000-0000-4000-8000-000000000101', ' engineering ')$$,
  '23505',
  'duplicate key value violates unique constraint "departments_active_name_per_organization_uidx"',
  'active department names are unique after trimming and case folding'
);

insert into issue95_test_output select throws_ok(
  $$insert into public.department_members (organization_id, department_id, user_id)
    values ('95000000-0000-4000-8000-000000000102',
            '95000000-0000-4000-8000-000000000201',
            '95000000-0000-4000-8000-000000000001')$$,
  '23503',
  'Department does not belong to the organization',
  'cross-organization department assignment is rejected'
);

insert into issue95_test_output select throws_ok(
  $$insert into public.department_members (organization_id, department_id, user_id)
    values ('95000000-0000-4000-8000-000000000101',
            '95000000-0000-4000-8000-000000000201',
            '95000000-0000-4000-8000-000000000002')$$,
  '23514',
  'Employee must be an active organization member',
  'suspended employee cannot receive an active department assignment'
);

insert into issue95_test_output select throws_ok(
  $$insert into public.department_members (organization_id, department_id, user_id)
    values ('95000000-0000-4000-8000-000000000101',
            '95000000-0000-4000-8000-000000000203',
            '95000000-0000-4000-8000-000000000001')$$,
  '23514',
  'Department must be active to create an active association',
  'inactive department cannot receive an active assignment'
);

insert into issue95_test_output select throws_ok(
  $$insert into public.department_members (organization_id, department_id, user_id)
    values ('95000000-0000-4000-8000-000000000101',
            '95000000-0000-4000-8000-000000000202',
            '95000000-0000-4000-8000-000000000001')$$,
  '23505',
  'duplicate key value violates unique constraint "department_members_one_active_department_per_user_uidx"',
  'employee cannot have two active department assignments'
);

insert into issue95_test_output select lives_ok(
  $$update public.department_members
       set ended_at = now(), ended_by = '95000000-0000-4000-8000-000000000001'
     where user_id = '95000000-0000-4000-8000-000000000001'
       and ended_at is null$$,
  'department transfer can end the previous association'
);

insert into issue95_test_output select lives_ok(
  $$insert into public.department_members (organization_id, department_id, user_id)
    values ('95000000-0000-4000-8000-000000000101',
            '95000000-0000-4000-8000-000000000202',
            '95000000-0000-4000-8000-000000000001')$$,
  'department transfer can create the new active association'
);

insert into issue95_test_output select is(
  (select count(*)::integer from public.department_members
    where user_id = '95000000-0000-4000-8000-000000000001'),
  2,
  'department transfer preserves the previous association as history'
);

insert into issue95_test_output select ok(
  not has_table_privilege('authenticated', 'public.departments', 'select')
  and not has_table_privilege('authenticated', 'public.department_members', 'select')
  and has_table_privilege('service_role', 'public.departments', 'select')
  and has_table_privilege('service_role', 'public.department_members', 'select'),
  'direct client reads are denied and trusted server role retains table access'
);

insert into issue95_test_output select * from finish();
select result from issue95_test_output;
rollback;
