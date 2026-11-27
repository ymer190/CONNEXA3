export type FirstAccessInviteLinkInput = {
  actionLink: string;
  supabaseUrl: string;
  appUrl: string;
};

export type FirstAccessInviteLinkResult =
  | { success: true; url: string }
  | { success: false; code: "INVALID_AUTH_ACTION_LINK" | "INVALID_APP_URL" };

/**
 * Adapts the Supabase-generated invite verification URL to the #93 contract.
 * The one-time token is moved into the browser fragment, never a query string,
 * so it is not sent in the initial HTTP request or ordinary server access logs.
 */
export function buildFirstAccessInviteUrl(
  input: FirstAccessInviteLinkInput,
): FirstAccessInviteLinkResult {
  let action: URL;
  let supabase: URL;
  try {
    action = new URL(input.actionLink);
    supabase = new URL(input.supabaseUrl);
  } catch {
    return { success: false, code: "INVALID_AUTH_ACTION_LINK" };
  }

  const tokenHash = action.searchParams.get("token");
  if (
    action.protocol !== "https:" ||
    supabase.protocol !== "https:" ||
    action.origin !== supabase.origin ||
    !action.pathname.endsWith("/auth/v1/verify") ||
    action.searchParams.get("type") !== "invite" ||
    !tokenHash ||
    tokenHash.length > 512
  ) {
    return { success: false, code: "INVALID_AUTH_ACTION_LINK" };
  }

  let app: URL;
  try {
    app = new URL(input.appUrl);
  } catch {
    return { success: false, code: "INVALID_APP_URL" };
  }

  if (
    app.protocol !== "https:" ||
    app.username ||
    app.password ||
    app.search ||
    app.hash
  ) {
    return { success: false, code: "INVALID_APP_URL" };
  }

  const inviteUrl = new URL("/confirmar-convite", app.origin);
  const fragment = new URLSearchParams({
    token_hash: tokenHash,
    type: "invite",
  });
  inviteUrl.hash = fragment.toString();

  return { success: true, url: inviteUrl.toString() };
}
