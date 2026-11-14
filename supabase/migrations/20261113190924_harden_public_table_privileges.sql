-- Issue #123: enforce least-privilege grants for organization tables.
-- Keep RLS policies unchanged; these grants control table-level capabilities.

REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.organizations,
  public.organization_members
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.profiles
TO authenticated;

GRANT SELECT
ON TABLE public.organizations, public.organization_members
TO authenticated;

-- Restrict default privileges for objects created by postgres in public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
