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
        | "COMPLETION_FAILED";
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
  ) => Promise<boolean>;
  completeOperation: (claim: ProvisioningClaim) => Promise<boolean>;
  markCompensationPending: (claim: ProvisioningClaim) => Promise<boolean>;
  deleteAuthIdentity: (authUserId: string) => Promise<boolean>;
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
): Promise<void> {
  try {
    await dependencies.markManualReconciliationRequired(claim, reason);
  } catch {
    // The caller still receives a fail-closed result. Operational monitoring
    // must alert if even the reconciliation marker cannot be persisted.
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
    await requireManualReconciliation(dependencies, claim, "invite_outcome_unknown");
    return { kind: "manual_reconciliation_required" };
  }

  if (invite.kind === "unknown") {
    await requireManualReconciliation(dependencies, claim, "invite_outcome_unknown");
    return { kind: "manual_reconciliation_required" };
  }

  if (invite.kind === "not_created") {
    await requireManualReconciliation(dependencies, claim, "invite_not_created");
    return { kind: "failed", code: "INVITE_NOT_CREATED" };
  }

  if (!invite.authUserId || !invite.identityCreatedByOperation) {
    await requireManualReconciliation(dependencies, claim, "auth_identity_ownership_unproven");
    return { kind: "manual_reconciliation_required" };
  }

  let authIdPersisted = false;
  try {
    authIdPersisted = await dependencies.persistAuthUserId(claim, invite.authUserId);
  } catch {
    authIdPersisted = false;
  }

  if (!authIdPersisted) {
    await requireManualReconciliation(dependencies, claim, "auth_user_id_persistence_failed");
    return { kind: "failed", code: "AUTH_ID_PERSISTENCE_FAILED" };
  }

  let domainPersisted = false;
  try {
    domainPersisted = await dependencies.persistProfileMembershipAndAuditAtomically(
      claim,
      payload,
    );
  } catch {
    domainPersisted = false;
  }

  if (!domainPersisted) {
    let compensationClaimed = false;
    try {
      compensationClaimed = await dependencies.markCompensationPending(claim);
    } catch {
      compensationClaimed = false;
    }

    if (!compensationClaimed) {
      await requireManualReconciliation(dependencies, claim, "compensation_claim_failed");
      return { kind: "manual_reconciliation_required" };
    }

    let identityDeleted = false;
    try {
      identityDeleted = await dependencies.deleteAuthIdentity(invite.authUserId);
    } catch {
      identityDeleted = false;
    }

    if (!identityDeleted) {
      await requireManualReconciliation(dependencies, claim, "auth_compensation_failed");
      return { kind: "manual_reconciliation_required" };
    }

    let compensated = false;
    try {
      compensated = await dependencies.markCompensated(claim);
    } catch {
      compensated = false;
    }

    if (!compensated) {
      await requireManualReconciliation(dependencies, claim, "compensation_state_persistence_failed");
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
    await requireManualReconciliation(dependencies, claim, "completion_state_persistence_failed");
    return { kind: "failed", code: "COMPLETION_FAILED" };
  }

  return { kind: "created", authUserId: invite.authUserId };
}
