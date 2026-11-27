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
  | { kind: "in_progress"; operationId: string }
  | { kind: "manual_reconciliation_required"; operationId: string };

export type DomainTransactionResult =
  | { kind: "committed" }
  | { kind: "rolled_back" }
  | { kind: "unknown" };

export type AuthCompensationResult =
  | { kind: "deleted" }
  | { kind: "not_safe" }
  | { kind: "unknown" };

export type AuthIdentityCreationResult =
  | {
      kind: "created";
      authUserId: string;
      identityCreatedByOperation: boolean;
    }
  | { kind: "not_created" }
  | { kind: "unknown" };

export type InviteLinkGenerationResult =
  | { kind: "generated"; actionLink: string }
  | { kind: "failed" | "unknown" };

export type EmployeeProvisioningResult =
  | { kind: "created"; firstAccessLink: string }
  | { kind: "replayed"; status: ProvisioningStatus; authUserId: string | null }
  | { kind: "conflict" }
  | { kind: "in_progress"; operationId: string }
  | { kind: "manual_reconciliation_required"; operationId: string }
  | {
      kind: "failed";
      code:
        | "CLAIM_FAILED"
        | "AUTH_IDENTITY_NOT_CREATED"
        | "AUTH_ID_PERSISTENCE_FAILED"
        | "DOMAIN_TRANSACTION_FAILED"
        | "COMPLETION_FAILED"
        | "RECONCILIATION_MARKER_FAILED";
      operationId?: string;
    };

