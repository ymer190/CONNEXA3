import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildFirstAccessInviteUrl } from "./employee-invite-link-core";
import type {
  EmployeeProvisioningPayload,
} from "./employee-provisioning-orchestrator-core";
import { sendEmployeeInviteWithResend } from "@/lib/email/resend-employee-invite";

export async function createEmployeeAuthIdentity(
  payload: EmployeeProvisioningPayload,
  operationId: string,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.APP_URL;
  if (!supabaseUrl || !appUrl || !process.env.SUPABASE_SECRET_KEY) {
    return { kind: "not_created" as const };
  }

  let admin;
  let generated;
  try {
    admin = createAdminClient();
    // generateLink(invite) creates the Auth identity and returns the action link,
    // but does not send an email. Do not call createUser before this operation:
    // Supabase generateLink handles user creation for the invite type.
    generated = await admin.auth.admin.generateLink({
      type: "invite",
      email: payload.email,
    });
  } catch {
    // The Auth endpoint may have created the identity before a transport failure.
    return { kind: "unknown" as const };
  }

  if (generated.error || !generated.data.user?.id) {
    return { kind: "not_created" as const };
  }

  const authUserId = generated.data.user.id;
  const generatedActionLink = generated.data.properties?.action_link;
  const adapted = typeof generatedActionLink === "string"
    ? buildFirstAccessInviteUrl({ actionLink: generatedActionLink, supabaseUrl, appUrl })
    : { success: false as const, code: "INVALID_AUTH_ACTION_LINK" as const };

  let identityCreatedByOperation = false;
  try {
    const { data, error } = await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: {
        ...generated.data.user.app_metadata,
        first_access_pending: true,
        employee_provisioning_operation_id: operationId,
      },
    });

    identityCreatedByOperation = !error &&
      data.user?.app_metadata?.first_access_pending === true &&
      data.user?.app_metadata?.employee_provisioning_operation_id === operationId;
  } catch {
    identityCreatedByOperation = false;
  }

  return {
    kind: "created" as const,
    authUserId,
    actionLink: adapted.success ? adapted.url : "",
    identityCreatedByOperation,
  };
}

export async function sendEmployeeFirstAccessInvite(
  payload: EmployeeProvisioningPayload,
  actionLink: string,
  idempotencyKey: string,
) {
  return sendEmployeeInviteWithResend({
    to: payload.email,
    fullName: payload.fullName,
    actionLink,
    idempotencyKey,
  });
}

/**
 * Compensation is permitted only before an invite link has been generated and
 * only when the Auth metadata proves this identity belongs to this operation.
 */
export async function deleteEmployeeAuthIdentityIfUnaccepted(
  authUserId: string,
  operationId: string,
): Promise<{ kind: "deleted" | "not_safe" | "unknown" }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(authUserId);
    if (error || !data.user) return { kind: "unknown" };

    const user = data.user;
    if (
      user.app_metadata?.first_access_pending !== true ||
      user.app_metadata?.employee_provisioning_operation_id !== operationId ||
      user.email_confirmed_at !== null
    ) {
      return { kind: "not_safe" };
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
    return deleteError ? { kind: "unknown" } : { kind: "deleted" };
  } catch {
    return { kind: "unknown" };
  }
}
