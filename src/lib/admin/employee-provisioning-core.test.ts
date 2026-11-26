import assert from "node:assert/strict";
import test from "node:test";
import {
  createProvisioningPayloadHash,
  decideIdempotency,
  mayCompensateAuthUser,
  sanitizeProvisioningError,
  transitionProvisioningOperation,
  type ProvisioningOperation,
} from "./employee-provisioning-core.ts";

const normalizedPayload = {
  fullName: "Maria da Silva",
  email: "maria@example.com",
  organizationId: "550e8400-e29b-41d4-a716-446655440000",
};

const validHash = createProvisioningPayloadHash(normalizedPayload);
const operation: ProvisioningOperation = {
  idempotencyKey: "request-123",
  payloadHash: validHash,
  status: "pending",
  authUserId: null,
  attempts: 0,
};

test("creates a deterministic server-side hash from normalized payload fields", () => {
  const first = createProvisioningPayloadHash(normalizedPayload);
  const second = createProvisioningPayloadHash({ ...normalizedPayload });
  assert.equal(first, second);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.includes(normalizedPayload.email), false);
});

test("changes the payload hash when any canonical field changes", () => {
  assert.notEqual(createProvisioningPayloadHash({ ...normalizedPayload, fullName: "Maria Silva" }), validHash);
  assert.notEqual(createProvisioningPayloadHash({ ...normalizedPayload, email: "other@example.com" }), validHash);
  assert.notEqual(createProvisioningPayloadHash({ ...normalizedPayload, organizationId: "650e8400-e29b-41d4-a716-446655440000" }), validHash);
});

test("rejects non-normalized payload before hashing", () => {
  assert.throws(() => createProvisioningPayloadHash({ ...normalizedPayload, email: " MARIA@example.com " }), /normalized provisioning payload/);
  assert.throws(() => createProvisioningPayloadHash({ ...normalizedPayload, fullName: " Maria  da Silva " }), /normalized provisioning payload/);
});

test("creates a new operation when the key is not registered", () => {
  assert.deepEqual(decideIdempotency(null, "request-123", validHash), { kind: "create" });
});

test("reuses an operation when key and payload hash match", () => {
  assert.deepEqual(decideIdempotency(operation, "request-123", validHash), { kind: "reuse", operation });
});

test("rejects reuse of an idempotency key with a different payload", () => {
  assert.deepEqual(decideIdempotency(operation, "request-123", `sha256:${"a".repeat(64)}`), { kind: "conflict" });
});

test("fails closed when the selected row does not match the requested idempotency key", () => {
  assert.deepEqual(decideIdempotency(operation, "request-456", validHash), { kind: "conflict" });
});

test("rejects empty, oversized, and malformed idempotency inputs", () => {
  assert.throws(() => decideIdempotency(null, "", validHash), /valid idempotency key/);
  assert.throws(() => decideIdempotency(null, "x".repeat(129), validHash), /valid idempotency key/);
  assert.throws(() => decideIdempotency(null, "request with spaces", validHash), /valid idempotency key/);
  assert.throws(() => decideIdempotency(null, "request\n123", validHash), /valid idempotency key/);
  assert.deepEqual(decideIdempotency(null, "request:123/abc", validHash), { kind: "create" });
  assert.throws(() => decideIdempotency(null, "request-123", "not-a-hash"), /valid idempotency key/);
});

test("allows pending to complete and compensation to be retried", () => {
  assert.deepEqual(transitionProvisioningOperation("pending", "completed"), { success: true, status: "completed" });
  assert.deepEqual(transitionProvisioningOperation("compensation_pending", "compensated"), { success: true, status: "compensated" });
});

test("rejects transitions out of terminal states", () => {
  assert.deepEqual(transitionProvisioningOperation("completed", "pending"), { success: false, code: "INVALID_TRANSITION" });
  assert.deepEqual(transitionProvisioningOperation("compensated", "completed"), { success: false, code: "INVALID_TRANSITION" });
});

test("never compensates an identity without operation-level proof", () => {
  assert.equal(mayCompensateAuthUser({ authUserId: "auth-user-1", identityProvenForOperation: false, preexistingIdentity: false }), false);
  assert.equal(mayCompensateAuthUser({ authUserId: "auth-user-1", identityProvenForOperation: true, preexistingIdentity: true }), false);
  assert.equal(mayCompensateAuthUser({ authUserId: "auth-user-1", identityProvenForOperation: true, preexistingIdentity: false }), true);
});

test("sanitizes credentials and personal identifiers from errors", () => {
  const result = sanitizeProvisioningError("Invite failed for person@example.com: Bearer abc password=hunter2");
  assert.equal(result.includes("person@example.com"), false);
  assert.equal(result.includes("abc"), false);
  assert.equal(result.includes("hunter2"), false);
  assert.match(result, /\[EMAIL\]/);
  assert.match(result, /\[REDACTED\]/);
});

test("covers the complete provisioning status transition matrix", () => {
  const statuses = [
    "pending",
    "completed",
    "compensation_pending",
    "compensated",
    "manual_reconciliation_required",
  ] as const;
  const allowed: Record<(typeof statuses)[number], readonly string[]> = {
    pending: ["completed", "compensation_pending", "compensated", "manual_reconciliation_required"],
    completed: [],
    compensation_pending: ["compensated", "manual_reconciliation_required"],
    compensated: [],
    manual_reconciliation_required: ["compensation_pending", "compensated"],
  };

  for (const current of statuses) {
    for (const next of statuses) {
      const result = transitionProvisioningOperation(current, next);
      if (allowed[current].includes(next)) {
        assert.deepEqual(result, { success: true, status: next }, `expected ${current} -> ${next} to be allowed`);
      } else {
        assert.deepEqual(result, { success: false, code: "INVALID_TRANSITION" }, `expected ${current} -> ${next} to be rejected`);
      }
    }
  }
});

test("never compensates when the Auth identity is missing", () => {
  assert.equal(
    mayCompensateAuthUser({ authUserId: null, identityProvenForOperation: true, preexistingIdentity: false }),
    false,
  );
});

test("sanitizes multiline errors and enforces the maximum stored length", () => {
  const result = sanitizeProvisioningError(
    `Request failed\nAuthorization: Bearer very-secret-token\ncontact=private@example.com\n${"x".repeat(400)}`,
  );
  assert.equal(result.includes("\\n"), false);
  assert.equal(result.includes("very-secret-token"), false);
  assert.equal(result.includes("private@example.com"), false);
  assert.ok(result.length <= 240);
});

