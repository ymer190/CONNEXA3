import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptProvisioningInviteLink } from "./employee-provisioning-invite-link-crypto";
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
 * Recover a previously generated first-access link after a lost HTTP response.
 * The database RPC permits only the service role and the original initiating
 * administrator; the encrypted envelope is decrypted only in this server module.
 */
export async function recoverEmployeeFirstAccessLink(
  operationId: string,
  actorUserId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "admin_get_employee_provisioning_invite_link",
    {
      p_operation_id: operationId,
      p_actor_user_id: actorUserId,
    },
  );
  if (error) throw new Error("First-access link recovery is unavailable.");

  const row = Array.isArray(data) ? data[0] : data;
  if (
    typeof row !== "object" ||
    row === null ||
    typeof (row as { invite_link_envelope?: unknown }).invite_link_envelope !== "string"
  ) {
    return null;
  }

  return decryptProvisioningInviteLink(
    (row as { invite_link_envelope: string }).invite_link_envelope,
  );
}
