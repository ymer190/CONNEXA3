-- Issue #95: cover all foreign-key columns with supporting indexes.
-- Existing organization-first indexes serve department-scoped reads; these
-- indexes serve FK checks and deletes/updates on referenced auth/department rows.
create index if not exists department_members_department_org_fk_idx
  on public.department_members (department_id, organization_id);

create index if not exists department_members_user_org_fk_idx
  on public.department_members (user_id, organization_id);

create index if not exists department_members_created_by_fk_idx
  on public.department_members (created_by)
  where created_by is not null;

create index if not exists department_members_ended_by_fk_idx
  on public.department_members (ended_by)
  where ended_by is not null;
