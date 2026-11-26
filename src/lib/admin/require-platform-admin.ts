import "server-only";

import { createClient } from "../supabase/server";

export type PlatformAdminAuthorization =
  | { authorized: true; userId: string }
  | {
      authorized: false;
      reason: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTHORIZATION_CHECK_FAILED";
    };

/**
 * Re-checks platform administrator authorization inside the server operation.
 *
 * Middleware is only a navigation guard. Sensitive API routes and server
 * actions must call this helper before using the privileged Supabase client.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminAuthorization> {
  let supabase;

  try {
    supabase = await createClient();
  } catch {
    return { authorized: false, reason: "AUTHORIZATION_CHECK_FAILED" };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return { authorized: false, reason: "AUTHORIZATION_CHECK_FAILED" };
  }

  if (!user) {
    return { authorized: false, reason: "UNAUTHENTICATED" };
  }

  const { data: platformUser, error: platformUserError } = await supabase
    .from("platform_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (platformUserError) {
    return { authorized: false, reason: "AUTHORIZATION_CHECK_FAILED" };
  }

  if (platformUser?.role !== "platform_admin") {
    return { authorized: false, reason: "FORBIDDEN" };
  }

  return { authorized: true, userId: user.id };
}
