import assert from "node:assert/strict";
import test from "node:test";
import {
  runEmployeeProvisioning,
  type EmployeeProvisioningDependencies,
  type EmployeeProvisioningPayload,
  type ProvisioningClaimResult,
} from "./employee-provisioning-orchestrator-core.ts";

const payload: EmployeeProvisioningPayload = {
  fullName: "Maria da Silva",
  email: "maria@example.com",
  organizationId: "550e8400-e29b-41d4-a716-446655440000",
  payloadHash: `sha256:${"a".repeat(64)}`,
  idempotencyKey: "request-123",
  actorUserId: "admin-1",
};

const claimed: ProvisioningClaimResult = {
  kind: "claimed",
  claim: { operationId: "operation-1", claimId: "claim-1" },
};

function dependencies(overrides: Partial<EmployeeProvisioningDependencies> = {}) {
  const events: string[] = [];
  const base: EmployeeProvisioningDependencies = {
    claimOperation: async () => {
      events.push("claim");
      return claimed;
    },
    markAuthCreationStarted: async () => {
      events.push("mark-auth-creation-started");
      return true;
    },
    createAuthIdentityWithFirstAccessPending: async () => {
      events.push("create-auth-identity");
      return {
        kind: "created" as const,
        authUserId: "auth-user-1",
        identityCreatedByOperation: true,
      };
    },
    persistAuthUserId: async () => {
      events.push("persist-auth-id");
      return true;
    },
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "committed" as const };
    },
    generateInviteLink: async () => {
      events.push("generate-invite-link");
      return { kind: "generated" as const, actionLink: "https://example.test/invite" };
    },
    persistInviteLink: async () => {
      events.push("persist-invite-link");
      return true;
    },
    completeOperation: async () => {
      events.push("complete");
      return true;
    },
    markCompensationPending: async () => {
      events.push("compensation-pending");
      return true;
    },
    deleteUnacceptedAuthIdentityCreatedByOperation: async () => {
      events.push("delete-auth-identity");
      return { kind: "deleted" as const };
    },
    markCompensated: async () => {
      events.push("compensated");
      return true;
    },
    markManualReconciliationRequired: async () => {
      events.push("manual-reconciliation");
    },
    ...overrides,
  };
  return { dependencies: base, events };
}

test("runs the complete sequence and only reports success after domain audit and completion", async () => {
  const { dependencies: deps, events } = dependencies();
  const result = await runEmployeeProvisioning(payload, deps);

  assert.deepEqual(result, { kind: "created", firstAccessLink: "https://example.test/invite" });
  assert.deepEqual(events, [
    "claim",
    "mark-auth-creation-started",
    "create-auth-identity",
    "persist-auth-id",
    "persist-domain-and-audit",
    "generate-invite-link",
    "persist-invite-link",
    "complete",
  ]);
});

test("replays an existing operation without sending another invite", async () => {
  let claimCalls = 0;
  const { dependencies: deps, events } = dependencies({
    claimOperation: async () => {
      claimCalls += 1;
      return {
        kind: "replay",
        status: "completed",
        authUserId: "auth-user-1",
      };
    },
  });

  const result = await runEmployeeProvisioning(payload, deps);

  assert.deepEqual(result, {
    kind: "replayed",
    status: "completed",
    authUserId: "auth-user-1",
  });
  assert.equal(claimCalls, 1);
  assert.deepEqual(events, []);
});

test("does not perform side effects when the idempotency key conflicts", async () => {
  let claimCalls = 0;
  const { dependencies: deps, events } = dependencies({
    claimOperation: async () => {
      claimCalls += 1;
      return { kind: "conflict" };
    },
  });

  assert.deepEqual(await runEmployeeProvisioning(payload, deps), { kind: "conflict" });
  assert.equal(claimCalls, 1);
  assert.deepEqual(events, []);
});

