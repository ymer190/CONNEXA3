import assert from "node:assert/strict";
import test from "node:test";
import { createEmployeeProvisioningReconciliationGetHandler } from "./employee-provisioning-reconciliation-handler.ts";

const operationId = "550e8400-e29b-41d4-a716-446655440000";

function makeHandler(overrides: {
  authorize?: () => Promise<
    | { authorized: true; actorUserId: string }
    | {
        authorized: false;
        status: 401 | 403 | 503;
        code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTHORIZATION_CHECK_FAILED";
        message: string;
      }
  >;
  lookup?: (id: string) => Promise<{
    operationId: string;
    status: string;
    phase: string;
    hasInviteLink: boolean;
    hasProviderReceipt: boolean;
    failureCode: string | null;
  } | null>;
} = {}) {
  const handler = createEmployeeProvisioningReconciliationGetHandler({
    authorize: overrides.authorize ?? (async () => ({
      authorized: true,
      actorUserId: "650e8400-e29b-41d4-a716-446655440000",
    })),
    lookup: overrides.lookup ?? (async (id) => ({
      operationId: id,
      status: "manual_reconciliation_required",
      phase: "manual_reconciliation_required",
      hasInviteLink: true,
      hasProviderReceipt: true,
      failureCode: "invite_email_delivery_outcome_unknown",
    })),
  });
  return handler;
}

test("returns only safe reconciliation metadata and never exposes PII, Auth IDs, tokens or provider receipt", async () => {
  const handler = makeHandler();
  const response = await handler(new Request(
    `https://connexa.example/api/admin/employees?operationId=${operationId}`,
  ));
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /manual_reconciliation_required/);
  assert.match(body, /hasInviteLink/);
  assert.match(body, /hasProviderReceipt/);
  assert.equal(body.includes("token_hash"), false);
  assert.equal(body.includes("secret"), false);
  assert.equal(body.includes("authUserId"), false);
});

test("rejects invalid operation IDs before lookup", async () => {
  let lookupCalls = 0;
  const handler = makeHandler({
    lookup: async () => {
      lookupCalls += 1;
      return null;
    },
  });
  const response = await handler(new Request(
    "https://connexa.example/api/admin/employees?operationId=not-a-uuid",
  ));
  assert.equal(response.status, 400);
  assert.equal(lookupCalls, 0);
});

test("does not allow unauthenticated status lookup", async () => {
  let lookupCalls = 0;
  const handler = makeHandler({
    authorize: async () => ({
      authorized: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Não autenticado.",
    }),
    lookup: async () => {
      lookupCalls += 1;
      return null;
    },
  });
  const response = await handler(new Request(
    `https://connexa.example/api/admin/employees?operationId=${operationId}`,
  ));
  assert.equal(response.status, 401);
  assert.equal(lookupCalls, 0);
});

test("returns not found when the caller cannot access the operation", async () => {
  const handler = makeHandler({ lookup: async () => null });
  const response = await handler(new Request(
    `https://connexa.example/api/admin/employees?operationId=${operationId}`,
  ));
  assert.equal(response.status, 404);
});
