import "server-only";

import { createAdminClient } from "../supabase/admin";
import { requirePlatformAdmin } from "./require-platform-admin";
import { listOrganizationsWithDependencies } from "./list-organizations-core";

/**
 * Lists organizations for the administrative employee-provisioning workflow.
 * The privileged client is instantiated only inside the post-authorization
 * query callback. The selector is intentionally capped at 100 options.
 */
export function listOrganizationsForAdmin() {
  return listOrganizationsWithDependencies({
    authorize: requirePlatformAdmin,
    queryOrganizations: async () => {
      const adminClient = createAdminClient();
      const { data, error } = await adminClient
        .from("organizations")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(100);

      return { data, error };
    },
  });
}