test("does not retry an invite whose external outcome is unknown", async () => {
  const { dependencies: deps, events } = dependencies({
    createAuthIdentityWithFirstAccessPending: async () => {
      events.push("create-auth-identity");
      return { kind: "unknown" };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events, ["claim", "mark-auth-creation-started", "create-auth-identity", "manual-reconciliation"]);
});

test("does not compensate an Auth identity whose ownership is unproven", async () => {
  const { dependencies: deps, events } = dependencies({
    createAuthIdentityWithFirstAccessPending: async () => {
      events.push("create-auth-identity");
      return {
        kind: "created",
        authUserId: "auth-user-1",
        identityCreatedByOperation: false,
      };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events, ["claim", "mark-auth-creation-started", "create-auth-identity", "persist-auth-id", "manual-reconciliation"]);
});

test("compensates a proven Auth identity after the atomic domain transaction fails", async () => {
  const { dependencies: deps, events } = dependencies({
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "rolled_back" as const };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "failed", code: "DOMAIN_TRANSACTION_FAILED", operationId: "operation-1" },
  );
  assert.deepEqual(events, [
    "claim",
    "mark-auth-creation-started",
    "create-auth-identity",
    "persist-auth-id",
    "persist-domain-and-audit",
    "compensation-pending",
    "delete-auth-identity",
    "compensated",
  ]);
});

test("does not compensate when the PostgreSQL transaction outcome is ambiguous", async () => {
  const { dependencies: deps, events } = dependencies({
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "unknown" };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events, [
    "claim",
    "mark-auth-creation-started",
    "create-auth-identity",
    "persist-auth-id",
    "persist-domain-and-audit",
    "manual-reconciliation",
  ]);
});

test("requires manual reconciliation when Auth compensation fails", async () => {
  const { dependencies: deps, events } = dependencies({
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "rolled_back" as const };
    },
    deleteUnacceptedAuthIdentityCreatedByOperation: async () => {
      events.push("delete-auth-identity");
      return { kind: "not_safe" as const };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events.slice(-2), [
    "delete-auth-identity",
    "manual-reconciliation",
  ]);
});

test("does not continue to domain writes when Auth identity persistence fails", async () => {
  const { dependencies: deps, events } = dependencies({
    persistAuthUserId: async () => {
      events.push("persist-auth-id");
      return false;
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "failed", code: "AUTH_ID_PERSISTENCE_FAILED", operationId: "operation-1" },
  );
  assert.deepEqual(events, [
    "claim",
    "mark-auth-creation-started",
    "create-auth-identity",
    "persist-auth-id",
    "manual-reconciliation",
  ]);
});

test("does not delete Auth identity when the completion state cannot be confirmed", async () => {
  const { dependencies: deps, events } = dependencies({
    completeOperation: async () => {
      events.push("complete");
      return false;
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "failed", code: "COMPLETION_FAILED", operationId: "operation-1" },
  );
  assert.deepEqual(events, [
    "claim",
    "mark-auth-creation-started",
    "create-auth-identity",
    "persist-auth-id",
    "persist-domain-and-audit",
    "generate-invite-link",
    "persist-invite-link",
    "complete",
    "manual-reconciliation",
  ]);
});

test("fails closed when the persistent claim cannot be acquired", async () => {
  const { dependencies: deps, events } = dependencies({
    claimOperation: async () => {
      events.push("claim");
      throw new Error("database unavailable");
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "failed", code: "CLAIM_FAILED" },
  );
  assert.deepEqual(events, ["claim"]);
});


test("does not run side effects while another request owns the persistent claim", async () => {
  const { dependencies: deps, events } = dependencies({
    claimOperation: async () => {
      events.push("claim");
      return { kind: "in_progress", operationId: "operation-1" };
    },
  });

  assert.deepEqual(await runEmployeeProvisioning(payload, deps), { kind: "in_progress", operationId: "operation-1" });
  assert.deepEqual(events, ["claim"]);
});

test("does not run side effects when the operation requires manual reconciliation", async () => {
  const { dependencies: deps, events } = dependencies({
    claimOperation: async () => {
      events.push("claim");
      return { kind: "manual_reconciliation_required", operationId: "operation-1" };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events, ["claim"]);
});

test("does not persist domain records when invite creation is rejected", async () => {
  const { dependencies: deps, events } = dependencies({
    createAuthIdentityWithFirstAccessPending: async () => {
      events.push("create-auth-identity");
      return { kind: "not_created" };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "failed", code: "AUTH_IDENTITY_NOT_CREATED", operationId: "operation-1" },
  );
  assert.deepEqual(events, ["claim", "mark-auth-creation-started", "create-auth-identity", "manual-reconciliation"]);
});

test("does not delete an Auth identity when acquiring the compensation claim fails", async () => {
  const { dependencies: deps, events } = dependencies({
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "rolled_back" };
    },
    markCompensationPending: async () => {
      events.push("compensation-pending");
      return false;
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events, [
    "claim",
    "mark-auth-creation-started",
    "create-auth-identity",
    "persist-auth-id",
    "persist-domain-and-audit",
    "compensation-pending",
    "manual-reconciliation",
  ]);
});

test("requires manual reconciliation when Auth deletion has an unknown outcome", async () => {
  const { dependencies: deps, events } = dependencies({
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "rolled_back" };
    },
    deleteUnacceptedAuthIdentityCreatedByOperation: async () => {
      events.push("delete-auth-identity");
      return { kind: "unknown" };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events.slice(-2), [
    "delete-auth-identity",
    "manual-reconciliation",
  ]);
});

test("does not report compensation complete when its terminal state cannot be persisted", async () => {
  const { dependencies: deps, events } = dependencies({
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "rolled_back" };
    },
    markCompensated: async () => {
      events.push("compensated");
      return false;
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events.slice(-2), [
    "compensated",
    "manual-reconciliation",
  ]);
});

test("does not claim reconciliation was recorded when its persistence fails", async () => {
  const { dependencies: deps, events } = dependencies({
    createAuthIdentityWithFirstAccessPending: async () => {
      events.push("create-auth-identity");
      return { kind: "unknown" };
    },
    markManualReconciliationRequired: async () => {
      events.push("manual-reconciliation");
      throw new Error("database unavailable");
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: "operation-1" },
  );
  assert.deepEqual(events, ["claim", "mark-auth-creation-started", "create-auth-identity", "manual-reconciliation"]);
});


test("does not send the invite until the domain transaction has committed", async () => {
  const { dependencies: deps, events } = dependencies({
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "rolled_back" as const };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "failed", code: "DOMAIN_TRANSACTION_FAILED", operationId: "operation-1" },
  );
  assert.deepEqual(events, [
    "claim",
    "mark-auth-creation-started",
    "create-auth-identity",
    "persist-auth-id",
    "persist-domain-and-audit",
    "compensation-pending",
    "delete-auth-identity",
    "compensated",
  ]);
});

test("generates the invite link only after the domain and audit transaction commits", async () => {
  const { dependencies: deps, events } = dependencies({
    persistProfileMembershipAndAuditAtomically: async () => {
      events.push("persist-domain-and-audit");
      return { kind: "rolled_back" as const };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "failed", code: "DOMAIN_TRANSACTION_FAILED", operationId: "operation-1" },
  );
  assert.equal(events.includes("generate-invite-link"), false);
  assert.equal(events.includes("send-invite-email"), false);
});

test("does not send email when post-commit invite-link generation is ambiguous", async () => {
  const { dependencies: deps, events } = dependencies({
    generateInviteLink: async () => {
      events.push("generate-invite-link");
      return { kind: "unknown" as const };
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events.slice(-2), ["generate-invite-link", "manual-reconciliation"]);
  assert.equal(events.includes("send-invite-email"), false);
});

test("persists the encrypted invite link before Resend delivery", async () => {
  const { dependencies: deps, events } = dependencies({
    persistInviteLink: async () => {
      events.push("persist-invite-link");
      return false;
    },
  });

  assert.deepEqual(
    await runEmployeeProvisioning(payload, deps),
    { kind: "manual_reconciliation_required", operationId: "operation-1" },
  );
  assert.deepEqual(events.slice(-3), [
    "generate-invite-link",
    "persist-invite-link",
    "manual-reconciliation",
  ]);
  assert.equal(events.includes("send-invite-email"), false);
});
