import assert from "node:assert/strict";
import test from "node:test";
import { createEmployeeProvisioningPostHandler } from "./employee-provisioning-handler.ts";
import type {
  EmployeeProvisioningPayload,
  EmployeeProvisioningResult,
} from "./employee-provisioning-orchestrator-core.ts";

const actorUserId = "650e8400-e29b-41d4-a716-446655440000";
const body = {
  fullName: "Maria da Silva",
  email: "maria@example.com",
  organizationId: "550e8400-e29b-41d4-a716-446655440000",
};

function request(payload: unknown = body, key = "request-123") {
  return new Request("https://connexa.test/api/admin/employees", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(payload),
  });
}

function dependencies(overrides: {
  authorize?: () => Promise<
    | { authorized: true; actorUserId: string }
    | { authorized: false; status: 401 | 403 | 503; code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTHORIZATION_CHECK_FAILED"; message: string }
  >;
  provision?: (payload: EmployeeProvisioningPayload) => Promise<EmployeeProvisioningResult>;
} = {}) {
  const received: EmployeeProvisioningPayload[] = [];
  const handler = createEmployeeProvisioningPostHandler({
    authorize: overrides.authorize ?? (async () => ({ authorized: true, actorUserId })),
    provision: async (payload) => {
      received.push(payload);
      return overrides.provision
        ? await overrides.provision(payload)
        : { kind: "created", firstAccessLink: "https://example.test/first-access?token=secret" };
    },
  });
  return { handler, received };
}

test("returns 201 only after the injected provisioner confirms creation", async () => {
  const { handler, received } = dependencies();
  const response = await handler(request());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.deepEqual(await response.json(), {
    success: true,
    data: { status: "created", firstAccessLink: "https://example.test/first-access?token=secret" },
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].actorUserId, actorUserId);
  assert.equal(received[0].email, "maria@example.com");
});

test("does not accept actor or hash supplied by the browser", async () => {
  const { handler, received } = dependencies();
  const response = await handler(request({
    ...body,
    actorUserId: "forged",
    payloadHash: "forged",
  }));
  assert.equal(response.status, 201);
  assert.equal(received[0].actorUserId, actorUserId);
  assert.match(received[0].payloadHash, /^sha256:[a-f0-9]{64}$/);
});

test("rejects an unauthenticated request before parsing or provisioning", async () => {
  const { handler, received } = dependencies({
    authorize: async () => ({
      authorized: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "É necessário entrar.",
    }),
  });
  const response = await handler(request());
  assert.equal(response.status, 401);
  assert.equal(received.length, 0);
});

test("fails closed when authorization throws", async () => {
  const { handler, received } = dependencies({
    authorize: async () => { throw new Error("internal detail"); },
  });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.equal(received.length, 0);
  assert.equal((await response.text()).includes("internal detail"), false);
});

test("requires the idempotency key header", async () => {
  const { handler, received } = dependencies();
  const response = await handler(request(body, ""));
  assert.equal(response.status, 400);
  assert.equal(received.length, 0);
});

test("maps idempotency conflict without retrying side effects", async () => {
  const { handler } = dependencies({
    provision: async () => ({ kind: "conflict" }),
  });
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "IDEMPOTENCY_CONFLICT",
      message: "A chave de idempotência já foi usada com outros dados.",
    },
  });
});

test("maps in-progress operations to retryable HTTP 202", async () => {
  const { handler } = dependencies({
    provision: async () => ({ kind: "in_progress", operationId: "operation-1" }),
  });
  const response = await handler(request());
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("Retry-After"), "2");
  assert.deepEqual(await response.json(), {
    success: true,
    data: { status: "in_progress", operationId: "operation-1" },
  });
});

test("does not expose Auth identifiers or internal errors on success", async () => {
  const { handler } = dependencies();
  const response = await handler(request());
  const text = await response.text();
  assert.equal(text.includes("auth-user-1"), false);
  assert.equal(text.includes("maria@example.com"), false);
  assert.equal(text.includes("secret"), true);
});

test("maps reconciliation and unknown failures to fail-closed responses", async () => {
  const cases = [
    [{ kind: "manual_reconciliation_required", operationId: "operation-1" }, 503, "MANUAL_RECONCILIATION_REQUIRED"],
    [{ kind: "failed", code: "RECONCILIATION_MARKER_FAILED", operationId: "operation-1" }, 503, "RECONCILIATION_MARKER_FAILED"],
    [{ kind: "failed", code: "DOMAIN_TRANSACTION_FAILED" }, 502, "DOMAIN_TRANSACTION_FAILED"],
  ] as const;
  for (const [result, status, code] of cases) {
    const { handler } = dependencies({ provision: async () => result });
    const response = await handler(request());
    assert.equal(response.status, status);
    const json = await response.json();
    assert.equal(json.error.code, code);
    if (code === "MANUAL_RECONCILIATION_REQUIRED" || code === "RECONCILIATION_MARKER_FAILED") {
      assert.equal(json.error.operationId, "operation-1");
    }
  }
});

test("rejects malformed JSON before invoking the provisioner", async () => {
  const { handler, received } = dependencies();
  const malformed = new Request("https://connexa.test/api/admin/employees", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "request-123",
    },
    body: "{",
  });

  const response = await handler(malformed);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: {
      code: "INVALID_PAYLOAD",
      message: "Informe os dados do colaborador em JSON válido.",
    },
  });
  assert.equal(received.length, 0);
});

test("rejects invalid employee data before invoking the provisioner", async () => {
  const { handler, received } = dependencies();
  const response = await handler(request({ ...body, email: "not-an-email" }));

  assert.equal(response.status, 400);
  assert.equal(received.length, 0);
});

test("rejects an invalid authenticated actor before invoking the provisioner", async () => {
  const { handler, received } = dependencies({
    authorize: async () => ({ authorized: true, actorUserId: "not-a-uuid" }),
  });
  const response = await handler(request());

  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).error.code, "INVALID_ACTOR");
  assert.equal(received.length, 0);
});

test("rejects a forbidden administrator before reading the request body", async () => {
  let provisionCalls = 0;
  const handler = createEmployeeProvisioningPostHandler({
    authorize: async () => ({
      authorized: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Apenas administradores da plataforma podem provisionar.",
    }),
    provision: async () => {
      provisionCalls += 1;
      return { kind: "created", authUserId: "auth-user-1" };
    },
  });
  const malformed = new Request("https://connexa.test/api/admin/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });

  const response = await handler(malformed);
  assert.equal(response.status, 403);
  assert.equal(provisionCalls, 0);
  assert.equal((await response.json()).error.code, "FORBIDDEN");
});

test("does not expose provisioner exceptions to the client", async () => {
  const { handler } = dependencies({
    provision: async () => {
      throw new Error("database connection string or internal details");
    },
  });
  const response = await handler(request());

  assert.equal(response.status, 503);
  const responseText = await response.text();
  assert.equal(responseText.includes("database connection string"), false);
  assert.match(responseText, /PROVISIONING_UNAVAILABLE/);
});