export type EmployeeProvisioningDependencies = {
  claimOperation: (
    payload: EmployeeProvisioningPayload,
  ) => Promise<ProvisioningClaimResult>;
  /**
   * Creates the Auth identity server-side with app_metadata.first_access_pending=true,
   * without sending email. Do not use inviteUserByEmail here.
   */
  markAuthCreationStarted: (claim: ProvisioningClaim) => Promise<boolean>;
  createAuthIdentityWithFirstAccessPending: (
    payload: EmployeeProvisioningPayload,
    claim: ProvisioningClaim,
  ) => Promise<AuthIdentityCreationResult>;
  persistAuthUserId: (
    claim: ProvisioningClaim,
    authUserId: string,
  ) => Promise<boolean>;
  /** One PostgreSQL transaction: profiles + organization_members + central audit. */
  persistProfileMembershipAndAuditAtomically: (
    claim: ProvisioningClaim,
    payload: EmployeeProvisioningPayload,
    authUserId: string,
  ) => Promise<DomainTransactionResult>;
  /** Generate the invite link only after the profile, membership and audit commit. */
  generateInviteLink: (
    payload: EmployeeProvisioningPayload,
    claim: ProvisioningClaim,
    authUserId: string,
  ) => Promise<InviteLinkGenerationResult>;
  /** Persist the generated link encrypted before returning it to the initiating administrator. */
  persistInviteLink: (
    claim: ProvisioningClaim,
    actionLink: string,
  ) => Promise<boolean>;
  completeOperation: (claim: ProvisioningClaim) => Promise<boolean>;
  markCompensationPending: (claim: ProvisioningClaim) => Promise<boolean>;
  /** Must verify the identity is still unaccepted and belongs to this operation before deletion. */
  deleteUnacceptedAuthIdentityCreatedByOperation: (
    authUserId: string,
    claim: ProvisioningClaim,
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
 * Coordinates Auth identity creation with the PostgreSQL domain transaction.
 * The invite link is generated only after the transaction commits and returned
 * only to the initiating administrator. No email provider is used.
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
  if (claimResult.kind === "in_progress") {
    return { kind: "in_progress", operationId: claimResult.operationId };
  }
  if (claimResult.kind === "manual_reconciliation_required") {
    return {
      kind: "manual_reconciliation_required",
      operationId: claimResult.operationId,
    };
  }
  if (claimResult.kind === "replay") {
    return {
      kind: "replayed",
      status: claimResult.status,
      authUserId: claimResult.authUserId,
    };
  }

  const { claim } = claimResult;
  let authCreationStarted = false;
  try {
    authCreationStarted = await dependencies.markAuthCreationStarted(claim);
  } catch {
    authCreationStarted = false;
  }
  if (!authCreationStarted) {
    if (!(await requireManualReconciliation(dependencies, claim, "auth_creation_claim_failed"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "manual_reconciliation_required", operationId: claim.operationId };
  }

  let invite: AuthIdentityCreationResult;
  try {
    invite = await dependencies.createAuthIdentityWithFirstAccessPending(payload, claim);
  } catch {
    if (!(await requireManualReconciliation(dependencies, claim, "invite_outcome_unknown"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "manual_reconciliation_required", operationId: claim.operationId };
  }

  if (invite.kind === "unknown") {
    if (!(await requireManualReconciliation(dependencies, claim, "invite_outcome_unknown"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "manual_reconciliation_required", operationId: claim.operationId };
  }

  if (invite.kind === "not_created") {
    if (!(await requireManualReconciliation(dependencies, claim, "invite_not_created"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "failed", code: "AUTH_IDENTITY_NOT_CREATED", operationId: claim.operationId };
  }

  if (!invite.authUserId) {
    if (!(await requireManualReconciliation(dependencies, claim, "auth_identity_id_missing"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "manual_reconciliation_required", operationId: claim.operationId };
  }

  let authIdPersisted = false;
  try {
    authIdPersisted = await dependencies.persistAuthUserId(
      claim,
      invite.authUserId,
    );
  } catch {
    authIdPersisted = false;
  }

  if (!authIdPersisted) {
    if (!(await requireManualReconciliation(dependencies, claim, "auth_user_id_persistence_failed"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "failed", code: "AUTH_ID_PERSISTENCE_FAILED", operationId: claim.operationId };
  }

  if (!invite.identityCreatedByOperation) {
    if (!(await requireManualReconciliation(dependencies, claim, "auth_identity_ownership_unproven"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "manual_reconciliation_required", operationId: claim.operationId };
  }

  let domainResult: DomainTransactionResult;
  try {
    domainResult = await dependencies.persistProfileMembershipAndAuditAtomically(
      claim,
      payload,
      invite.authUserId,
    );
  } catch {
    domainResult = { kind: "unknown" };
  }

  if (domainResult.kind === "unknown") {
    if (!(await requireManualReconciliation(dependencies, claim, "domain_transaction_outcome_unknown"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "manual_reconciliation_required", operationId: claim.operationId };
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
        return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
      }
      return { kind: "manual_reconciliation_required", operationId: claim.operationId };
    }

    let compensationResult: AuthCompensationResult;
    try {
      compensationResult =
        await dependencies.deleteUnacceptedAuthIdentityCreatedByOperation(
          invite.authUserId,
          claim,
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
      ))) return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
      return { kind: "manual_reconciliation_required", operationId: claim.operationId };
    }

    let compensated = false;
    try {
      compensated = await dependencies.markCompensated(claim);
    } catch {
      compensated = false;
    }

    if (!compensated) {
      if (!(await requireManualReconciliation(dependencies, claim, "compensation_state_persistence_failed"))) {
        return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
      }
      return { kind: "manual_reconciliation_required", operationId: claim.operationId };
    }

    return { kind: "failed", code: "DOMAIN_TRANSACTION_FAILED", operationId: claim.operationId };
  }

  // Generate the invite only after Auth metadata and the atomic domain/audit
  // commit are confirmed. generateLink does not send the email.
  let inviteLinkResult: InviteLinkGenerationResult;
  try {
    inviteLinkResult = await dependencies.generateInviteLink(
      payload,
      claim,
      invite.authUserId,
    );
  } catch {
    inviteLinkResult = { kind: "unknown" };
  }

  if (inviteLinkResult.kind !== "generated" || !inviteLinkResult.actionLink) {
    if (!(await requireManualReconciliation(
      dependencies,
      claim,
      inviteLinkResult.kind === "failed"
        ? "invite_link_generation_failed"
        : "invite_link_generation_outcome_unknown",
    ))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "manual_reconciliation_required", operationId: claim.operationId };
  }

  let inviteLinkPersisted = false;
  try {
    inviteLinkPersisted = await dependencies.persistInviteLink(
      claim,
      inviteLinkResult.actionLink,
    );
  } catch {
    inviteLinkPersisted = false;
  }

  if (!inviteLinkPersisted) {
    if (!(await requireManualReconciliation(dependencies, claim, "invite_link_persistence_failed"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "manual_reconciliation_required", operationId: claim.operationId };
  }

  // No email provider is used. The bearer link is returned only to the
  // already-authorized administrator who initiated this request.
  let completed = false;
  try {
    completed = await dependencies.completeOperation(claim);
  } catch {
    completed = false;
  }

  if (!completed) {
    if (!(await requireManualReconciliation(dependencies, claim, "completion_state_persistence_failed"))) {
      return { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: claim.operationId };
    }
    return { kind: "failed", code: "COMPLETION_FAILED", operationId: claim.operationId };
  }

  return { kind: "created", firstAccessLink: inviteLinkResult.actionLink };
}
