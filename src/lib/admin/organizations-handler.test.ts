import assert from "node:assert/strict";
import test from "node:test";

import { createOrganizationsGetHandler } from "./organizations-handler.ts";

test("maps unauthenticated, forbidden, authorization failure and query failure to HTTP status codes", async () => {
  const cases = [
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
    ["AUTHORIZATION_CHECK_FAILED", 503],
    ["ORGANIZATION_QUERY_FAILED", 500],
  ] as const;

  for (const [code, expectedStatus] of cases) {
    const handler = createOrganizationsGetHandler(async () => ({
      success: false,
      code,
      message: "Falha controlada.",
    }));
    const response = await handler();

    assert.equal(response.status, expectedStatus);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, code);
  }
});

test("returns only id and name for an authorized organization lookup", async () => {
  const handler = createOrganizationsGetHandler(async () => ({
    success: true,
    data: [{ id: "org-1", name: "Connexa" }],
  }));
  const response = await handler();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    data: [{ id: "org-1", name: "Connexa" }],
  });
});

test("converts unexpected service exceptions into a generic HTTP 500", async () => {
  const handler = createOrganizationsGetHandler(async () => {
    throw new Error("internal database detail");
  });
  const response = await handler();

  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "ORGANIZATION_QUERY_FAILED");
  assert.equal(JSON.stringify(body).includes("internal database detail"), false);
});
