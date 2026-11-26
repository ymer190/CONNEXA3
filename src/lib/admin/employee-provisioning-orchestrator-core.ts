import type { ProvisioningStatus } from "./employee-provisioning-core";

export type EmployeeProvisioningPayload = {
  fullName: string;
  email: string;
  organizationId: string;
  payloadHash: string;
  idempotencyKey: string;
  actorUserId: string;
};

export type ProvisioningClaim = {
  operationId: string;
  claimId: string;
};

export type ProvisioningClaimResult =
  | { kind: "claimed"; claim: ProvisioningClaim }
  | { kind: "replay"; status: ProvisioningStatus; authUserId: string | null }
  | { kind: "conflict" }
  | { kind: "in_progress" }
  | { kind: "manual_reconciliation_required" };

export type DomainTransactionResult =
  | { kind: "committed" }
  | { kind: "rolled_back" }
  | { kind: "unknown" };

export type AuthCompensationResult =
  | { kind: "deleted" }
  | { kind: "not_safe" }
  | { kind: "unknown" };

export type InviteCreationResult =
  | {
      kind: "created";
      authUserId: string;
      identityCreatedByOperation: boolean;
    }
  | { kind: "not_created" }
  | { kind: "unknown" };

export type EmployeeProvisioningResult =
  | { kind: "created"; authUserId: string }
  | { kind: "replayed"; status: ProvisioningStatus; authUserId: string | null }
  | { kind: "conflict" | "in_progress" | "manual_reconciliation_required" }
  | {
      kind: "failed";
      code:
        | "CLAIM_FAILED"
        | "INVITE_NOT_CREATED"
        | "AUTH_ID_PERSISTENCE_FAILED"
        | "DOMAIN_TRANSACTION_FAILED"
        | "COMPLETION_FAILED"
        | "RECONCILIATION_MARKER_FAILED";
    };

export type EmployeeProvisioningDependencies = {
  claimOperation: (
    payload: EmployeeProvisioningPayload,
  ) => Promise<ProvisioningClaimResult>;
  /**
   * Must establish app_metadata.first_access_pending through Auth Admin
   * before any invite email can be delivered. Do not implement this adapter
   * with inviteUserByEmail followed by updateUserById: that creates a race.
   */
  createInviteWithFirstAccessPending: (
    payload: EmployeeProvisioningPayload,
  ) => Promise<InviteCreationResult>;
  persistAuthUserId: (
    claim: ProvisioningClaim,
    authUserId: string,
  ) => Promise<boolean>;
  /** One PostgreSQL transaction: profiles + organization_members + central audit. */
  persistProfileMembershipAndAuditAtomically: (
    claim: ProvisioningClaim,
    payload: EmployeeProvisioningPayload,
  ) => Promise<DomainTransactionResult>;
  completeOperation: (claim: ProvisioningClaim) => Promise<boolean>;
  markCompensationPending: (claim: ProvisioningClaim) => Promise<boolean>;
  /** Must verify the identity is still unaccepted and belongs to this operation before deletion. */
  deleteUnacceptedAuthIdentityCreatedByOperation: (
    authUserId: string,
  ) => Promise<AuthCompensationResult>;
  markCompensated: (claim: ProvisioningClaim) => Promise<boolean>;
  markManualReconciliationRequired: (
    claim: ProvisioningClaim,
    reason: string,
  ) => Promise<void>;
};

async function requireManualReconciliation(
  dependencies: EmployeeProvisioningDependencies,
  claim: ProvisioningClaim,
  reason: string,
): Promise<boolean> {
  try {
    await dependencies.markManualReconciliationRequired(claim, reason);
    return true;
  } catch {
    // Do not claim that reconciliation was recorded when persistence failed.
    return false;
  }
}

/**
 * Coordinates the non-transactional Auth side effect with the PostgreSQL
 * domain transaction. All persistence and Auth operations are injected so
 * this core can be tested without touching Supabase or sending real invites.
 */
