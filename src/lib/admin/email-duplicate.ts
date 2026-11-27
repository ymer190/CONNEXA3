import "server-only";

import { createAdminClient } from "../supabase/admin";
import { requirePlatformAdmin } from "./require-platform-admin";
import { findAuthUserByEmail } from "./email-duplicate-core";

export type AdminEmailDuplicateCheck =
  | { success: true; exists: boolean }
  | {
      success: false;
      code:
        | "UNAUTHENTICATED"
        | "FORBIDDEN"
        | "AUTHORIZATION_CHECK_FAILED"
        | "USER_LOOKUP_FAILED";
    };

/** Revalidates platform-admin authorization before using the privileged Auth API. */
export async function checkEmployeeEmailDuplicate(
  email: string,
): Promise<AdminEmailDuplicateCheck> {
  let authorization;

  try {
    authorization = await requirePlatformAdmin();
  } catch {
    return { success: false, code: "AUTHORIZATION_CHECK_FAILED" };
  }

  if (!authorization.authorized) {
    return { success: false, code: authorization.reason };
  }

  try {
    const adminClient = createAdminClient();
    return await findAuthUserByEmail(email, {
      listUsers: async (page, perPage) => {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) return { success: false };
        return { success: true, users: data.users };
      },
    });
  } catch {
    return { success: false, code: "USER_LOOKUP_FAILED" };
  }
}
