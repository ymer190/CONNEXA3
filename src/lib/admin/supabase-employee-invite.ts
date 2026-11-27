import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptProvisioningInviteLink } from "./employee-provisioning-invite-link-crypto";
import { decryptProvisioningEmail } from "./employee-provisioning-email-crypto";
import { buildFirstAccessInviteUrl } from "./employee-invite-link-core";
import type {
  EmployeeProvisioningPayload,
} from "./employee-provisioning-orchestrator-core";

function hasProvisioningMetadata(
  metadata: Record<string, unknown> | null | undefined,
  operationId: string,
): boolean {
  return metadata?.first_access_pending === true &&
    metadata?.employee_provisioning_operation_id === operationId;
}

/**
 * Creates only the Auth identity. The trusted first-access marker and operation
 * correlation are set atomically at creation time; no invite link/email is
 * generated or sent in this phase.
 */
export async function createEmployeeAuthIdentity(
  payload: EmployeeProvisioningPayload,
  operationId: string,
) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
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

    if (error) {
      const status = "status" in error && typeof error.status === "number"
        ? error.status
        : null;
      return status !== null && status < 500
        ? { kind: "not_created" as const }
        : { kind: "unknown" as const };
    }

    const user = data.user;
    if (!user?.id) return { kind: "unknown" as const };

    return {
      kind: "created" as const,
      authUserId: user.id,
      identityCreatedByOperation: hasProvisioningMetadata(
        user.app_metadata,
        operationId,
      ) && user.email_confirmed_at === null,
    };
  } catch {
    // A transport failure can happen after Auth committed the identity.
    return { kind: "unknown" as const };
  }
}

/**
 * Generates the invite only after the domain/audit transaction has committed.
 * GoTrue supports generating an invite link for an existing unconfirmed user;
 * this returns a link but does not send email.
 */
export async function generateEmployeeFirstAccessInviteLink(
  payload: EmployeeProvisioningPayload,
  operationId: string,
  authUserId: string,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.APP_URL;
  if (!supabaseUrl || !appUrl) return { kind: "failed" as const };

  try {
    const admin = createAdminClient();
    const { data: current, error: lookupError } =
      await admin.auth.admin.getUserById(authUserId);

    if (lookupError || !current.user) return { kind: "unknown" as const };
    if (
      current.user.email !== payload.email ||
      current.user.email_confirmed_at !== null ||
      !hasProvisioningMetadata(current.user.app_metadata, operationId)
    ) {
      return { kind: "failed" as const };
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: payload.email,
    });
    if (error) {
      const status = "status" in error && typeof error.status === "number"
        ? error.status
        : null;
      return status !== null && status < 500
        ? { kind: "failed" as const }
        : { kind: "unknown" as const };
    }

    if (
      data.user?.id !== authUserId ||
      !hasProvisioningMetadata(data.user.app_metadata, operationId)
    ) {
      return { kind: "unknown" as const };
    }

    const actionLink = data.properties?.action_link;
    if (typeof actionLink !== "string") return { kind: "unknown" as const };

    const adapted = buildFirstAccessInviteUrl({
      actionLink,
      supabaseUrl,
      appUrl,
    });
    return adapted.success
      ? { kind: "generated" as const, actionLink: adapted.url }
      : { kind: "failed" as const };
  } catch {
    // The invite token may have been generated even if the response was lost.
    return { kind: "unknown" as const };
  }
}

/**
 * Compensation is permitted only while the invite has not been delivered and
 * only when Auth metadata proves this identity belongs to this operation.
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

/**
 * Controlled reissue for the original administrator. It never creates another
 * Auth identity or membership and refuses identities that are already accepted.
 */
export async function reissueEmployeeFirstAccessLink(
  operationId: string,
  actorUserId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data: contextData, error: contextError } = await admin.rpc(
    "admin_get_employee_provisioning_reissue_context",
    {
      p_operation_id: operationId,
      p_actor_user_id: actorUserId,
    },
  );
  if (contextError) throw new Error("First-access link reissue is unavailable.");

  const contextRow = Array.isArray(contextData) ? contextData[0] : contextData;
  if (
    typeof contextRow !== "object" ||
    contextRow === null ||
    typeof (contextRow as { auth_user_id?: unknown }).auth_user_id !== "string" ||
    typeof (contextRow as { email_envelope?: unknown }).email_envelope !== "string"
  ) {
    return null;
  }

  const authUserId = (contextRow as { auth_user_id: string }).auth_user_id;
  const email = decryptProvisioningEmail(
    (contextRow as { email_envelope: string }).email_envelope,
  );
  const { data: current, error: lookupError } =
    await admin.auth.admin.getUserById(authUserId);
  if (lookupError || !current.user) return null;
  if (
    current.user.email !== email ||
    current.user.email_confirmed_at !== null ||
    !hasProvisioningMetadata(current.user.app_metadata, operationId)
  ) {
    return null;
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
  });
  if (error) throw new Error("Supabase Auth could not reissue the invite link.");
  if (
    data.user?.id !== authUserId ||
    !hasProvisioningMetadata(data.user.app_metadata, operationId)
  ) {
    throw new Error("Supabase Auth returned an unexpected identity.");
  }

  const actionLink = data.properties?.action_link;
  if (typeof actionLink !== "string") {
    throw new Error("Supabase Auth did not return an invite link.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const appUrl = process.env.APP_URL;
  if (!supabaseUrl || !appUrl) {
    throw new Error("First-access link configuration is unavailable.");
  }
  const adapted = buildFirstAccessInviteUrl({ actionLink, supabaseUrl, appUrl });
  if (!adapted.success) throw new Error("First-access link is invalid.");

  const { data: persisted, error: persistError } = await admin.rpc(
    "admin_replace_employee_invite_link",
    {
      p_operation_id: operationId,
      p_actor_user_id: actorUserId,
      p_invite_link_envelope: encryptProvisioningInviteLink(adapted.url),
    },
  );
  if (persistError || !(persisted === true || (Array.isArray(persisted) && persisted[0] === true))) {
    throw new Error("First-access link reissue could not be persisted.");
  }

  return adapted.url;
}
