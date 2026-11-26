-- Issue #95 Stage 2 regression tests.
-- Run after migrations; all fixtures and mutations are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
 ('95100000-0000-4000-8000-000000000001','authenticated','authenticated','issue95-stage2-admin@example.invalid','',now(),now(),now()),
 ('95100000-0000-4000-8000-000000000002','authenticated','authenticated','issue95-stage2-member@example.invalid','',now(),now(),now());
insert into public.profiles (id, full_name) values
 ('95100000-0000-4000-8000-000000000001','Issue 95 Stage 2 Admin'),
 ('95100000-0000-4000-8000-000000000002','Issue 95 Stage 2 Member');
insert into public.organizations (id,name)
values ('95100000-0000-4000-8000-000000000101','Issue 95 Stage 2 Org');
insert into public.organization_members (organization_id,user_id,role,status)
values ('95100000-0000-4000-8000-000000000101','95100000-0000-4000-8000-000000000002','member','active');
insert into public.platform_users (user_id,role)
values ('95100000-0000-4000-8000-000000000001','platform_admin');
insert into public.departments (id,organization_id,name)
values
 ('95100000-0000-4000-8000-000000000201','95100000-0000-4000-8000-000000000101','Engineering'),
 ('95100000-0000-4000-8000-000000000202','95100000-0000-4000-8000-000000000101','Operations');

select set_config('request.jwt.claim.sub','95100000-0000-4000-8000-000000000001',true);

insert into public.department_members (organization_id,department_id,user_id,created_by)
values ('95100000-0000-4000-8000-000000000101','95100000-0000-4000-8000-000000000201','95100000-0000-4000-8000-000000000002','95100000-0000-4000-8000-000000000001');

select lives_ok(
 $$select * from public.admin_update_department(
   '95100000-0000-4000-8000-000000000201',
   '95100000-0000-4000-8000-000000000101','Engineering & Product')$$,
 'platform admin can rename an active department'
);

select is(
 (select name from public.departments where id='95100000-0000-4000-8000-000000000201'),
 'Engineering & Product',
 'department rename is persisted'
);

select is(
 (select count(*)::integer from public.admin_list_department_members(
   '95100000-0000-4000-8000-000000000201',
   '95100000-0000-4000-8000-000000000101')),
 1,
 'platform admin can list department membership'
);

select lives_ok(
 $$select * from public.admin_transfer_department_member(
   '95100000-0000-4000-8000-000000000101',
   '95100000-0000-4000-8000-000000000002',
   '95100000-0000-4000-8000-000000000202')$$,
 'platform admin can transfer employee atomically'
);

select is(
 (select count(*)::integer from public.department_members
  where user_id='95100000-0000-4000-8000-000000000002'),
 2,
 'transfer retains old membership history'
);

select is(
 (select count(*)::integer from public.department_members
  where user_id='95100000-0000-4000-8000-000000000002' and ended_at is null
    and department_id='95100000-0000-4000-8000-000000000202'),
 1,
 'transfer leaves exactly one active membership in destination department'
);

select lives_ok(
 $$select * from public.admin_deactivate_department(
   '95100000-0000-4000-8000-000000000202',
   '95100000-0000-4000-8000-000000000101')$$,
 'platform admin can deactivate a department'
);

select is(
 (select count(*)::integer from public.department_members
  where user_id='95100000-0000-4000-8000-000000000002'
    and ended_at is not null),
 2,
 'deactivation closes current membership without deleting history'
);

select set_config('request.jwt.claim.sub','95100000-0000-4000-8000-000000000002',true);
select throws_ok(
 $$select * from public.admin_update_department(
   '95100000-0000-4000-8000-000000000201',
   '95100000-0000-4000-8000-000000000101','Unauthorized')$$,
 '42501',
 'Platform administrator role required',
 'ordinary collaborator cannot edit department'
);

select * from finish();
rollback;
