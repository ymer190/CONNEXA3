import assert from "node:assert/strict";
import test from "node:test";
import { prepareEmployeeProvisioningRequest } from "./employee-provisioning-request-core.ts";

const body = {
  fullName: "  Maria   da Silva ",
  email: " MARIA@EXAMPLE.COM ",
  organizationId: "550E8400-E29B-41D4-A716-446655440000",
};
const actorId = "650e8400-e29b-41d4-a716-446655440000";

test("prepares normalized server-trusted orchestration input", () => {
  const result = prepareEmployeeProvisioningRequest(body, "request-123", actorId);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.deepEqual(
    {
      fullName: result.data.fullName,
      email: result.data.email,
      organizationId: result.data.organizationId,
      idempotencyKey: result.data.idempotencyKey,
      actorUserId: result.data.actorUserId,
    },
    {
      fullName: "Maria da Silva",
      email: "maria@example.com",
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      idempotencyKey: "request-123",
      actorUserId: actorId,
    },
  );
  assert.match(result.data.payloadHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.data.payloadHash.includes("maria@example.com"), false);
});

test("ignores client-supplied actor and payload hash fields", () => {
  const forged = {
    ...body,
    actorUserId: "attacker",
    payloadHash: "sha256:" + "0".repeat(64),
    idempotencyKey: "forged",
  };
  const result = prepareEmployeeProvisioningRequest(forged, "header-key", actorId);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.actorUserId, actorId);
  assert.equal(result.data.idempotencyKey, "header-key");
  assert.notEqual(result.data.payloadHash, forged.payloadHash);
});

test("rejects missing, malformed and oversized idempotency keys", () => {
  for (const key of [null, "", "contains spaces", "x".repeat(129), "line\nbreak"]) {
    const result = prepareEmployeeProvisioningRequest(body, key, actorId);
    assert.deepEqual(
      result.success ? null : result.code,
      "INVALID_IDEMPOTENCY_KEY",
    );
  }
});

test("rejects a missing or malformed authenticated actor id", () => {
  for (const actor of [null, "", "admin-1", "not-a-uuid"]) {
    const result = prepareEmployeeProvisioningRequest(body, "request-123", actor);
    assert.deepEqual(result.success ? null : result.code, "INVALID_ACTOR");
  }
});

test("rejects invalid employee input before creating an orchestration payload", () => {
  const result = prepareEmployeeProvisioningRequest(
    { ...body, email: "invalid" },
    "request-123",
    actorId,
  );
  assert.deepEqual(result.success ? null : result.code, "INVALID_PAYLOAD");
});