export async function runEmployeeProvisioning(
  payload: EmployeeProvisioningPayload,
  dependencies: EmployeeProvisioningDependencies,
): Promise<EmployeeProvisioningResult> {
  let claimResult: ProvisioningClaimResult;
  try {
    claimResult = await dependencies.claimOperation(payload);
  } catch {
    return { kind: "failed", code: "CLAIM_FAILED" };
  }

  if (claimResult.kind === "conflict") return { kind: "conflict" };
  if (claimResult.kind === "in_progress") return { kind: "in_progress" };
  if (claimResult.kind === "manual_reconciliation_required") {
    return { kind: "manual_reconciliation_required" };
  }
  if (claimResult.kind === "replay") {
    return {
      kind: "replayed",
      status: claimResult.status,
      authUserId: claimResult.authUserId,
    };
  }

  const { claim } = claimResult;
  let invite: InviteCreationResult;
  try {
    invite = await dependencies.createInviteWithFirstAccessPending(payload);
  } catch {
    if (!(await requireManualReconciliation(dependencies, claim, "invite_outcome_unknown"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
    }
    return { kind: "manual_reconciliation_required" };
  }

  if (invite.kind === "unknown") {
    await requireManualReconciliation(dependencies, claim, "invite_outcome_unknown");
    return { kind: "manual_reconciliation_required" };
  }

  if (invite.kind === "not_created") {
    if (!(await requireManualReconciliation(dependencies, claim, "invite_not_created"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
    }
    return { kind: "failed", code: "INVITE_NOT_CREATED" };
  }

  if (!invite.authUserId || !invite.identityCreatedByOperation) {
    if (!(await requireManualReconciliation(dependencies, claim, "auth_identity_ownership_unproven"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
    }
    return { kind: "manual_reconciliation_required" };
  }

  let authIdPersisted = false;
  try {
    authIdPersisted = await dependencies.persistAuthUserId(claim, invite.authUserId);
  } catch {
    authIdPersisted = false;
  }

  if (!authIdPersisted) {
    if (!(await requireManualReconciliation(dependencies, claim, "auth_user_id_persistence_failed"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
    }
    return { kind: "failed", code: "AUTH_ID_PERSISTENCE_FAILED" };
  }

  let domainResult: DomainTransactionResult;
  try {
    domainResult = await dependencies.persistProfileMembershipAndAuditAtomically(
      claim,
      payload,
    );
  } catch {
    domainResult = { kind: "unknown" };
  }

  if (domainResult.kind === "unknown") {
    if (!(await requireManualReconciliation(dependencies, claim, "domain_transaction_outcome_unknown"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
    }
    return { kind: "manual_reconciliation_required" };
  }

  if (domainResult.kind === "rolled_back") {
    let compensationClaimed = false;
    try {
      compensationClaimed = await dependencies.markCompensationPending(claim);
    } catch {
      compensationClaimed = false;
    }

    if (!compensationClaimed) {
      if (!(await requireManualReconciliation(dependencies, claim, "compensation_claim_failed"))) {
        return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
      }
      return { kind: "manual_reconciliation_required" };
    }

    let compensationResult: AuthCompensationResult;
    try {
      compensationResult =
        await dependencies.deleteUnacceptedAuthIdentityCreatedByOperation(
          invite.authUserId,
        );
    } catch {
      compensationResult = { kind: "unknown" };
    }

    if (compensationResult.kind !== "deleted") {
      if (!(await requireManualReconciliation(
        dependencies,
        claim,
        compensationResult.kind === "not_safe"
          ? "auth_identity_no_longer_safe_to_delete"
          : "auth_compensation_outcome_unknown",
      ))) return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
      return { kind: "manual_reconciliation_required" };
    }

    let compensated = false;
    try {
      compensated = await dependencies.markCompensated(claim);
    } catch {
      compensated = false;
    }

    if (!compensated) {
      if (!(await requireManualReconciliation(dependencies, claim, "compensation_state_persistence_failed"))) {
        return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
      }
      return { kind: "manual_reconciliation_required" };
    }

    return { kind: "failed", code: "DOMAIN_TRANSACTION_FAILED" };
  }

  let completed = false;
  try {
    completed = await dependencies.completeOperation(claim);
  } catch {
    completed = false;
  }

  if (!completed) {
    if (!(await requireManualReconciliation(dependencies, claim, "completion_state_persistence_failed"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED" };
    }
    return { kind: "failed", code: "COMPLETION_FAILED" };
  }

  return { kind: "created", authUserId: invite.authUserId };
}
