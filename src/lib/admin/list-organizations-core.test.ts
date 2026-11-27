import assert from "node:assert/strict";
import test from "node:test";

import { listOrganizationsWithDependencies } from "./list-organizations-core.ts";

test("does not execute the privileged query when the user is unauthenticated", async () => {
  let queryCalls = 0;
  const result = await listOrganizationsWithDependencies({
    authorize: async () => ({ authorized: false, reason: "UNAUTHENTICATED" }),
    queryOrganizations: async () => {
      queryCalls += 1;
      return { data: [], error: null };
    },
  });

  assert.deepEqual(result, {
    success: false,
    code: "UNAUTHENTICATED",
    message: "É necessário entrar para continuar.",
  });
  assert.equal(queryCalls, 0);
});

test("does not execute the privileged query for a regular user", async () => {
  let queryCalls = 0;
  const result = await listOrganizationsWithDependencies({
    authorize: async () => ({ authorized: false, reason: "FORBIDDEN" }),
    queryOrganizations: async () => {
      queryCalls += 1;
      return { data: [], error: null };
    },
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "FORBIDDEN");
  assert.equal(queryCalls, 0);
});

test("does not execute the privileged query when authorization validation fails", async () => {
  let queryCalls = 0;
  const result = await listOrganizationsWithDependencies({
    authorize: async () => ({ authorized: false, reason: "AUTHORIZATION_CHECK_FAILED" }),
    queryOrganizations: async () => {
      queryCalls += 1;
      return { data: [], error: null };
    },
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, "AUTHORIZATION_CHECK_FAILED");
  assert.equal(queryCalls, 0);
});

test("converts unexpected authorization exceptions into a stable failure", async () => {
  let queryCalls = 0;
  const result = await listOrganizationsWithDependencies({
    authorize: async () => { throw new Error("sensitive internal detail"); },
    queryOrganizations: async () => {
      queryCalls += 1;
      return { data: [], error: null };
    },
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.code, "AUTHORIZATION_CHECK_FAILED");
    assert.equal(result.message.includes("sensitive"), false);
  }
  assert.equal(queryCalls, 0);
});

test("returns only organization id and name after authorization", async () => {
  let queryCalls = 0;
  const result = await listOrganizationsWithDependencies({
    authorize: async () => ({ authorized: true, userId: "admin-user-id" }),
    queryOrganizations: async () => {
      queryCalls += 1;
      return {
        data: [{ id: "org-1", name: "Connexa", internalField: "must-not-leak" }] as never,
        error: null,
      };
    },
  });

  assert.deepEqual(result, {
    success: true,
    data: [{ id: "org-1", name: "Connexa" }],
  });
  assert.equal(queryCalls, 1);
});

test("converts query errors and unexpected query exceptions into stable failures", async () => {
  const queryError = await listOrganizationsWithDependencies({
    authorize: async () => ({ authorized: true, userId: "admin-user-id" }),
    queryOrganizations: async () => ({ data: null, error: new Error("database detail") }),
  });
  const thrownError = await listOrganizationsWithDependencies({
    authorize: async () => ({ authorized: true, userId: "admin-user-id" }),
    queryOrganizations: async () => { throw new Error("secret database detail"); },
  });

  for (const result of [queryError, thrownError]) {
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, "ORGANIZATION_QUERY_FAILED");
      assert.equal(result.message.includes("secret"), false);
      assert.equal(result.message.includes("database detail"), false);
    }
  }
});
