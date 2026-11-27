import "server-only";

import { decryptProvisioningEmail, encryptProvisioningEmail } from "./employee-provisioning-email-crypto";
import { decryptProvisioningInviteLink, encryptProvisioningInviteLink } from "./employee-provisioning-invite-link-crypto";
import { encryptProvisioningInviteLink } from "./employee-provisioning-invite-link-crypto";
import type {
  DomainTransactionResult,
  EmployeeProvisioningPayload,
  ProvisioningClaim,
  ProvisioningClaimResult,
} from "./employee-provisioning-orchestrator-core";
import type { ProvisioningStatus } from "./employee-provisioning-core";

export type EmployeeProvisioningRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

type ClaimRow = {
  result?: unknown;
  operation_id?: unknown;
  claim_id?: unknown;
  status?: unknown;
  auth_user_id?: unknown;
};

const VALID_STATUSES = new Set<ProvisioningStatus>([
  "pending",
  "completed",
  "compensation_pending",
  "compensated",
  "manual_reconciliation_required",
]);

function firstRow(value: unknown): ClaimRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  return typeof row === "object" && row !== null ? row as ClaimRow : null;
}

function claimFromRow(row: ClaimRow): ProvisioningClaim {
  if (
    typeof row.operation_id !== "string" ||
    typeof row.claim_id !== "string"
  ) {
    throw new Error("Provisioning claim response is invalid.");
  }
  return { operationId: row.operation_id, claimId: row.claim_id };
}

function isBooleanSuccess(value: unknown): boolean {
  return value === true || (Array.isArray(value) && value[0] === true);
}

async function callBooleanRpc(
  client: EmployeeProvisioningRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await client.rpc(name, args);
  return !error && isBooleanSuccess(data);
}

export function createEmployeeProvisioningDatabase(client: EmployeeProvisioningRpcClient) {
  return {
    async claimOperation(
      payload: EmployeeProvisioningPayload,
    ): Promise<ProvisioningClaimResult> {
      const emailEnvelope = encryptProvisioningEmail(payload.email);
      const { data, error } = await client.rpc(
        "admin_claim_employee_provisioning",
        {
          p_idempotency_key: payload.idempotencyKey,
          p_payload_hash: payload.payloadHash,
          p_email_envelope: emailEnvelope,
        },
      );

      if (error) throw new Error("Provisioning claim is unavailable.");

      const row = firstRow(data);
      if (!row || typeof row.result !== "string") {
        throw new Error("Provisioning claim response is invalid.");
      }

      if (row.result === "conflict") return { kind: "conflict" };
      if (row.result === "in_progress") return { kind: "in_progress" };
      if (row.result === "manual_reconciliation_required") {
        return { kind: "manual_reconciliation_required" };
      }

      if (row.result === "replay") {
        if (
          typeof row.status !== "string" ||
          !VALID_STATUSES.has(row.status as ProvisioningStatus)
        ) {
          throw new Error("Provisioning replay status is invalid.");
        }
        return {
          kind: "replay",
          status: row.status as ProvisioningStatus,
          authUserId: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
        };
      }

      if (row.result === "claimed") {
        return { kind: "claimed", claim: claimFromRow(row) };
      }

      throw new Error("Provisioning claim result is unsupported.");
    },

    markAuthCreationStarted(claim: ProvisioningClaim): Promise<boolean> {
      return callBooleanRpc(client, "admin_mark_employee_auth_creation_started", {
        p_operation_id: claim.operationId,
        p_claim_id: claim.claimId,
      });
    },

    persistAuthUserId(
      claim: ProvisioningClaim,
      authUserId: string,
      actionLink: string,
    ): Promise<boolean> {
      return callBooleanRpc(client, "admin_persist_employee_auth_user_id", {
        p_operation_id: claim.operationId,
        p_claim_id: claim.claimId,
        p_auth_user_id: authUserId,
        p_invite_link_envelope: encryptProvisioningInviteLink(actionLink),
      });
    },

    async persistProfileMembershipAndAuditAtomically(
      claim: ProvisioningClaim,
      payload: EmployeeProvisioningPayload,
      authUserId: string,
    ): Promise<DomainTransactionResult> {
      const { data, error } = await client.rpc(
        "admin_commit_employee_provisioning",
        {
          p_operation_id: claim.operationId,
          p_claim_id: claim.claimId,
          p_auth_user_id: authUserId,
          p_full_name: payload.fullName,
          p_organization_id: payload.organizationId,
        },
      );

      if (!error && isBooleanSuccess(data)) return { kind: "committed" };

      // A Postgres SQLSTATE is a definitive transaction rejection/rollback.
      // Transport or gateway failures without SQLSTATE remain ambiguous.
      if (error?.code && /^[0-9A-Z]{5}$/.test(error.code)) {
        return { kind: "rolled_back" };
      }
      return { kind: "unknown" };
    },

    markCompensationPending(claim: ProvisioningClaim): Promise<boolean> {
      return callBooleanRpc(client, "admin_mark_employee_compensation_pending", {
        p_operation_id: claim.operationId,
        p_claim_id: claim.claimId,
      });
    },

    markCompensated(claim: ProvisioningClaim): Promise<boolean> {
      return callBooleanRpc(client, "admin_mark_employee_compensated", {
        p_operation_id: claim.operationId,
        p_claim_id: claim.claimId,
      });
    },

    markInviteEmailSent(
      claim: ProvisioningClaim,
      providerMessageId: string,
    ): Promise<boolean> {
      return callBooleanRpc(client, "admin_mark_employee_invite_email_sent", {
        p_operation_id: claim.operationId,
        p_claim_id: claim.claimId,
        p_provider_message_id: providerMessageId,
      });
    },

    completeOperation(claim: ProvisioningClaim): Promise<boolean> {
      return callBooleanRpc(client, "admin_complete_employee_provisioning", {
        p_operation_id: claim.operationId,
        p_claim_id: claim.claimId,
      });
    },

    async getOperationForReconciliation(operationId: string) {
      const { data, error } = await client.rpc(
        "admin_get_employee_provisioning_operation",
        { p_operation_id: operationId },
      );
      if (error) throw new Error("Provisioning reconciliation lookup is unavailable.");

      const row = firstRow(data);
      if (
        !row ||
        typeof row.status !== "string" ||
        typeof row.phase !== "string" ||
        typeof row.email_envelope !== "string" ||
        typeof row.invite_link_envelope !== "string"
      ) {
        throw new Error("Provisioning reconciliation record is incomplete.");
      }

      return {
        operationId,
        status: row.status,
        phase: row.phase,
        authUserId: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
        email: decryptProvisioningEmail(row.email_envelope),
        actionLink: decryptProvisioningInviteLink(row.invite_link_envelope),
        providerMessageId:
          typeof row.email_provider_message_id === "string"
            ? row.email_provider_message_id
            : null,
        failureCode: typeof row.failure_code === "string" ? row.failure_code : null,
      };
    },

    async markManualReconciliationRequired(
      claim: ProvisioningClaim,
      reason: string,
    ): Promise<void> {
      const safeReason = reason.replace(/[^a-z0-9_]/g, "_").slice(0, 80);
      const ok = await callBooleanRpc(
        client,
        "admin_mark_employee_provisioning_manual_reconciliation",
        {
          p_operation_id: claim.operationId,
          p_claim_id: claim.claimId,
          p_failure_code: safeReason || "unspecified",
        },
      );
      if (!ok) throw new Error("Manual reconciliation state was not persisted.");
    },
  };
}
