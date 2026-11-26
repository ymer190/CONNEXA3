import assert from "node:assert/strict";
import test from "node:test";
import {
  decideIdempotency,
  mayCompensateAuthUser,
  sanitizeProvisioningError,
  transitionProvisioningOperation,
  type ProvisioningOperation,
} from "./employee-provisioning-core.ts";

const operation: ProvisioningOperation = {
  idempotencyKey: "request-123",
  payloadHash: "sha256:payload-a",
  status: "pending",
  authUserId: null,
  attempts: 0,
};

test("creates a new operation when the key is not registered", () => {
  assert.deepEqual(decideIdempotency(null, "request-123", "sha256:payload-a"), {
    kind: "create",
  });
});

test("reuses an operation when key and payload hash match", () => {
  const result = decideIdempotency(operation, "request-123", "sha256:payload-a");
  assert.equal(result.kind, "reuse");
});

test("rejects reuse of an idempotency key with a different payload", () => {
  assert.deepEqual(
    decideIdempotency(operation, "request-123", "sha256:payload-b"),
    { kind: "conflict" },
  );
});

test("allows pending to complete and compensation to be retried", () => {
  assert.deepEqual(transitionProvisioningOperation("pending", "completed"), {
    success: true,
    status: "completed",
  });
  assert.deepEqual(
    transitionProvisioningOperation("compensation_pending", "compensated"),
    { success: true, status: "compensated" },
  );
});

test("rejects transitions out of terminal states", () => {
  assert.deepEqual(transitionProvisioningOperation("completed", "pending"), {
    success: false,
    code: "INVALID_TRANSITION",
  });
  assert.deepEqual(transitionProvisioningOperation("compensated", "completed"), {
    success: false,
    code: "INVALID_TRANSITION",
  });
});

test("never compensates an identity without operation-level proof", () => {
  assert.equal(
    mayCompensateAuthUser({
      authUserId: "auth-user-1",
      identityProvenForOperation: false,
      preexistingIdentity: false,
    }),
    false,
  );
  assert.equal(
    mayCompensateAuthUser({
      authUserId: "auth-user-1",
      identityProvenForOperation: true,
      preexistingIdentity: true,
    }),
    false,
  );
  assert.equal(
    mayCompensateAuthUser({
      authUserId: "auth-user-1",
      identityProvenForOperation: true,
      preexistingIdentity: false,
    }),
    true,
  );
});

test("sanitizes credentials and personal identifiers from errors", () => {
  const result = sanitizeProvisioningError(
    "Invite failed for person@example.com: Bearer abc password=hunter2",
  );
  assert.equal(result.includes("person@example.com"), false);
  assert.equal(result.includes("abc"), false);
  assert.equal(result.includes("hunter2"), false);
  assert.match(result, /\[EMAIL\]/);
  assert.match(result, /\[REDACTED\]/);
});
