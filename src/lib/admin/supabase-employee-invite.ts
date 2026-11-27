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
  if (!process.env.SUPABASE_SECRET_KEY) {
    return { kind: "not_created" as const };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: payload.email,
      email_confirm: false,
      app_metadata: {
        first_access_pending: true,
        employee_provisioning_operation_id: operationId,
      },
    });

    if (error) return { kind: "not_created" as const };
    if (!data.user?.id) return { kind: "unknown" as const };

    return {
      kind: "created" as const,
      authUserId: data.user.id,
      identityCreatedByOperation:
        data.user.app_metadata?.first_access_pending === true &&
        data.user.app_metadata?.employee_provisioning_operation_id === operationId,
    };
  } catch {
    // A transport exception may happen after Auth committed the identity.
    return { kind: "unknown" as const };
  }
}

/**
 * Generates an invite token without sending mail, then adapts the Supabase
 * action_link to the browser-fragment contract implemented by Issue #93.
 */
export async function generateEmployeeFirstAccessInviteLink(
  payload: EmployeeProvisioningPayload,
): Promise<{ kind: "generated"; actionLink: string } | { kind: "failed" | "unknown" }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.APP_URL;
  if (!supabaseUrl || !appUrl || !process.env.SUPABASE_SECRET_KEY) {
    return { kind: "failed" };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: payload.email,
    });

    if (error) return { kind: "failed" };

    const generatedActionLink = data.properties?.action_link;
    if (typeof generatedActionLink !== "string" || !generatedActionLink) {
      return { kind: "unknown" };
    }

    const adapted = buildFirstAccessInviteUrl({
      actionLink: generatedActionLink,
      supabaseUrl,
      appUrl,
    });

    return adapted.success
      ? { kind: "generated", actionLink: adapted.url }
      : { kind: "failed" };
  } catch {
    return { kind: "unknown" };
  }
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
