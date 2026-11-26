-- Issue #94 account lifecycle regression coverage; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('94100000-0000-4000-8000-000000000001','authenticated','authenticated','issue94-admin@example.invalid','',now(),now(),now()),
 ('94100000-0000-4000-8000-000000000002','authenticated','authenticated','issue94-member@example.invalid','',now(),now(),now());
insert into public.profiles(id,full_name) values
 ('94100000-0000-4000-8000-000000000001','Issue 94 Admin'),
 ('94100000-0000-4000-8000-000000000002','Issue 94 Member');
insert into public.organizations(id,name) values ('94100000-0000-4000-8000-000000000101','Issue 94 Organization');
insert into public.organization_members(organization_id,user_id,role,status) values
 ('94100000-0000-4000-8000-000000000101','94100000-0000-4000-8000-000000000001','admin','active'),
 ('94100000-0000-4000-8000-000000000101','94100000-0000-4000-8000-000000000002','member','active');
insert into public.platform_users(user_id,role) values ('94100000-0000-4000-8000-000000000001','platform_admin');

insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
values
 ('94100000-0000-4000-8000-000000000011','94100000-0000-4000-8000-000000000001',now(),now(),now()+interval '1 day'),
 ('94100000-0000-4000-8000-000000000012','94100000-0000-4000-8000-000000000002',now(),now(),now()+interval '1 day'),
 ('94100000-0000-4000-8000-000000000021','94100000-0000-4000-8000-000000000002',now(),now(),now()+interval '1 day'),
 ('94100000-0000-4000-8000-000000000022','94100000-0000-4000-8000-000000000002',now(),now(),now()+interval '1 day'),
 ('94100000-0000-4000-8000-000000000023','94100000-0000-4000-8000-000000000002',now(),now(),now()+interval '1 day');
insert into public.authorized_devices(id,user_id,secret_hash,label,status,approved_at)
values
 ('94100000-0000-4000-8000-000000000031','94100000-0000-4000-8000-000000000001',extensions.digest('admin-device','sha256'),'Admin device','approved',now()),
 ('94100000-0000-4000-8000-000000000032','94100000-0000-4000-8000-000000000002',extensions.digest('member-device','sha256'),'Member device','approved',now());
insert into public.device_sessions(session_id,user_id,device_id,status)
values
 ('94100000-0000-4000-8000-000000000011','94100000-0000-4000-8000-000000000001','94100000-0000-4000-8000-000000000031','approved'),
 ('94100000-0000-4000-8000-000000000012','94100000-0000-4000-8000-000000000002','94100000-0000-4000-8000-000000000032','approved'),
 ('94100000-0000-4000-8000-000000000021','94100000-0000-4000-8000-000000000002','94100000-0000-4000-8000-000000000032','approved'),
 ('94100000-0000-4000-8000-000000000022','94100000-0000-4000-8000-000000000002','94100000-0000-4000-8000-000000000032','approved');

select set_config('request.jwt.claims','{"sub":"94100000-0000-4000-8000-000000000001","session_id":"94100000-0000-4000-8000-000000000011","role":"authenticated"}',true);
select lives_ok(
 $$select public.admin_set_collaborator_account_status('94100000-0000-4000-8000-000000000002','blocked','Security review')$$,
 'authorized platform administrator blocks a collaborator'
);
select is((select status from public.collaborator_account_status where user_id='94100000-0000-4000-8000-000000000002'),'blocked','blocked status is persisted');
select is((select count(*)::integer from public.device_sessions where user_id='94100000-0000-4000-8000-000000000002' and status='revoked'),2,'all existing sessions are revoked atomically');
select is((select status from public.authorized_devices where user_id='94100000-0000-4000-8000-000000000002'),'approved','account suspension does not change device trust');
select is((select action from public.administrative_audit_logs where target_user_id='94100000-0000-4000-8000-000000000002' order by id desc limit 1),'collaborator_account.status_blocked','change is recorded in the central audit trail');

select set_config('request.jwt.claims','{"sub":"94100000-0000-4000-8000-000000000002","session_id":"94100000-0000-4000-8000-000000000012","role":"authenticated","exp":4102444800}',true);
select ok(not public.device_session_is_authorized(),'unexpired JWT no longer passes the protected-resource gate');
select throws_ok(
 $$insert into public.device_sessions(session_id,user_id,device_id,status) values ('94100000-0000-4000-8000-000000000023','94100000-0000-4000-8000-000000000002','94100000-0000-4000-8000-000000000032','approved')$$,
 '42501','Collaborator account is not active','inactive account cannot bind a new session'
);

select set_config('request.jwt.claims','{"sub":"94100000-0000-4000-8000-000000000001","session_id":"94100000-0000-4000-8000-000000000011","role":"authenticated"}',true);
select throws_ok(
 $$select public.admin_set_collaborator_account_status('94100000-0000-4000-8000-000000000002','blocked','Repeated block')$$,
 '23514','Account is already in the requested status','same-state transition is rejected'
);
select lives_ok(
 $$select public.admin_set_collaborator_account_status('94100000-0000-4000-8000-000000000002','active','Review completed')$$,
 'blocked account can be reactivated'
);
select is((select count(*)::integer from public.device_sessions where user_id='94100000-0000-4000-8000-000000000002' and status='approved'),0,'reactivation does not restore revoked sessions');
select is((select count(*)::integer from public.administrative_audit_logs where target_user_id='94100000-0000-4000-8000-000000000002'),2,'every lifecycle change is independently audited');
insert into public.device_sessions(session_id,user_id,device_id,status)
values ('94100000-0000-4000-8000-000000000023','94100000-0000-4000-8000-000000000002','94100000-0000-4000-8000-000000000032','approved');

select set_config('request.jwt.claims','{"sub":"94100000-0000-4000-8000-000000000002","session_id":"94100000-0000-4000-8000-000000000023","role":"authenticated"}',true);
select ok(public.device_session_is_authorized(),'reactivated account can use a newly authorized session on an already approved device');
select throws_ok(
 $$select public.admin_set_collaborator_account_status('94100000-0000-4000-8000-000000000001','blocked','Unauthorized attempt')$$,
 '42501','Authorized device required','ordinary collaborator cannot change account status'
);

select set_config('request.jwt.claims','{"sub":"94100000-0000-4000-8000-000000000001","session_id":"94100000-0000-4000-8000-000000000011","role":"authenticated"}',true);
select lives_ok(
 $$select public.admin_set_collaborator_account_status('94100000-0000-4000-8000-000000000002','deactivated','Employment ended')$$,
 'active account can be deactivated'
);
select throws_ok(
 $$select public.admin_set_collaborator_account_status('94100000-0000-4000-8000-000000000002','blocked','Block deactivated account')$$,
 '23514','Deactivated account must be reactivated before another transition','deactivated account cannot transition directly to blocked'
);
select lives_ok(
 $$select public.admin_set_collaborator_account_status('94100000-0000-4000-8000-000000000002','active','Rehire approved')$$,
 'deactivated account can be explicitly reactivated'
);

select * from finish();
rollback;

